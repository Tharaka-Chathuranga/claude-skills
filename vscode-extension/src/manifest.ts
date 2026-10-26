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
  /**
   * Follow the project: every module whose detect rule matches is used, and inside modules only the
   * skills whose own rule matches. The lists below are overrides on top of that.
   */
  autoDetect: boolean;
  /** Modules to use even when they aren't detected, per library. */
  modules: Record<string, string[]>;
  /** Modules to leave out even when detected or required, per library. */
  excludeModules: Record<string, string[]>;
  /** Skill or agent names to install even when their own detect rule doesn't match. */
  include: string[];
  /** Skill or agent names to leave out even though a chosen module contains them. */
  exclude: string[];
}

export interface ScopeLocation {
  base: vscode.Uri;
  /** The project folder, for workspace scope; nested placement is only possible there. */
  projectRoot?: vscode.Uri;
  skillsDir: vscode.Uri;
  agentsDir: vscode.Uri;
  manifestFile: vscode.Uri;
  lockFile: vscode.Uri;
}

export interface ModuleSelection {
  /** Listed in the manifest's `modules`. */
  direct: boolean;
  /** Chosen because it was detected in the project (auto mode). */
  detected: boolean;
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
    projectRoot: scope === 'workspace' ? folder : undefined,
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
  return {
    sources,
    autoDetect: raw.autoDetect === true,
    modules: readModuleLists(raw.modules),
    excludeModules: readModuleLists(raw.excludeModules),
    include: readNames(raw.include),
    exclude: readNames(raw.exclude),
  };
}

function readModuleLists(raw: unknown): Record<string, string[]> {
  const lists: Record<string, string[]> = {};
  for (const [id, list] of Object.entries((raw as Record<string, unknown>) ?? {})) {
    if (Array.isArray(list)) lists[id] = list.filter((item): item is string => typeof item === 'string');
  }
  return lists;
}

const readNames = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((name): name is string => typeof name === 'string') : [];

const nonEmpty = (lists: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(lists).filter(([, list]) => list.length > 0));

export function writeManifest(location: ScopeLocation, manifest: Manifest): Promise<void> {
  const sources = Object.fromEntries(
    Object.entries(manifest.sources).map(([id, source]) => [id, source.auth ? source : { url: source.url }]),
  );
  const modules = nonEmpty(manifest.modules);
  const excludeModules = nonEmpty(manifest.excludeModules);
  return writeJson(location.manifestFile, {
    sources,
    ...(manifest.autoDetect ? { autoDetect: true } : {}),
    ...(Object.keys(modules).length ? { modules } : {}),
    ...(Object.keys(excludeModules).length ? { excludeModules } : {}),
    ...(manifest.include.length ? { include: manifest.include } : {}),
    ...(manifest.exclude.length ? { exclude: manifest.exclude } : {}),
  });
}

export function manifestSources(manifest: Manifest): SkillSource[] {
  return Object.entries(manifest.sources).map(([id, source]) => ({ id, name: id, ...source }));
}

export function newManifest(sources: SkillSource[], autoDetect: boolean): Manifest {
  return {
    sources: Object.fromEntries(sources.map((source) => [source.id, { url: source.url, auth: source.auth }])),
    autoDetect,
    modules: {},
    excludeModules: {},
    include: [],
    exclude: [],
  };
}

export interface SelectionInput {
  /** Listed in the manifest. */
  direct: string[];
  /** Detected in the project (only used in auto mode). */
  detected: string[];
  /** Turned off; never selected, even when required. */
  excluded: Set<string>;
}

/** Chosen modules plus everything they require, transitively, within one library. */
export function resolveSelection(
  catalog: SourceCatalog,
  input: SelectionInput,
  problems: string[],
): Map<string, ModuleSelection> {
  const selection = new Map<string, ModuleSelection>();
  const visit = (id: string, reason: 'direct' | 'detected' | { requiredBy: string }) => {
    if (input.excluded.has(id)) return;
    const module = catalog.modules.get(id);
    if (!module) {
      const via = typeof reason === 'object' ? ` (required by ${reason.requiredBy})` : '';
      problems.push(`${catalog.source.name}: unknown module "${id}"${via}`);
      return;
    }
    let entry = selection.get(id);
    const isNew = !entry;
    entry ??= { direct: false, detected: false, requiredBy: new Set() };
    if (reason === 'direct') entry.direct = true;
    else if (reason === 'detected') entry.detected = true;
    else entry.requiredBy.add(reason.requiredBy);
    selection.set(id, entry);
    if (isNew) for (const required of module.requires) visit(required, { requiredBy: id });
  };
  input.direct.forEach((id) => visit(id, 'direct'));
  input.detected.forEach((id) => visit(id, 'detected'));
  return selection;
}
