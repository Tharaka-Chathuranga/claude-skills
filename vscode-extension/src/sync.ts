import type { AgentEntry, ItemKind, SkillEntry, SourceCatalog } from './catalog';
import { installItem, itemKey, removeItem, type Lock, type LockItem } from './installer';
import type { ModuleSelection, ScopeLocation } from './manifest';

export interface DesiredItem {
  key: string;
  kind: ItemKind;
  catalog: SourceCatalog;
  moduleId: string;
  entry: SkillEntry | AgentEntry;
}

/** Differences between what the manifest asks for and what the lock says is installed. */
export interface SyncPlan {
  desired: Map<string, DesiredItem>;
  install: DesiredItem[];
  update: DesiredItem[];
  remove: LockItem[];
  /** Wanted items blocked by a hand-made skill or agent with the same name. */
  conflicts: DesiredItem[];
}

export const emptyPlan = (): SyncPlan => ({ desired: new Map(), install: [], update: [], remove: [], conflicts: [] });

export const planHasChanges = (plan: SyncPlan) => plan.install.length + plan.update.length + plan.remove.length > 0;

export async function computePlan(
  selections: Map<SourceCatalog, Map<string, ModuleSelection>>,
  exclude: Set<string>,
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
        if (exclude.has(entry.name) || plan.desired.has(key)) continue;
        plan.desired.set(key, { key, kind, catalog, moduleId: detail.id, entry });
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
      installed.module !== item.moduleId
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
      next.items[item.key] = await installItem(location, item.catalog, item.moduleId, item.kind, item.entry);
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
