import * as vscode from 'vscode';
import type { AgentEntry, ItemKind, SkillEntry, SourceCatalog } from './catalog';
import { readJson, writeJson, type ScopeLocation } from './manifest';

export interface LockItem {
  kind: ItemKind;
  name: string;
  source: string;
  module: string;
  version: string;
}

/** What this extension installed. Anything on disk that isn't listed here is left alone. */
export interface Lock {
  version: 1;
  items: Record<string, LockItem>;
}

export const itemKey = (kind: ItemKind, name: string) => `${kind}:${name}`;

export const emptyLock = (): Lock => ({ version: 1, items: {} });

export async function readLock(location: ScopeLocation): Promise<Lock> {
  const lock = await readJson<Lock>(location.lockFile);
  return lock && typeof lock.items === 'object' ? { version: 1, items: lock.items } : emptyLock();
}

export function writeLock(location: ScopeLocation, lock: Lock): Promise<void> {
  const items = Object.fromEntries(Object.entries(lock.items).sort(([a], [b]) => a.localeCompare(b)));
  return writeJson(location.lockFile, { version: 1, items });
}

async function readDirectory(dir: vscode.Uri): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(dir);
  } catch {
    return [];
  }
}

/** Skills and agents someone created by hand: present on disk but not in the lock. */
export async function listLocalItems(location: ScopeLocation, lock: Lock): Promise<Set<string>> {
  const local = new Set<string>();
  for (const [name, type] of await readDirectory(location.skillsDir)) {
    if (type === vscode.FileType.Directory && !lock.items[itemKey('skill', name)]) local.add(itemKey('skill', name));
  }
  for (const [file, type] of await readDirectory(location.agentsDir)) {
    const name = file.replace(/\.md$/, '');
    if (type === vscode.FileType.File && file.endsWith('.md') && !lock.items[itemKey('agent', name)]) {
      local.add(itemKey('agent', name));
    }
  }
  return local;
}

function itemUri(location: ScopeLocation, kind: ItemKind, name: string): vscode.Uri {
  return kind === 'skill'
    ? vscode.Uri.joinPath(location.skillsDir, name)
    : vscode.Uri.joinPath(location.agentsDir, `${name}.md`);
}

export function entryFileUri(location: ScopeLocation, kind: ItemKind, name: string): vscode.Uri {
  return kind === 'skill' ? vscode.Uri.joinPath(itemUri(location, kind, name), 'SKILL.md') : itemUri(location, kind, name);
}

export async function installItem(
  location: ScopeLocation,
  catalog: SourceCatalog,
  moduleId: string,
  kind: ItemKind,
  entry: SkillEntry | AgentEntry,
): Promise<LockItem> {
  const target = itemUri(location, kind, entry.name);

  if (kind === 'agent') {
    const bytes = await catalog.fetchModuleFile(moduleId, (entry as AgentEntry).file);
    await vscode.workspace.fs.createDirectory(location.agentsDir);
    await vscode.workspace.fs.writeFile(target, bytes);
  } else {
    // Download everything before touching the disk so a failed fetch leaves the old copy intact.
    const files = await Promise.all(
      (entry as SkillEntry).files.map(async (file) => ({
        file,
        bytes: await catalog.fetchModuleFile(moduleId, `${entry.name}/${file}`),
      })),
    );
    await vscode.workspace.fs.delete(target, { recursive: true, useTrash: false }).then(undefined, () => undefined);
    for (const { file, bytes } of files) {
      const fileUri = vscode.Uri.joinPath(target, ...file.split('/'));
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(fileUri, '..'));
      await vscode.workspace.fs.writeFile(fileUri, bytes);
    }
  }

  return { kind, name: entry.name, source: catalog.source.id, module: moduleId, version: entry.version };
}

export async function removeItem(location: ScopeLocation, item: LockItem): Promise<void> {
  await vscode.workspace.fs
    .delete(itemUri(location, item.kind, item.name), { recursive: true, useTrash: true })
    .then(undefined, () => undefined);
}
