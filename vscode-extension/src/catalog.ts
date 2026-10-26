import * as vscode from 'vscode';
import type { SkillSource } from './config';
import { isSafeRelativePath, type Detect } from './detect';

export { isSafeRelativePath };

export interface ModuleSummary {
  id: string;
  layer: string;
  name: string;
  description: string;
  detect?: Detect;
  requires: string[];
  /**
   * Project subfolders (first existing wins) whose own .claude/skills/ receives this module's skills,
   * so Claude Code loads them only when it works in that folder.
   */
  placement?: string[];
  version: string;
  skills: string[];
  agents: string[];
  /** Estimated tokens the module's skill descriptions add to every Claude session. */
  listingTokens: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  modules: string[];
}

export interface SkillEntry {
  name: string;
  description: string;
  version: string;
  files: string[];
  manualOnly: boolean;
  listingTokens: number;
  /** Install only when the project matches; absent means always, within a chosen module. */
  detect?: Detect;
}

export interface AgentEntry {
  name: string;
  description: string;
  version: string;
  file: string;
}

export interface ModuleDetail {
  id: string;
  version: string;
  skills: SkillEntry[];
  agents: AgentEntry[];
}

export type ItemKind = 'skill' | 'agent';

const ITEM_NAME = /^[a-z0-9][a-z0-9-]*$/;
const MODULE_ID = /^[a-z]+\/[a-z0-9][a-z0-9-]*$/;

async function requestHeaders(source: SkillSource): Promise<Record<string, string>> {
  if (source.auth !== 'github') return {};
  const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
  return { Authorization: `Bearer ${session.accessToken}` };
}

export async function fetchBytes(source: SkillSource, relPath: string): Promise<Uint8Array> {
  const url = `${source.url}/${relPath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, { headers: await requestHeaders(source) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} fetching ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchJson(source: SkillSource, relPath: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await fetchBytes(source, relPath)));
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseModules(raw: unknown, problems: string[], sourceName: string): ModuleSummary[] {
  if (!Array.isArray(raw)) throw new Error('catalog/index.json must contain a "modules" array');
  return raw.filter((module: Partial<ModuleSummary>) => {
    const valid =
      typeof module?.id === 'string' &&
      MODULE_ID.test(module.id) &&
      typeof module.version === 'string' &&
      isStringArray(module.requires) &&
      isStringArray(module.skills) &&
      isStringArray(module.agents);
    if (!valid) problems.push(`${sourceName}: skipped invalid module "${module?.id}"`);
    return valid;
  }) as ModuleSummary[];
}

function parseDetail(json: unknown, id: string): ModuleDetail {
  const data = json as Partial<ModuleDetail> | null;
  if (!data || !Array.isArray(data.skills) || !Array.isArray(data.agents)) {
    throw new Error(`catalog entry for ${id} is malformed`);
  }
  const skills = data.skills.filter(
    (skill) =>
      ITEM_NAME.test(skill?.name ?? '') &&
      isStringArray(skill.files) &&
      skill.files.includes('SKILL.md') &&
      skill.files.every(isSafeRelativePath),
  );
  const agents = data.agents.filter(
    (agent) => ITEM_NAME.test(agent?.name ?? '') && agent.file === `agents/${agent.name}.md`,
  );
  return { id, version: data.version ?? '', skills, agents };
}

/** One library: its small index up front, module details fetched on first use. */
export class SourceCatalog {
  readonly modules: Map<string, ModuleSummary>;
  private readonly details = new Map<string, Promise<ModuleDetail>>();

  constructor(
    readonly source: SkillSource,
    modules: ModuleSummary[],
    readonly presets: Preset[],
  ) {
    this.modules = new Map(modules.map((module) => [module.id, module]));
  }

  detail(id: string): Promise<ModuleDetail> {
    const summary = this.modules.get(id);
    if (!summary) return Promise.reject(new Error(`${this.source.name} has no module "${id}"`));

    const key = `${id}@${summary.version}`;
    let pending = this.details.get(key);
    if (!pending) {
      pending = fetchJson(this.source, `catalog/modules/${id}.json`).then((json) => parseDetail(json, id));
      this.details.set(key, pending);
      pending.catch(() => this.details.delete(key));
    }
    return pending;
  }

  fetchModuleFile(moduleId: string, relPath: string): Promise<Uint8Array> {
    return fetchBytes(this.source, `${moduleId}/${relPath}`);
  }
}

export async function loadCatalogs(
  sources: SkillSource[],
): Promise<{ catalogs: SourceCatalog[]; problems: string[] }> {
  const problems: string[] = [];
  const results = await Promise.all(
    sources.map(async (source): Promise<SourceCatalog | undefined> => {
      try {
        const index = (await fetchJson(source, 'catalog/index.json')) as { modules?: unknown; presets?: unknown };
        const presets = Array.isArray(index.presets)
          ? (index.presets as Preset[]).filter((preset) => typeof preset?.id === 'string' && isStringArray(preset.modules))
          : [];
        return new SourceCatalog(source, parseModules(index.modules, problems, source.name), presets);
      } catch (err) {
        problems.push(`${source.name}: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    }),
  );
  return { catalogs: results.filter((catalog): catalog is SourceCatalog => catalog !== undefined), problems };
}
