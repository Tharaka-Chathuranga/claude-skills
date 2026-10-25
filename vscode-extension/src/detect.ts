import * as vscode from 'vscode';
import { isSafeRelativePath, type ModuleDetect } from './catalog';

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readDependencies(folder: vscode.Uri): Promise<Set<string>> {
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, 'package.json'));
    const pkg = JSON.parse(new TextDecoder().decode(raw));
    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  } catch {
    return new Set();
  }
}

/**
 * Returns a matcher for one project folder. A module matches when it is marked `always`, or when
 * every listed dependency is in the root package.json and every listed file exists.
 * Modules without detect rules never match; they arrive through `requires`.
 */
export async function createProjectMatcher(
  folder: vscode.Uri,
): Promise<(detect: ModuleDetect | undefined) => Promise<boolean>> {
  const dependencies = await readDependencies(folder);

  return async (detect) => {
    if (detect?.always) return true;
    const wantedDependencies = detect?.dependencies ?? [];
    const wantedFiles = detect?.files ?? [];
    if (wantedDependencies.length === 0 && wantedFiles.length === 0) return false;
    if (!wantedDependencies.every((name) => dependencies.has(name))) return false;

    for (const file of wantedFiles) {
      if (!isSafeRelativePath(file) || !(await exists(vscode.Uri.joinPath(folder, ...file.split('/'))))) {
        return false;
      }
    }
    return true;
  };
}
