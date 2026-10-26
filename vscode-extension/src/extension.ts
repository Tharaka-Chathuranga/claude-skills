import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { getBudgetWarningTokens, getShowAllModules } from './config';
import { Library } from './library';
import { followProject } from './suggest';
import { LibraryTree } from './tree';

// Writes by this extension trigger the same file watchers; ignore events this soon after one.
const OWN_WRITE_GRACE_MS = 3000;
// Installs and package-manager runs touch package.json in bursts; wait for them to settle.
const PROJECT_CHANGE_DEBOUNCE_MS = 1500;

function showBudget(view: vscode.TreeView<unknown>, library: Library): void {
  const { skills, agents, tokens } = library.budget();
  if (skills + agents === 0) {
    view.description = undefined;
    view.message = undefined;
    return;
  }
  view.description = `${skills} skills · ${agents} agents · ~${tokens} tokens/session`;
  view.message =
    tokens > getBudgetWarningTokens()
      ? `Skill descriptions add ~${tokens} tokens to every Claude session. Turn off modules or exclude skills you don't use.`
      : undefined;
}

const setShowAllContext = () =>
  vscode.commands.executeCommand('setContext', 'claudeSkills.showAll', getShowAllModules());

export function activate(context: vscode.ExtensionContext): void {
  const library = new Library();
  const tree = new LibraryTree(library);
  const view = vscode.window.createTreeView('claudeSkills.library', { treeDataProvider: tree, showCollapseAll: true });

  // One reaction at a time: a sync that is still writing must finish before the next re-check.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch((err) => console.error('Claude Skills', err));
  };
  const isOwnWrite = () => Date.now() - library.lastOwnWrite < OWN_WRITE_GRACE_MS;

  const reloadAndFollow = () =>
    enqueue(async () => {
      await library.reload();
      await followProject(context, library);
    });

  let projectTimer: NodeJS.Timeout | undefined;
  const onProjectFileChanged = (uri: vscode.Uri) => {
    if (uri.path.includes('/node_modules/')) return;
    clearTimeout(projectTimer);
    projectTimer = setTimeout(
      () =>
        enqueue(async () => {
          await library.refresh();
          await followProject(context, library);
        }),
      PROJECT_CHANGE_DEBOUNCE_MS,
    );
  };

  // A teammate's pull can change the manifest; follow it.
  const manifestWatcher = vscode.workspace.createFileSystemWatcher('**/.claude/skills.json');
  const onManifestChanged = () => {
    if (!isOwnWrite()) reloadAndFollow();
  };
  // New or removed dependencies change which modules and skills apply.
  const projectWatcher = vscode.workspace.createFileSystemWatcher('**/{package.json,pubspec.yaml}');

  context.subscriptions.push(
    library,
    tree,
    view,
    manifestWatcher,
    projectWatcher,
    manifestWatcher.onDidChange(onManifestChanged),
    manifestWatcher.onDidCreate(onManifestChanged),
    manifestWatcher.onDidDelete(onManifestChanged),
    projectWatcher.onDidChange(onProjectFileChanged),
    projectWatcher.onDidCreate(onProjectFileChanged),
    projectWatcher.onDidDelete(onProjectFileChanged),
    library.onDidChange(() => showBudget(view, library)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('claudeSkills.sources') || event.affectsConfiguration('claudeSkills.installScope')) {
        reloadAndFollow();
      } else if (event.affectsConfiguration('claudeSkills.showAllModules')) {
        void setShowAllContext();
        tree.refresh();
      } else if (event.affectsConfiguration('claudeSkills.budgetWarningTokens')) {
        showBudget(view, library);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(reloadAndFollow),
    { dispose: () => clearTimeout(projectTimer) },
  );

  registerCommands(context, library);
  void setShowAllContext();
  reloadAndFollow();
}

export function deactivate(): void {}
