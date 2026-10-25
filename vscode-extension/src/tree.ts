import * as vscode from 'vscode';
import type { AgentEntry, ItemKind, ModuleSummary, SkillEntry, SourceCatalog } from './catalog';
import { getInstallScope, getShowAllModules } from './config';
import type { ItemState, Library, ModuleState } from './library';

export type LibraryNode =
  | { kind: 'source'; catalog: SourceCatalog }
  | { kind: 'layer'; catalog: SourceCatalog; layer: string }
  | { kind: 'module'; catalog: SourceCatalog; module: ModuleSummary }
  | { kind: 'item'; catalog: SourceCatalog; moduleId: string; itemKind: ItemKind; entry: SkillEntry | AgentEntry }
  | { kind: 'message'; text: string; icon: string; tooltip?: string };

const LAYER_ORDER = ['core', 'languages', 'frontend', 'backend', 'data', 'mobile', 'testing', 'infra', 'company'];
const LAYER_ICON: Record<string, string> = {
  core: 'verified',
  languages: 'symbol-namespace',
  frontend: 'browser',
  backend: 'server',
  data: 'database',
  mobile: 'device-mobile',
  testing: 'beaker',
  infra: 'cloud',
  company: 'organization',
};

const MODULE_ICON: Record<ModuleState, string> = {
  added: 'pass-filled',
  required: 'link',
  detected: 'lightbulb',
  available: 'package',
};

const ITEM_DESCRIPTION: Record<ItemState, string> = {
  installed: 'installed',
  outdated: 'update available',
  pending: 'not installed yet',
  local: 'hand-made copy, not managed',
  excluded: 'excluded',
  available: '',
};

const ITEM_ICON: Record<ItemState, string> = {
  installed: 'check',
  outdated: 'arrow-circle-up',
  pending: 'cloud-download',
  local: 'file',
  excluded: 'circle-slash',
  available: 'circle-outline',
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export class LibraryTree implements vscode.TreeDataProvider<LibraryNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly library: Library) {
    this.subscription = library.onDidChange(() => this.changed.fire());
  }

  refresh(): void {
    this.changed.fire();
  }

  /** Modules the sidebar lists: everything when "show all" is on, otherwise only chosen or detected ones. */
  private visibleModules(catalog: SourceCatalog): ModuleSummary[] {
    const all = [...catalog.modules.values()];
    if (getShowAllModules()) return all;
    return all.filter((module) => this.library.moduleState(catalog, module.id) !== 'available');
  }

  private layersOf(catalog: SourceCatalog): LibraryNode[] {
    const layers = new Set(this.visibleModules(catalog).map((module) => module.layer));
    return [...layers]
      .sort((a, b) => (LAYER_ORDER.indexOf(a) + 1 || 99) - (LAYER_ORDER.indexOf(b) + 1 || 99))
      .map((layer) => ({ kind: 'layer', catalog, layer }));
  }

  async getChildren(node?: LibraryNode): Promise<LibraryNode[]> {
    if (!node) return this.rootNodes();
    switch (node.kind) {
      case 'source':
        return this.layersOf(node.catalog);
      case 'layer':
        return this.visibleModules(node.catalog)
          .filter((module) => module.layer === node.layer)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((module) => ({ kind: 'module', catalog: node.catalog, module }));
      case 'module': {
        try {
          const detail = await node.catalog.detail(node.module.id);
          return [
            ...detail.skills.map((entry): LibraryNode => ({
              kind: 'item', catalog: node.catalog, moduleId: detail.id, itemKind: 'skill', entry,
            })),
            ...detail.agents.map((entry): LibraryNode => ({
              kind: 'item', catalog: node.catalog, moduleId: detail.id, itemKind: 'agent', entry,
            })),
          ];
        } catch (err) {
          return [{ kind: 'message', text: err instanceof Error ? err.message : String(err), icon: 'warning' }];
        }
      }
      default:
        return [];
    }
  }

  getTreeItem(node: LibraryNode): vscode.TreeItem {
    const { Collapsed, Expanded, None } = vscode.TreeItemCollapsibleState;
    switch (node.kind) {
      case 'source': {
        const item = new vscode.TreeItem(node.catalog.source.name, Expanded);
        item.iconPath = new vscode.ThemeIcon('library');
        item.tooltip = node.catalog.source.url;
        return item;
      }
      case 'layer': {
        const item = new vscode.TreeItem(capitalize(node.layer), Expanded);
        item.iconPath = new vscode.ThemeIcon(LAYER_ICON[node.layer] ?? 'folder');
        return item;
      }
      case 'module': {
        const state = this.library.moduleState(node.catalog, node.module.id);
        const item = new vscode.TreeItem(node.module.name, Collapsed);
        item.description = this.moduleDescription(node.catalog, node.module, state);
        item.tooltip = new vscode.MarkdownString(
          `**${node.module.name}** \`${node.module.id}\`\n\n${node.module.description}\n\n` +
            `${node.module.skills.length} skills, ${node.module.agents.length} agents, ` +
            `~${node.module.listingTokens} tokens per session` +
            (node.module.requires.length ? `\n\nRequires: ${node.module.requires.join(', ')}` : ''),
        );
        item.iconPath = new vscode.ThemeIcon(MODULE_ICON[state]);
        item.contextValue = `module.${state}`;
        return item;
      }
      case 'item': {
        const state = this.library.itemState(node.catalog, node.itemKind, node.entry);
        const item = new vscode.TreeItem(node.entry.name, None);
        const kindLabel = node.itemKind === 'agent' ? 'agent' : (node.entry as SkillEntry).manualOnly ? 'command' : '';
        item.description = [kindLabel, ITEM_DESCRIPTION[state]].filter(Boolean).join(' · ');
        item.tooltip = new vscode.MarkdownString(node.entry.description);
        item.iconPath = new vscode.ThemeIcon(node.itemKind === 'agent' && state === 'available' ? 'hubot' : ITEM_ICON[state]);
        item.contextValue = `item.${state}`;
        if (state === 'installed' || state === 'outdated' || state === 'local') {
          item.command = { command: 'claudeSkills.openItem', title: 'Open', arguments: [node] };
        }
        return item;
      }
      case 'message': {
        const item = new vscode.TreeItem(node.text, None);
        item.iconPath = new vscode.ThemeIcon(node.icon);
        item.tooltip = node.tooltip ?? node.text;
        return item;
      }
    }
  }

  private moduleDescription(catalog: SourceCatalog, module: ModuleSummary, state: ModuleState): string {
    if (state === 'added') return 'added';
    if (state === 'required') return `required by ${this.library.requiredBy(catalog, module.id).join(', ')}`;
    if (state === 'detected') return 'detected in this project';
    return `${module.skills.length} skills`;
  }

  private rootNodes(): LibraryNode[] {
    const nodes: LibraryNode[] = this.library.problems.map((problem) => ({
      kind: 'message',
      text: problem,
      icon: 'warning',
    }));
    if (!this.library.location && getInstallScope() === 'workspace') {
      nodes.push({
        kind: 'message',
        text: 'Open a folder to add skills to it',
        icon: 'info',
        tooltip: 'Or set "claudeSkills.installScope" to "user" to install for every project.',
      });
    }
    if (this.library.catalogs.length === 0) {
      if (this.library.problems.length === 0) {
        nodes.push({ kind: 'message', text: 'Add a library in the "claudeSkills.sources" setting', icon: 'gear' });
      }
      return nodes;
    }

    const hidden = !getShowAllModules() && this.library.catalogs.every((catalog) => this.visibleModules(catalog).length === 0);
    if (hidden) {
      nodes.push({
        kind: 'message',
        text: 'Nothing detected yet. Use "Find Module", "Apply Preset" or "Show All Modules".',
        icon: 'search',
      });
    }
    // With a single library, skip the library level so layers sit at the top.
    if (this.library.catalogs.length === 1) return [...nodes, ...this.layersOf(this.library.catalogs[0])];
    return [...nodes, ...this.library.catalogs.map((catalog): LibraryNode => ({ kind: 'source', catalog }))];
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}
