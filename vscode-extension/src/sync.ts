import type { AgentEntry, ItemKind, SkillEntry, SourceCatalog } from './catalog';
import type { Detect } from './detect';
import { installItem, itemKey, removeItem, type Lock, type LockItem } from './installer';
import type { ModuleSelection, ScopeLocation } from './manifest';

export interface DesiredItem {
  key: string;
  kind: ItemKind;
  catalog: SourceCatalog;
  moduleId: string;
  entry: SkillEntry | AgentEntry;
  /** Project subfolder to install into (nested placement); absent means the project root. */
  dir?: string;
}

/** Differences between what the manifest asks for and what the lock says is installed. */
export interface SyncPlan {
  desired: Map<string, DesiredItem>;
  /** Items in chosen modules left out because their own detect rule doesn't match the project. */
  skipped: Map<string, DesiredItem>;
  install: DesiredItem[];
  update: DesiredItem[];
  remove: LockItem[];
  /** Wanted items blocked by a hand-made skill or agent with the same name. */
  conflicts: DesiredItem[];
}

export const emptyPlan = (): SyncPlan => ({
  desired: new Map(),
  skipped: new Map(),
  install: [],
  update: [],
  remove: [],
  conflicts: [],
});

export const planHasChanges = (plan: SyncPlan) => plan.install.length + plan.update.length + plan.remove.length > 0;

export interface PlanFilters {
  exclude: Set<string>;
  include: Set<string>;
  /** Whether a skill's own detect rule matches the project. */
  matches: (detect: Detect) => Promise<boolean>;
  /** Where an item installs: a project subfolder, or undefined for the root. */
  placementFor: (catalog: SourceCatalog, moduleId: string, kind: ItemKind, entry: SkillEntry | AgentEntry) => Promise<string | undefined>;
}

export async function computePlan(
  selections: Map<SourceCatalog, Map<string, ModuleSelection>>,
  filters: PlanFilters,
  lock: Lock,
  local: Set<string>,
): Promise<SyncPlan> {
  const plan = emptyPlan();

  for (const [catalog, selection] of selections) {
    const details = await Promise.all([...selection.keys()].map((id) => catalog.detail(id)));
    for (const detail of details) {
      const entries: Array<[ItemKind, SkillEntry | AgentEntry]> = [
        ...detail.skills.map((skill): [ItemKind, SkillEntry] => ['skill', skill]),
        ...detail.agents.map((agent): [ItemKind, AgentEntry] => ['agent', agent]),
      ];
      for (const [kind, entry] of entries) {
        const key = itemKey(kind, entry.name);
        // The first library listed wins when two libraries ship the same name.
        if (filters.exclude.has(entry.name) || plan.desired.has(key)) continue;
        const item = { key, kind, catalog, moduleId: detail.id, entry };
        const detect = (entry as SkillEntry).detect;
        if (detect && !filters.include.has(entry.name) && !(await filters.matches(detect))) {
          plan.skipped.set(key, item);
          continue;
        }
        plan.skipped.delete(key);
        const dir = await filters.placementFor(catalog, detail.id, kind, entry);
        plan.desired.set(key, dir ? { ...item, dir } : item);
      }
    }
  }

  for (const item of plan.desired.values()) {
    const installed = lock.items[item.key];
    if (local.has(item.key)) plan.conflicts.push(item);
    else if (!installed) plan.install.push(item);
    else if (
      installed.version !== item.entry.version ||
      installed.source !== item.catalog.source.id ||
      installed.module !== item.moduleId ||
      (installed.dir ?? '') !== (item.dir ?? '')
    ) {
      plan.update.push(item);
    }
  }
  plan.remove = Object.entries(lock.items)
    .filter(([key]) => !plan.desired.has(key))
    .map(([, item]) => item);

  return plan;
}

export async function applyPlan(
  location: ScopeLocation,
  plan: SyncPlan,
  lock: Lock,
  report: (message: string, increment: number) => void,
): Promise<{ lock: Lock; failures: string[] }> {
  const next: Lock = { version: 1, items: { ...lock.items } };
  const failures: string[] = [];
  const steps = plan.install.length + plan.update.length + plan.remove.length || 1;

  for (const item of [...plan.install, ...plan.update]) {
    report(item.entry.name, 100 / steps);
    try {
      const previous = next.items[item.key];
      // Moving between folders (placement changed): remove the old copy first.
      if (previous && (previous.dir ?? '') !== (item.dir ?? '')) await removeItem(location, previous);
      next.items[item.key] = await installItem(location, item.catalog, item.moduleId, item.kind, item.entry, item.dir);
    } catch (err) {
      failures.push(`${item.entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const item of plan.remove) {
    report(`removing ${item.name}`, 100 / steps);
    await removeItem(location, item);
    delete next.items[itemKey(item.kind, item.name)];
  }

  return { lock: next, failures };
}
