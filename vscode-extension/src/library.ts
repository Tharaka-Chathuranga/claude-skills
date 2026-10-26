import * as vscode from 'vscode';
import { loadCatalogs, type AgentEntry, type ItemKind, type SkillEntry, type SourceCatalog } from './catalog';
import { getInstallScope, getSettingsSources, type SkillSource } from './config';
import { ProjectInspector } from './detect';
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

export type ModuleState = 'added' | 'auto' | 'required' | 'off' | 'detected' | 'available';
export type ItemState = 'installed' | 'outdated' | 'pending' | 'skipped' | 'local' | 'excluded' | 'available';

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
  /** When this extension last wrote .claude files, so file watchers can ignore its own changes. */
  lastOwnWrite = 0;

  private loadProblems: string[] = [];
  private inspector: ProjectInspector | undefined;
  private detected = new Map<SourceCatalog, Set<string>>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  /** The manifest's libraries once a project has one; until then, the ones in settings. */
  get sources(): SkillSource[] {
    const fromManifest = this.manifest ? manifestSources(this.manifest) : [];
    return fromManifest.length ? fromManifest : getSettingsSources();
  }

  private get projectFolder(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  async reload(): Promise<void> {
    this.location = scopeLocation(getInstallScope(), this.projectFolder);
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

  /** Re-reads the project (dependencies, files, code) and recomputes what should be installed. */
  async refresh(): Promise<void> {
    const problems = [...this.loadProblems];
    const location = this.location;
    try {
      this.lock = location ? await readLock(location) : emptyLock();
    } catch (err) {
      this.lock = emptyLock();
      problems.push(err instanceof Error ? err.message : String(err));
    }
    await this.detectModules();
    this.local = location ? await listLocalItems(location, this.lock, await this.nestedDirs()) : new Set();

    this.selections = new Map();
    for (const catalog of this.catalogs) {
      const sourceId = catalog.source.id;
      const direct = this.manifest?.modules[sourceId] ?? [];
      const detected = this.manifest?.autoDetect ? [...(this.detected.get(catalog) ?? [])] : [];
      const excluded = new Set(this.manifest?.excludeModules[sourceId] ?? []);
      if (direct.length || detected.length) {
        this.selections.set(catalog, resolveSelection(catalog, { direct, detected, excluded }, problems));
      }
    }
    for (const sourceId of Object.keys(this.manifest?.modules ?? {})) {
      if (!this.catalogFor(sourceId) && this.manifest?.modules[sourceId].length) {
        problems.push(`skills.json lists modules for unknown library "${sourceId}"`);
      }
    }

    try {
      this.plan = await computePlan(
        this.selections,
        {
          exclude: new Set(this.manifest?.exclude ?? []),
          include: new Set(this.manifest?.include ?? []),
          matches: (detect) => this.inspector?.matches(detect) ?? Promise.resolve(false),
          placementFor: (catalog, moduleId, kind, entry) => this.placementFor(catalog, moduleId, kind, entry),
        },
        this.lock,
        this.local,
      );
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
    const folder = this.projectFolder;
    this.inspector = folder ? await ProjectInspector.create(folder.fsPath) : undefined;
    if (!this.inspector) return;
    for (const catalog of this.catalogs) {
      const ids = new Set<string>();
      for (const module of catalog.modules.values()) {
        if (await this.inspector.matches(module.detect)) ids.add(module.id);
      }
      this.detected.set(catalog, ids);
    }
  }

  /**
   * Where an item installs. Skills of a module with `placement` go into the first existing project
   * subfolder's .claude/skills/, so Claude Code loads them only when it works there. Agents and
   * command-only skills stay at the root so they are always available.
   */
  private async placementFor(
    catalog: SourceCatalog,
    moduleId: string,
    kind: ItemKind,
    entry: SkillEntry | AgentEntry,
  ): Promise<string | undefined> {
    if (kind !== 'skill' || (entry as SkillEntry).manualOnly || !this.location?.projectRoot || !this.inspector) return undefined;
    for (const dir of catalog.modules.get(moduleId)?.placement ?? []) {
      if (await this.inspector.exists(dir)) return dir;
    }
    return undefined;
  }

  /** Subfolders that may hold managed or hand-made nested skills. */
  private async nestedDirs(): Promise<string[]> {
    const dirs = new Set(Object.values(this.lock.items).map((item) => item.dir).filter((dir): dir is string => !!dir));
    for (const catalog of this.catalogs) {
      for (const module of catalog.modules.values()) {
        for (const dir of module.placement ?? []) if (await this.inspector?.exists(dir)) dirs.add(dir);
      }
    }
    return [...dirs];
  }

  catalogFor(sourceId: string): SourceCatalog | undefined {
    return this.catalogs.find((catalog) => catalog.source.id === sourceId);
  }

  isDetected(catalog: SourceCatalog, id: string): boolean {
    return this.detected.get(catalog)?.has(id) ?? false;
  }

  /** True when detection found something beyond the always-on core, i.e. this looks like a real project. */
  hasDetectedStack(): boolean {
    return this.catalogs.some((catalog) =>
      [...(this.detected.get(catalog) ?? [])].some((id) => !catalog.modules.get(id)?.detect?.always),
    );
  }

  moduleState(catalog: SourceCatalog, id: string): ModuleState {
    if (this.manifest?.excludeModules[catalog.source.id]?.includes(id)) return 'off';
    const selection = this.selections.get(catalog)?.get(id);
    if (selection?.direct) return 'added';
    if (selection?.detected) return 'auto';
    if (selection) return 'required';
    return this.isDetected(catalog, id) ? 'detected' : 'available';
  }

  requiredBy(catalog: SourceCatalog, id: string): string[] {
    return [...(this.selections.get(catalog)?.get(id)?.requiredBy ?? [])];
  }

  /** Detected modules not in use yet (manual mode, or turned on after the manifest was written). */
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
    if (ours) return 'pending';
    return this.plan.skipped.get(key)?.catalog === catalog ? 'skipped' : 'available';
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

  /** What adding these modules would install in this project, after per-skill detection. */
  async preview(catalog: SourceCatalog, ids: string[]): Promise<{ modules: number; skills: number; tokens: number }> {
    const already = this.selections.get(catalog) ?? new Map();
    const excluded = new Set(this.manifest?.excludeModules[catalog.source.id] ?? []);
    const resolved = resolveSelection(catalog, { direct: ids, detected: [], excluded }, []);
    const exclude = new Set(this.manifest?.exclude ?? []);
    const include = new Set(this.manifest?.include ?? []);
    let modules = 0;
    let skills = 0;
    let tokens = 0;
    for (const id of resolved.keys()) {
      if (already.has(id)) continue;
      modules++;
      for (const skill of (await catalog.detail(id)).skills) {
        if (exclude.has(skill.name) || this.plan.desired.has(itemKey('skill', skill.name))) continue;
        if (skill.detect && !include.has(skill.name) && !(await this.inspector?.matches(skill.detect))) continue;
        skills++;
        tokens += skill.listingTokens;
      }
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
  async editManifest(change: (manifest: Manifest) => void, { autoDetect = false } = {}): Promise<void> {
    const location = this.requireLocation();
    const manifest = this.manifest ?? newManifest(this.sources, autoDetect);
    change(manifest);
    this.lastOwnWrite = Date.now();
    await writeManifest(location, manifest);
    this.manifest = manifest;
    await this.refresh();
  }

  async sync(report: (message: string, increment: number) => void): Promise<{ changed: number; failures: string[] }> {
    const location = this.requireLocation();
    const changed = this.plan.install.length + this.plan.update.length + this.plan.remove.length;
    this.lastOwnWrite = Date.now();
    try {
      const result = await applyPlan(location, this.plan, this.lock, report);
      await writeLock(location, result.lock);
      return { changed: changed - result.failures.length, failures: result.failures };
    } finally {
      await this.refresh();
    }
  }

  /** Removes everything this extension installed, plus the manifest and lock file. */
  async teardown(): Promise<void> {
    const location = this.requireLocation();
    this.lastOwnWrite = Date.now();
    this.plan = { ...emptyPlan(), remove: Object.values(this.lock.items) };
    await applyPlan(location, this.plan, this.lock, () => undefined);
    for (const file of [location.manifestFile, location.lockFile]) {
      await vscode.workspace.fs.delete(file).then(undefined, () => undefined);
    }
    this.manifest = undefined;
    await this.reload();
  }

  dispose(): void {
    this.changed.dispose();
  }
}
