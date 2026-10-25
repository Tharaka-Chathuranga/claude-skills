import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { getAutoSuggest, getBudgetWarningTokens, getShowAllModules } from './config';
import { Library } from './library';
import { suggestOnOpen } from './suggest';
import { LibraryTree } from './tree';

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
      ? `Skill descriptions add ~${tokens} tokens to every Claude session. Exclude skills you rarely use, or remove modules you don't need.`
      : undefined;
}

const setShowAllContext = () =>
  vscode.commands.executeCommand('setContext', 'claudeSkills.showAll', getShowAllModules());

export function activate(context: vscode.ExtensionContext): void {
  const library = new Library();
  const tree = new LibraryTree(library);
  const view = vscode.window.createTreeView('claudeSkills.library', { treeDataProvider: tree, showCollapseAll: true });
  // A teammate's pull can change the manifest; reload so the sidebar and plan follow it.
  const manifestWatcher = vscode.workspace.createFileSystemWatcher('**/.claude/skills.json');
  const reload = () => void library.reload();

  context.subscriptions.push(
    library,
    tree,
    view,
    manifestWatcher,
    manifestWatcher.onDidChange(reload),
    manifestWatcher.onDidCreate(reload),
    manifestWatcher.onDidDelete(reload),
    library.onDidChange(() => showBudget(view, library)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('claudeSkills.sources') || event.affectsConfiguration('claudeSkills.installScope')) {
        reload();
      } else if (event.affectsConfiguration('claudeSkills.showAllModules')) {
        void setShowAllContext();
        tree.refresh();
      } else if (event.affectsConfiguration('claudeSkills.budgetWarningTokens')) {
        showBudget(view, library);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(reload),
  );

  registerCommands(context, library);
  void setShowAllContext();

  void library
    .reload()
    .then(() => (getAutoSuggest() ? suggestOnOpen(context, library) : undefined))
    .catch((err) => console.error('Claude Skills failed to load', err));
}

export function deactivate(): void {}
