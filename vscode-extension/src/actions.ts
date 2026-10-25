import * as vscode from 'vscode';
import type { SourceCatalog } from './catalog';
import { getInstallScope } from './config';
import type { Library } from './library';
import { planHasChanges } from './sync';

export function guarded<A extends unknown[]>(run: (...args: A) => unknown): (...args: A) => Promise<void> {
  return async (...args) => {
    try {
      await run(...args);
    } catch (err) {
      vscode.window.showErrorMessage(`Claude Skills: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

export const formatList = (names: string[], max = 4) =>
  names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;

/** Installs, updates and removes files so the disk matches the manifest. */
export async function syncNow(library: Library, { quiet = false } = {}): Promise<void> {
  if (!planHasChanges(library.plan)) {
    if (!quiet) vscode.window.showInformationMessage('Claude skills are up to date.');
    return;
  }

  const { changed, failures } = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Syncing Claude skills' },
    (progress) => library.sync((message, increment) => progress.report({ message, increment })),
  );

  if (failures.length) {
    vscode.window.showWarningMessage(
      `Synced ${changed} item(s); ${failures.length} failed: ${formatList(failures, 2)}`,
    );
    return;
  }
  const { skills, agents, tokens } = library.budget();
  const commitHint = getInstallScope() === 'workspace' ? ' Commit the .claude folder so teammates get them too.' : '';
  vscode.window.showInformationMessage(
    `Claude skills synced: ${skills} skills, ${agents} agents, ~${tokens} tokens per session.${commitHint}`,
  );
}

export async function addModules(library: Library, catalog: SourceCatalog, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await library.editManifest((manifest) => {
    const { id, url, auth } = catalog.source;
    manifest.sources[id] ??= { url, auth };
    const chosen = (manifest.modules[id] ??= []);
    for (const moduleId of ids) if (!chosen.includes(moduleId)) chosen.push(moduleId);
    chosen.sort();
  });
  await syncNow(library);
}

/** Multi-select picker over a library's modules, with `preselected` ticked. */
export async function pickModules(
  library: Library,
  catalog: SourceCatalog,
  ids: string[],
  preselected: string[] = ids,
): Promise<string[] | undefined> {
  const picks = await vscode.window.showQuickPick(
    ids.map((id) => {
      const module = catalog.modules.get(id);
      return {
        label: module?.name ?? id,
        description: `${id} · ${module?.skills.length ?? 0} skills · ~${module?.listingTokens ?? 0} tokens`,
        detail: module?.description,
        picked: preselected.includes(id),
        id,
      };
    }),
    { canPickMany: true, matchOnDescription: true, matchOnDetail: true, title: `Modules from ${catalog.source.name}` },
  );
  return picks?.map((pick) => pick.id);
}
