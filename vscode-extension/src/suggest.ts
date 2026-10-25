import * as vscode from 'vscode';
import { addModules, formatList, pickModules, syncNow } from './actions';
import type { Library } from './library';

const DISMISSED_KEY = 'claudeSkills.dismissedModules';

/** Offers detected modules that the manifest doesn't have yet, one prompt per library. */
export async function suggestModules(
  context: vscode.ExtensionContext,
  library: Library,
  { quiet }: { quiet: boolean },
): Promise<void> {
  const dismissed = new Set(context.workspaceState.get<string[]>(DISMISSED_KEY, []));
  let offered = false;

  for (const catalog of library.catalogs) {
    const ids = library
      .suggestedModules(catalog)
      .filter((id) => !(quiet && dismissed.has(`${catalog.source.id}:${id}`)));
    if (ids.length === 0) continue;
    offered = true;

    const names = ids.map((id) => catalog.modules.get(id)?.name ?? id);
    const estimate = library.estimate(catalog, ids);
    const choice = await vscode.window.showInformationMessage(
      `Detected ${formatList(names)}. Add ${estimate.modules} Claude skill modules ` +
        `(${estimate.skills} skills, ~${estimate.tokens} tokens per session, including required modules)?`,
      'Add',
      'Choose…',
      "Don't ask again",
    );

    if (choice === 'Add') {
      await addModules(library, catalog, ids);
    } else if (choice === 'Choose…') {
      const picked = await pickModules(library, catalog, ids);
      if (picked) await addModules(library, catalog, picked);
    } else if (choice === "Don't ask again") {
      for (const id of ids) dismissed.add(`${catalog.source.id}:${id}`);
      await context.workspaceState.update(DISMISSED_KEY, [...dismissed]);
    }
  }

  if (!offered && !quiet) vscode.window.showInformationMessage('No new modules detected for this project.');
}

/** On startup: install what a committed manifest asks for, then offer anything newly detected. */
export async function suggestOnOpen(context: vscode.ExtensionContext, library: Library): Promise<void> {
  const { install, update } = library.plan;
  if (library.manifest && install.length > 0) {
    const choice = await vscode.window.showInformationMessage(
      `This project uses Claude skill modules. Install ${install.length} skill(s) and agent(s) now?`,
      'Install',
      'Later',
    );
    if (choice === 'Install') await syncNow(library);
    return;
  }
  if (library.manifest && update.length > 0) {
    const choice = await vscode.window.showInformationMessage(
      `${update.length} Claude skill update(s) available.`,
      'Update',
      'Later',
    );
    if (choice === 'Update') await syncNow(library);
  }
  await suggestModules(context, library, { quiet: true });
}
