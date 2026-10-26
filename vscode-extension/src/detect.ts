import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * When a module or skill applies to a project. Every key that is set must hold; `anyOf` holds when
 * at least one of its rules does. A rule with no keys never matches (use `always`).
 */
export interface Detect {
  always?: boolean;
  /** All of these packages are dependencies in some package.json of the project. */
  dependencies?: string[];
  /** At least one of these packages is a dependency. A trailing `*` matches a scope (`@ai-sdk/*`). */
  anyDependencies?: string[];
  /** All of these paths (files or folders, relative to the project root) exist. */
  files?: string[];
  /** At least one of these paths exists. */
  anyFiles?: string[];
  /** All of these npm scripts exist in some package.json. */
  scripts?: string[];
  /** At least one file matching `glob` has a line matching the regular expression `pattern`. */
  contains?: Array<{ glob: string; pattern: string }>;
  anyOf?: Detect[];
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '.amplify', '.turbo', '.cache', '.vercel', '.svelte-kit',
  'dist', 'build', 'out', 'coverage', 'tmp', '.dart_tool', 'Pods',
]);
const PACKAGE_JSON_DEPTH = 3;
// Bounds keep detection fast in very large repos; past them, `contains` rules just see fewer files.
const MAX_SCANNED_FILES = 20000;
const MAX_FILE_BYTES = 512 * 1024;

export function isSafeRelativePath(relPath: string): boolean {
  if (!relPath || relPath.startsWith('/') || relPath.includes('\\')) return false;
  return relPath.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** Supports `**`, `*`, `?` and `{a,b}`; matches project-relative posix paths. */
export function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      const slashAfter = glob[i + 2] === '/';
      source += slashAfter ? '(?:.*/)?' : '.*';
      i += slashAfter ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '{') source += '(?:';
    else if (char === '}') source += ')';
    else if (char === ',') source += '|';
    else source += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function listDir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Facts about one project folder, gathered once and reused for every rule. */
export class ProjectInspector {
  private files: Promise<string[]> | undefined;
  private readonly existsCache = new Map<string, Promise<boolean>>();
  private readonly containsCache = new Map<string, Promise<boolean>>();

  private constructor(
    readonly root: string,
    private readonly dependencies: Set<string>,
    private readonly scripts: Set<string>,
  ) {}

  /** Reads every package.json down to a shallow depth, so monorepo packages count too. */
  static async create(root: string): Promise<ProjectInspector> {
    const dependencies = new Set<string>();
    const scripts = new Set<string>();
    const visit = async (dir: string, depth: number) => {
      const pkg = await readJson(path.join(dir, 'package.json'));
      if (pkg) {
        for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
          Object.keys((pkg[field] as Record<string, string>) ?? {}).forEach((name) => dependencies.add(name));
        }
        Object.keys((pkg.scripts as Record<string, string>) ?? {}).forEach((name) => scripts.add(name));
      }
      if (depth >= PACKAGE_JSON_DEPTH) return;
      for (const entry of await listDir(dir)) {
        if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await visit(path.join(dir, entry.name), depth + 1);
        }
      }
    };
    await visit(root, 0);
    return new ProjectInspector(root, dependencies, scripts);
  }

  hasDependency(name: string): boolean {
    if (name.endsWith('*')) {
      const prefix = name.slice(0, -1);
      return [...this.dependencies].some((dependency) => dependency.startsWith(prefix));
    }
    return this.dependencies.has(name);
  }

  private exists(relPath: string): Promise<boolean> {
    if (!isSafeRelativePath(relPath)) return Promise.resolve(false);
    let cached = this.existsCache.get(relPath);
    if (!cached) {
      cached = fs.stat(path.join(this.root, ...relPath.split('/'))).then(() => true, () => false);
      this.existsCache.set(relPath, cached);
    }
    return cached;
  }

  private listFiles(): Promise<string[]> {
    this.files ??= (async () => {
      const found: string[] = [];
      const queue = [''];
      while (queue.length && found.length < MAX_SCANNED_FILES) {
        const rel = queue.shift() as string;
        for (const entry of await listDir(path.join(this.root, rel))) {
          const child = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) queue.push(child);
          else if (entry.isFile()) found.push(child);
        }
      }
      return found;
    })();
    return this.files;
  }

  private contains(glob: string, pattern: string): Promise<boolean> {
    const key = `${glob}\0${pattern}`;
    let cached = this.containsCache.get(key);
    if (!cached) {
      cached = (async () => {
        let matcher: RegExp;
        try {
          matcher = new RegExp(pattern, 'm');
        } catch {
          return false;
        }
        const fileMatcher = globToRegExp(glob);
        for (const rel of (await this.listFiles()).filter((file) => fileMatcher.test(file))) {
          const file = path.join(this.root, ...rel.split('/'));
          try {
            if ((await fs.stat(file)).size > MAX_FILE_BYTES) continue;
            if (matcher.test(await fs.readFile(file, 'utf8'))) return true;
          } catch {
            // Unreadable file: treat as not matching.
          }
        }
        return false;
      })();
      this.containsCache.set(key, cached);
    }
    return cached;
  }

  async matches(detect: Detect | undefined): Promise<boolean> {
    if (!detect) return false;
    if (detect.always) return true;
    const { dependencies, anyDependencies, files, anyFiles, scripts, contains, anyOf } = detect;
    const checks: Array<() => Promise<boolean> | boolean> = [];

    if (dependencies?.length) checks.push(() => dependencies.every((name) => this.hasDependency(name)));
    if (anyDependencies?.length) checks.push(() => anyDependencies.some((name) => this.hasDependency(name)));
    if (scripts?.length) checks.push(() => scripts.every((name) => this.scripts.has(name)));
    if (files?.length) {
      checks.push(async () => (await Promise.all(files.map((file) => this.exists(file)))).every(Boolean));
    }
    if (anyFiles?.length) {
      checks.push(async () => (await Promise.all(anyFiles.map((file) => this.exists(file)))).some(Boolean));
    }
    if (contains?.length) {
      checks.push(async () => {
        for (const rule of contains) if (await this.contains(rule.glob, rule.pattern)) return true;
        return false;
      });
    }
    if (anyOf?.length) {
      checks.push(async () => {
        for (const rule of anyOf) if (await this.matches(rule)) return true;
        return false;
      });
    }

    if (checks.length === 0) return false;
    // Cheap checks are listed first, so a failing dependency check skips file scans.
    for (const check of checks) if (!(await check())) return false;
    return true;
  }
}
