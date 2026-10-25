import * as vscode from 'vscode';
import { loadCatalogs, type AgentEntry, type ItemKind, type SkillEntry, type SourceCatalog } from './catalog';
import { getInstallScope, getSettingsSources, type SkillSource } from './config';
import { createProjectMatcher } from './detect';
import { emptyLock, itemKey, listLocalItems, readLock, writeLock, type Lock } from './installer';
import {
  manifestSources,
  newManifest,
  readManifest,
  resolveSelection,
  scopeLocation,
  writeManifest,
  type Manifest,
  type ModuleSelection,
  type ScopeLocation,
} from './manifest';
import { applyPlan, computePlan, emptyPlan, type SyncPlan } from './sync';

export type ModuleState = 'added' | 'required' | 'detected' | 'available';
export type ItemState = 'installed' | 'outdated' | 'pending' | 'local' | 'excluded' | 'available';

/** Everything the UI shows: libraries, the manifest, what's installed, and what would change on sync. */
export class Library implements vscode.Disposable {
  location: ScopeLocation | undefined;
  manifest: Manifest | undefined;
  catalogs: SourceCatalog[] = [];
  problems: string[] = [];
  lock: Lock = emptyLock();
  local = new Set<string>();
  selections = new Map<SourceCatalog, Map<string, ModuleSelection>>();
  plan: SyncPlan = emptyPlan();

  private loadProblems: string[] = [];
  private detected = new Map<SourceCatalog, Set<string>>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  /** The manifest's libraries once a project has one; until then, the ones in settings. */
  get sources(): SkillSource[] {
    const fromManifest = this.manifest ? manifestSources(this.manifest) : [];
    return fromManifest.length ? fromManifest : getSettingsSources();
  }

  async reload(): Promise<void> {
    this.location = scopeLocation(getInstallScope(), vscode.workspace.workspaceFolders?.[0]?.uri);
    this.loadProblems = [];
    try {
      this.manifest = this.location && (await readManifest(this.location));
    } catch (err) {
      this.manifest = undefined;
      this.loadProblems.push(err instanceof Error ? err.message : String(err));
    }
    const { catalogs, problems } = await loadCatalogs(this.sources);
    this.catalogs = catalogs;
    this.loadProblems.push(...problems);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const problems = [...this.loadProblems];
    const location = this.location;
    try {
      this.lock = location ? await readLock(location) : emptyLock();
    } catch (err) {
      this.lock = emptyLock();
      problems.push(err instanceof Error ? err.message : String(err));
    }
    this.local = location ? await listLocalItems(location, this.lock) : new Set();
    await this.detectModules();

    this.selections = new Map();
    for (const [sourceId, chosen] of Object.entries(this.manifest?.modules ?? {})) {
      const catalog = this.catalogFor(sourceId);
      if (catalog) this.selections.set(catalog, resolveSelection(catalog, chosen, problems));
      else if (chosen.length) problems.push(`skills.json lists modules for unknown library "${sourceId}"`);
    }

    try {
      this.plan = await computePlan(this.selections, new Set(this.manifest?.exclude ?? []), this.lock, this.local);
    } catch (err) {
      this.plan = emptyPlan();
      problems.push(`Could not read module details: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const conflict of this.plan.conflicts) {
      problems.push(`"${conflict.entry.name}" exists as a hand-made ${conflict.kind}; rename it or exclude it`);
    }
    this.problems = problems;
    this.changed.fire();
  }

  private async detectModules(): Promise<void> {
    this.detected = new Map();
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folder) return;
    const matches = await createProjectMatcher(folder);
    for (const catalog of this.catalogs) {
      const ids = new Set<string>();
      for (const module of catalog.modules.values()) {
        if (await matches(module.detect)) ids.add(module.id);
      }
      this.detected.set(catalog, ids);
    }
  }

  catalogFor(sourceId: string): SourceCatalog | undefined {
    return this.catalogs.find((catalog) => catalog.source.id === sourceId);
  }

  moduleState(catalog: SourceCatalog, id: string): ModuleState {
    const selection = this.selections.get(catalog)?.get(id);
    if (selection?.direct) return 'added';
    if (selection) return 'required';
    return this.detected.get(catalog)?.has(id) ? 'detected' : 'available';
  }

  requiredBy(catalog: SourceCatalog, id: string): string[] {
    return [...(this.selections.get(catalog)?.get(id)?.requiredBy ?? [])];
  }

  /** Detected modules that aren't in the manifest yet, with their dependencies resolved. */
  suggestedModules(catalog: SourceCatalog): string[] {
    return [...(this.detected.get(catalog) ?? [])].filter((id) => this.moduleState(catalog, id) === 'detected');
  }

  itemState(catalog: SourceCatalog, kind: ItemKind, entry: SkillEntry | AgentEntry): ItemState {
    const key = itemKey(kind, entry.name);
    if (this.local.has(key)) return 'local';
    if (this.manifest?.exclude.includes(entry.name)) return 'excluded';

    const desired = this.plan.desired.get(key);
    const ours = desired?.catalog === catalog;
    const installed = this.lock.items[key];
    if (installed?.source === catalog.source.id) {
      return ours && installed.version !== entry.version ? 'outdated' : 'installed';
    }
    return ours ? 'pending' : 'available';
  }

  /** Estimated tokens the chosen skills' descriptions add to every Claude session. */
  budget(): { skills: number; agents: number; tokens: number } {
    let skills = 0;
    let agents = 0;
    let tokens = 0;
    for (const item of this.plan.desired.values()) {
      if (item.kind === 'agent') {
        agents++;
        continue;
      }
      skills++;
      tokens += (item.entry as SkillEntry).listingTokens ?? 0;
    }
    return { skills, agents, tokens };
  }

  /** Index-only estimate for modules not chosen yet, including what they require. */
  estimate(catalog: SourceCatalog, ids: string[]): { modules: number; skills: number; tokens: number } {
    const already = this.selections.get(catalog) ?? new Map();
    const resolved = resolveSelection(catalog, ids, []);
    let skills = 0;
    let tokens = 0;
    let modules = 0;
    for (const id of resolved.keys()) {
      if (already.has(id)) continue;
      const module = catalog.modules.get(id);
      if (!module) continue;
      modules++;
      skills += module.skills.length;
      tokens += module.listingTokens;
    }
    return { modules, skills, tokens };
  }

  requireLocation(): ScopeLocation {
    if (!this.location) {
      throw new Error('Open a folder to add skills to it, or set "claudeSkills.installScope" to "user".');
    }
    return this.location;
  }

  /** Changes the manifest (creating it from the current libraries if needed) and recomputes the plan. */
  async editManifest(change: (manifest: Manifest) => void): Promise<void> {
    const location = this.requireLocation();
    const manifest = this.manifest ?? newManifest(this.sources);
    change(manifest);
    await writeManifest(location, manifest);
    this.manifest = manifest;
    await this.refresh();
  }

  async sync(report: (message: string, increment: number) => void): Promise<{ changed: number; failures: string[] }> {
    const location = this.requireLocation();
    const changed = this.plan.install.length + this.plan.update.length + this.plan.remove.length;
    try {
      const result = await applyPlan(location, this.plan, this.lock, report);
      await writeLock(location, result.lock);
      return { changed: changed - result.failures.length, failures: result.failures };
    } finally {
      await this.refresh();
    }
  }

  dispose(): void {
    this.changed.dispose();
  }
}
