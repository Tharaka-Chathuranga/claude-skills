import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { SourceCatalog } from './catalog';
import { normalizeUrl, type InstallScope, type SkillSource } from './config';

export interface ManifestSource {
  url: string;
  auth?: 'github';
}

/** `.claude/skills.json`: the modules a project (or user) chose, committed so teammates get the same set. */
export interface Manifest {
  sources: Record<string, ManifestSource>;
  modules: Record<string, string[]>;
  /** Skill or agent names to leave out even though a chosen module contains them. */
  exclude: string[];
}

export interface ScopeLocation {
  base: vscode.Uri;
  skillsDir: vscode.Uri;
  agentsDir: vscode.Uri;
  manifestFile: vscode.Uri;
  lockFile: vscode.Uri;
}

export interface ModuleSelection {
  /** Chosen in the manifest, rather than only pulled in by another module. */
  direct: boolean;
  requiredBy: Set<string>;
}

export function scopeLocation(scope: InstallScope, folder: vscode.Uri | undefined): ScopeLocation | undefined {
  const base =
    scope === 'user'
      ? vscode.Uri.file(path.join(os.homedir(), '.claude'))
      : folder && vscode.Uri.joinPath(folder, '.claude');
  if (!base) return undefined;
  return {
    base,
    skillsDir: vscode.Uri.joinPath(base, 'skills'),
    agentsDir: vscode.Uri.joinPath(base, 'agents'),
    manifestFile: vscode.Uri.joinPath(base, 'skills.json'),
    lockFile: vscode.Uri.joinPath(base, 'claude-skills.lock.json'),
  };
}

export async function readJson<T>(uri: vscode.Uri): Promise<T | undefined> {
  let raw: Uint8Array;
  try {
    raw = await vscode.workspace.fs.readFile(uri);
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  } catch {
    throw new Error(`${vscode.workspace.asRelativePath(uri)} is not valid JSON`);
  }
}

export async function writeJson(uri: vscode.Uri, value: unknown): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}

export async function readManifest(location: ScopeLocation): Promise<Manifest | undefined> {
  const raw = await readJson<Partial<Manifest>>(location.manifestFile);
  if (!raw) return undefined;

  const sources: Record<string, ManifestSource> = {};
  for (const [id, source] of Object.entries(raw.sources ?? {})) {
    if (typeof source?.url === 'string') {
      sources[id] = { url: normalizeUrl(source.url), auth: source.auth === 'github' ? 'github' : undefined };
    }
  }
  const modules: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(raw.modules ?? {})) {
    if (Array.isArray(list)) modules[id] = list.filter((item): item is string => typeof item === 'string');
  }
  const exclude = Array.isArray(raw.exclude) ? raw.exclude.filter((name) => typeof name === 'string') : [];
  return { sources, modules, exclude };
}

export function writeManifest(location: ScopeLocation, manifest: Manifest): Promise<void> {
  const sources = Object.fromEntries(
    Object.entries(manifest.sources).map(([id, source]) => [id, source.auth ? source : { url: source.url }]),
  );
  return writeJson(location.manifestFile, {
    sources,
    modules: manifest.modules,
    ...(manifest.exclude.length ? { exclude: manifest.exclude } : {}),
  });
}

export function manifestSources(manifest: Manifest): SkillSource[] {
  return Object.entries(manifest.sources).map(([id, source]) => ({ id, name: id, ...source }));
}

export function newManifest(sources: SkillSource[]): Manifest {
  return {
    sources: Object.fromEntries(sources.map((source) => [source.id, { url: source.url, auth: source.auth }])),
    modules: {},
    exclude: [],
  };
}

/** Chosen modules plus everything they require, transitively, within one library. */
export function resolveSelection(
  catalog: SourceCatalog,
  chosen: string[],
  problems: string[],
): Map<string, ModuleSelection> {
  const selection = new Map<string, ModuleSelection>();
  const visit = (id: string, requiredBy?: string) => {
    const module = catalog.modules.get(id);
    if (!module) {
      problems.push(`${catalog.source.name}: unknown module "${id}"${requiredBy ? ` (required by ${requiredBy})` : ''}`);
      return;
    }
    const existing = selection.get(id);
    if (existing) {
      if (requiredBy) existing.requiredBy.add(requiredBy);
      else existing.direct = true;
      return;
    }
    selection.set(id, { direct: !requiredBy, requiredBy: new Set(requiredBy ? [requiredBy] : []) });
    for (const required of module.requires) visit(required, id);
  };
  for (const id of chosen) visit(id);
  return selection;
}
