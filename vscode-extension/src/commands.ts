import * as vscode from 'vscode';
import { addModules, guarded, pickModules, syncNow } from './actions';
import { setShowAllModules } from './config';
import { entryFileUri } from './installer';
import type { Library } from './library';
import { setUpProject, suggestModules } from './suggest';
import type { LibraryNode } from './tree';

async function removeModule(library: Library, node: LibraryNode | undefined): Promise<void> {
  if (node?.kind !== 'module') return;
  const { catalog, module } = node;
  if (library.moduleState(catalog, module.id) !== 'added') {
    await setModuleOff(library, node, true);
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `Remove ${module.name}? Its skills are deleted unless another chosen module needs them.`,
    { modal: true },
    'Remove',
  );
  if (choice !== 'Remove') return;
  await library.editManifest((manifest) => {
    manifest.modules[catalog.source.id] = (manifest.modules[catalog.source.id] ?? []).filter((id) => id !== module.id);
  });
  await syncNow(library);
}

/** Turns a module off for the project (or back on): it stays off even when detected or required. */
async function setModuleOff(library: Library, node: LibraryNode | undefined, off: boolean): Promise<void> {
  if (node?.kind !== 'module') return;
  const { catalog, module } = node;
  const sourceId = catalog.source.id;
  if (off) {
    const requiredBy = library.requiredBy(catalog, module.id);
    const warning = requiredBy.length ? ` ${requiredBy.join(', ')} require it, so some of their guidance may refer to it.` : '';
    const choice = await vscode.window.showWarningMessage(
      `Turn off ${module.name} for this project? Its skills are removed.${warning}`,
      { modal: true },
      'Turn Off',
    );
    if (choice !== 'Turn Off') return;
  }
  await library.editManifest((manifest) => {
    const list = (manifest.excludeModules[sourceId] ?? []).filter((id) => id !== module.id);
    if (off) list.push(module.id);
    manifest.excludeModules[sourceId] = list.sort();
    if (off) manifest.modules[sourceId] = (manifest.modules[sourceId] ?? []).filter((id) => id !== module.id);
  });
  await syncNow(library, { quiet: true });
}

/** Excludes an item, or brings back an excluded one / installs a skipped one anyway. */
async function setExcluded(library: Library, node: LibraryNode | undefined, excluded: boolean): Promise<void> {
  if (node?.kind !== 'item') return;
  const name = node.entry.name;
  const skipped = library.itemState(node.catalog, node.itemKind, node.entry) === 'skipped';
  await library.editManifest((manifest) => {
    manifest.exclude = manifest.exclude.filter((existing) => existing !== name);
    manifest.include = manifest.include.filter((existing) => existing !== name);
    if (excluded) manifest.exclude.push(name);
    else if (skipped) manifest.include.push(name);
    manifest.exclude.sort();
    manifest.include.sort();
  });
  await syncNow(library, { quiet: true });
}

async function findModule(library: Library): Promise<void> {
  const picks = library.catalogs.flatMap((catalog) =>
    [...catalog.modules.values()].map((module) => ({
      label: module.name,
      description: `${module.id} · ${library.moduleState(catalog, module.id)}`,
      detail: `${module.description} (${module.skills.length} skills, ~${module.listingTokens} tokens)`,
      catalog,
      module,
    })),
  );
  const pick = await vscode.window.showQuickPick(picks, {
    title: 'Find a skill module',
    placeHolder: 'Type a technology, e.g. amplify, react, testing',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (pick) await addModules(library, pick.catalog, [pick.module.id]);
}

async function applyPreset(library: Library): Promise<void> {
  const picks = library.catalogs.flatMap((catalog) =>
    catalog.presets.map((preset) => ({
      label: preset.name,
      description: `${preset.modules.length} modules`,
      detail: preset.description,
      catalog,
      preset,
    })),
  );
  if (picks.length === 0) {
    vscode.window.showInformationMessage('None of your libraries define presets.');
    return;
  }
  const pick = await vscode.window.showQuickPick(picks, { title: 'Apply a preset', matchOnDetail: true });
  if (!pick) return;
  const chosen = await pickModules(library, pick.catalog, pick.preset.modules);
  if (chosen) await addModules(library, pick.catalog, chosen);
}

export function registerCommands(context: vscode.ExtensionContext, library: Library): void {
  const register = <A extends unknown[]>(id: string, run: (...args: A) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, guarded(run)));

  register('claudeSkills.refresh', () => library.reload());
  register('claudeSkills.sync', () => syncNow(library));
  register('claudeSkills.suggest', () => suggestModules(context, library, { quiet: false }));
  register('claudeSkills.findModule', () => findModule(library));
  register('claudeSkills.applyPreset', () => applyPreset(library));
  register('claudeSkills.showAllModules', () => setShowAllModules(true));
  register('claudeSkills.showRelevantModules', () => setShowAllModules(false));

  register('claudeSkills.addModule', (node?: LibraryNode) => {
    if (node?.kind === 'module') return addModules(library, node.catalog, [node.module.id]);
  });
  register('claudeSkills.removeModule', (node?: LibraryNode) => removeModule(library, node));
  register('claudeSkills.turnOffModule', (node?: LibraryNode) => setModuleOff(library, node, true));
  register('claudeSkills.turnOnModule', (node?: LibraryNode) => setModuleOff(library, node, false));
  register('claudeSkills.setUpProject', () => setUpProject(context, library));
  register('claudeSkills.removeAll', async () => {
    const choice = await vscode.window.showWarningMessage(
      'Remove every skill and agent Claude Skills installed in this project, plus skills.json and the lock file? Hand-made skills are kept.',
      { modal: true },
      'Remove All',
    );
    if (choice === 'Remove All') await library.teardown();
  });
  register('claudeSkills.excludeItem', (node?: LibraryNode) => setExcluded(library, node, true));
  register('claudeSkills.includeItem', (node?: LibraryNode) => setExcluded(library, node, false));

  register('claudeSkills.openItem', async (node?: LibraryNode) => {
    if (node?.kind !== 'item') return;
    await vscode.window.showTextDocument(entryFileUri(library.requireLocation(), node.itemKind, node.entry.name));
  });

  register('claudeSkills.openManifest', async () => {
    const location = library.requireLocation();
    if (!library.manifest) {
      vscode.window.showInformationMessage('No skills.json yet. Add a module and it will be created.');
      return;
    }
    await vscode.window.showTextDocument(location.manifestFile);
  });
}
