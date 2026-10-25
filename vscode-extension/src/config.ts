import * as vscode from 'vscode';

export interface SkillSource {
  /** Key used for this library in the project manifest and the lock file. */
  id: string;
  name: string;
  /** Base URL of a library; catalog/ and the module folders live under it. */
  url: string;
  /** "github" sends the user's GitHub token, which private repos need. */
  auth?: 'github';
}

export type InstallScope = 'workspace' | 'user';

const settings = () => vscode.workspace.getConfiguration('claudeSkills');

export const toSourceId = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'library';

export const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

/** Libraries from user/workspace settings; used until a project manifest names its own. */
export function getSettingsSources(): SkillSource[] {
  const sources: SkillSource[] = [];
  for (const entry of settings().get<Array<Partial<SkillSource>>>('sources', [])) {
    if (typeof entry?.url !== 'string' || entry.url.trim() === '') continue;
    const url = normalizeUrl(entry.url);
    const name = entry.name || url;
    let id = toSourceId(name);
    while (sources.some((source) => source.id === id)) id = `${id}-2`;
    sources.push({ id, name, url, auth: entry.auth === 'github' ? 'github' : undefined });
  }
  return sources;
}

export function getInstallScope(): InstallScope {
  return settings().get<InstallScope>('installScope', 'workspace');
}

export function getAutoSuggest(): boolean {
  return settings().get<boolean>('autoSuggest', true);
}

export function getBudgetWarningTokens(): number {
  return settings().get<number>('budgetWarningTokens', 3000);
}

export function getShowAllModules(): boolean {
  return settings().get<boolean>('showAllModules', false);
}

export async function setShowAllModules(value: boolean): Promise<void> {
  await settings().update('showAllModules', value, vscode.ConfigurationTarget.Global);
}
