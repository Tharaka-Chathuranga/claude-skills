import * as vscode from 'vscode';
import { addModules, formatList, pickModules, syncNow } from './actions';
import { getInstallScope, getSetupMode } from './config';
import type { Library } from './library';
import { planHasChanges } from './sync';

const DISMISSED_KEY = 'claudeSkills.dismissedModules';
const SETUP_DECLINED_KEY = 'claudeSkills.setupDeclined';

/** Names of the stack modules (not the always-on core) the project uses, for messages. */
function stackNames(library: Library): string[] {
  const names: string[] = [];
  for (const [catalog, selection] of library.selections) {
    for (const [id, entry] of selection) {
      const module = catalog.modules.get(id);
      if (module && entry.detected && !module.detect?.always) names.push(module.name);
    }
  }
  return names;
}

/** Creates a manifest that follows detection and installs the matching skills. */
export async function setUpProject(context: vscode.ExtensionContext, library: Library): Promise<void> {
  await library.editManifest(
    (manifest) => {
      manifest.autoDetect = true;
    },
    { autoDetect: true },
  );
  await syncNow(library, { quiet: true });
  await context.workspaceState.update(SETUP_DECLINED_KEY, false);

  const { skills, tokens } = library.budget();
  const commitHint = getInstallScope() === 'workspace' ? ' Commit the .claude folder to share them.' : '';
  const choice = await vscode.window.showInformationMessage(
    `Claude Skills set up ${skills} skills for ${formatList(stackNames(library)) || 'this project'} ` +
      `(~${tokens} tokens per session).${commitHint}`,
    'Review',
    'Undo',
  );
  if (choice === 'Review') await vscode.commands.executeCommand('claudeSkills.library.focus');
  if (choice === 'Undo') {
    await library.teardown();
    await context.workspaceState.update(SETUP_DECLINED_KEY, true);
  }
}

/**
 * Runs on startup and whenever the project changes (dependencies, manifest). New projects are set up
 * from detection; existing ones are brought in line with their manifest. How much it asks first
 * depends on `claudeSkills.setupMode`.
 */
export async function followProject(context: vscode.ExtensionContext, library: Library): Promise<void> {
  const mode = getSetupMode();
  if (!library.location || mode === 'manual') return;

  if (!library.manifest) {
    // Only set up folders that look like a real project, and never one where the user said no.
    if (!library.hasDetectedStack() || context.workspaceState.get<boolean>(SETUP_DECLINED_KEY)) return;
    if (mode === 'ask') {
      const choice = await vscode.window.showInformationMessage(
        'Set up Claude skills for this project? Only skills that match its stack are installed, and they ' +
          'follow the project as dependencies change.',
        'Set Up',
        'Not for This Project',
      );
      if (choice === 'Not for This Project') await context.workspaceState.update(SETUP_DECLINED_KEY, true);
      if (choice !== 'Set Up') return;
    }
    await setUpProject(context, library);
    return;
  }

  if (!planHasChanges(library.plan)) return;
  const { install, update, remove } = library.plan;
  const summary = [
    install.length && `+${install.length}`,
    update.length && `${update.length} updated`,
    remove.length && `−${remove.length}`,
  ]
    .filter(Boolean)
    .join(', ');

  if (mode === 'auto') {
    await syncNow(library, { quiet: true });
    vscode.window.setStatusBarMessage(`$(sparkle) Claude skills updated (${summary})`, 8000);
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    `Claude skills for this project changed (${summary}). Apply now?`,
    'Apply',
    'Later',
  );
  if (choice === 'Apply') await syncNow(library);
}

/** Offers detected modules that aren't in use yet, one prompt per library (manual manifests). */
export async function suggestModules(
  context: vscode.ExtensionContext,
  library: Library,
  { quiet }: { quiet: boolean },
): Promise<void> {
  if (!library.manifest && library.hasDetectedStack()) {
    await setUpProject(context, library);
    return;
  }
  const dismissed = new Set(context.workspaceState.get<string[]>(DISMISSED_KEY, []));
  let offered = false;

  for (const catalog of library.catalogs) {
    const ids = library
      .suggestedModules(catalog)
      .filter((id) => !(quiet && dismissed.has(`${catalog.source.id}:${id}`)));
    if (ids.length === 0) continue;
    offered = true;

    const names = ids.map((id) => catalog.modules.get(id)?.name ?? id);
    const preview = await library.preview(catalog, ids);
    const choice = await vscode.window.showInformationMessage(
      `Detected ${formatList(names)}. Add ${preview.modules} modules ` +
        `(${preview.skills} matching skills, ~${preview.tokens} tokens per session)?`,
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

  if (!offered && !quiet) vscode.window.showInformationMessage('Nothing new detected for this project.');
}
