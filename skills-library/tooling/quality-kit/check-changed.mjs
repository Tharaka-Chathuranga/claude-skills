#!/usr/bin/env node
/**
 * The single quality gate, run over every file changed on this branch (committed, staged,
 * unstaged and untracked) compared with the base branch.
 *
 *   npm run quality                         full gate against config.baseBranch
 *   npm run quality -- --base origin/dev    compare against another ref
 *   npm run quality -- --skip lint,test     skip named steps while iterating (never on the final run)
 *   npm run quality -- --only ratchet       run only the named steps
 *
 * Steps come from quality.config.json `steps`, in order. A step is skipped, with the reason
 * printed, when its preconditions don't hold (requiresFile, requiresPackage, requiresScript,
 * onlyIfChanged, onlyIfCodeChanged, enabled:false) — so a project without, say, infrastructure
 * templates simply never runs that step. Blocking steps fail the run; `advisory: true` steps
 * print findings but never fail it. Node built-ins only.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { checkFiles, checkLocales, isScopedCodeFile, loadConfig } from './ratchet.mjs';

const USAGE = `Usage: check-changed.mjs [--base <ref>] [--skip a,b] [--only a,b] [--help]
Steps and base branch come from quality.config.json in the repo root.`;

function parseArgs(argv) {
  const args = { base: null, skip: new Set(), only: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') args.help = true;
    else if (flag === '--base') args.base = argv[++i];
    else if (flag === '--skip') argv[++i]?.split(',').forEach((s) => args.skip.add(s.trim()));
    else if (flag === '--only') args.only = new Set(argv[++i]?.split(',').map((s) => s.trim()));
    else throw new Error(`Unknown option "${flag}".\n${USAGE}`);
  }
  return args;
}

function git(command) {
  return execSync(`git ${command}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function resolveBase(explicit, config) {
  const candidates = explicit ? [explicit] : [config.baseBranch, ...config.baseBranchFallbacks];
  for (const ref of candidates) {
    try {
      return { ref, sha: git(`merge-base HEAD ${ref}`) };
    } catch {
      // ref missing locally; try the next candidate
    }
  }
  throw new Error(`No merge base with ${candidates.join(' or ')}. Fetch the base branch or pass --base <ref>.`);
}

function changedFiles(baseSha) {
  const lists = [
    git(`diff --name-only --diff-filter=ACMR ${baseSha}...HEAD`),
    git('diff --name-only --diff-filter=ACMR HEAD'),
    git('ls-files --others --exclude-standard'),
  ];
  return [...new Set(lists.join('\n').split('\n').filter(Boolean))].filter((f) => existsSync(f)).sort();
}

function readPackageJson() {
  try {
    return JSON.parse(readFileSync('package.json', 'utf8'));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Built-in boundary check: imports may only point to the same or a lower layer, and slices of
// an `isolated` layer may reach each other only through the slice's index file.

const IMPORT_RE = /(?:^|[^\w.])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w.])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

function resolveImport(fromFile, specifier, aliases) {
  if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  for (const [alias, target] of Object.entries(aliases ?? {})) {
    if (specifier.startsWith(alias)) return path.posix.normalize(target + specifier.slice(alias.length));
  }
  return null; // a package import; not the boundary check's concern
}

function locate(file, layers) {
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const root = layer.paths.find((prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix));
    if (!root) continue;
    const rest = file.slice(root.length).replace(/^\//, '');
    const slice = rest.includes('/') ? rest.split('/')[0] : null;
    return { index, layer, root, slice, restInSlice: slice ? rest.slice(slice.length + 1) : rest };
  }
  return null;
}

const isSliceIndex = (rest) => rest === '' || /^index(\.[a-z]+)?$/.test(rest);

function checkBoundaries(files, config) {
  const layers = config.layers?.order ?? [];
  if (!layers.length) return [];
  const violations = [];
  for (const file of files) {
    const from = locate(file, layers);
    if (!from) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      const target = resolveImport(file, specifier, config.layers.aliases);
      const to = target && locate(target, layers);
      if (!to) continue;
      if (to.index < from.index) {
        violations.push(`${file}: imports '${specifier}' (${from.layer.name} → ${to.layer.name}: upward) → fix-import-boundary`);
      } else if (
        to.index === from.index && from.layer.isolated && from.slice && to.slice &&
        from.slice !== to.slice && !isSliceIndex(to.restInSlice)
      ) {
        violations.push(`${file}: imports '${specifier}' (internals of ${from.layer.name}/${to.slice}; use its index or move it down) → fix-import-boundary`);
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Steps

function skipReason(step, ctx) {
  if (step.enabled === false) return 'disabled in config';
  if (step.requiresFile && !existsSync(step.requiresFile)) return `no ${step.requiresFile}`;
  if (step.requiresPackage) {
    const { dependencies = {}, devDependencies = {} } = ctx.pkg;
    if (!(step.requiresPackage in dependencies) && !(step.requiresPackage in devDependencies)) {
      return `${step.requiresPackage} not in package.json`;
    }
  }
  if (step.requiresScript && !ctx.pkg.scripts?.[step.requiresScript]) return `no "${step.requiresScript}" npm script`;
  if (step.onlyIfChanged && !ctx.files.some((f) => step.onlyIfChanged.some((prefix) => f.startsWith(prefix)))) {
    return `nothing changed under ${step.onlyIfChanged.join(', ')}`;
  }
  if (step.onlyIfCodeChanged && !ctx.code.length) return 'no code files changed';
  return null;
}

function stepFiles(step, ctx) {
  const pool = step.passAllChanged ? ctx.files : ctx.code;
  return step.paths ? pool.filter((f) => step.paths.some((prefix) => f.startsWith(prefix))) : pool;
}

function runBuiltin(step, ctx) {
  if (step.builtin === 'ratchet') {
    console.log(`\n▶ ${step.name}: line cap ${ctx.config.maxFileLines}, forbidden patterns, locale parity`);
    const problems = [...checkFiles(ctx.code, ctx.config), ...checkLocales(ctx.config)];
    for (const line of problems) console.error(`  ✗ ${line}`);
    if (!problems.length) console.log('  ✓ no file got worse');
    return problems.length === 0;
  }
  if (step.builtin === 'boundaries') {
    console.log(`\n▶ ${step.name}: layer imports (${(ctx.config.layers?.order ?? []).map((l) => l.name).join(' → ') || 'no layers configured'})`);
    const problems = checkBoundaries(ctx.code, ctx.config);
    for (const line of problems) console.error(`  ✗ ${line}`);
    if (!problems.length) console.log('  ✓ no boundary violations');
    return problems.length === 0;
  }
  throw new Error(`Unknown builtin "${step.builtin}" in step "${step.name}". Known: ratchet, boundaries.`);
}

function runCommand(step, ctx) {
  const args = [...step.run.slice(1)];
  if (step.passFiles) {
    const files = stepFiles(step, ctx);
    if (!files.length) {
      console.log(`\n▷ ${step.name}: skipped (no matching changed files)`);
      return null;
    }
    args.push(...files);
  }
  const shown = args.length > 12 ? [...args.slice(0, 12), `… (+${args.length - 12})`] : args;
  console.log(`\n▶ ${step.name}${step.advisory ? ' (advisory)' : ''}\n  $ ${[step.run[0], ...shown].join(' ')}`);
  const result = spawnSync(step.run[0], args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) console.error(`  could not start ${step.run[0]}: ${result.error.message}`);
  return result.status === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const config = loadConfig();
  const base = resolveBase(args.base, config);
  const files = changedFiles(base.sha);
  const code = files.filter((f) => isScopedCodeFile(f, config));
  const ctx = { config, files, code, pkg: readPackageJson() };

  console.log(`Changed vs ${base.ref} (${base.sha.slice(0, 9)}): ${files.length} file(s), ${code.length} code`);
  if (!files.length) {
    console.log('Nothing to check.\nQuality gate: PASSED (no changes)');
    return;
  }

  const failed = [];
  const advisory = [];
  const skipped = [];
  for (const step of config.steps) {
    if (args.skip.has(step.name) || (args.only && !args.only.has(step.name))) {
      skipped.push(`${step.name} (by flag)`);
      continue;
    }
    const reason = skipReason(step, ctx);
    if (reason) {
      skipped.push(`${step.name} (${reason})`);
      continue;
    }
    const ok = step.builtin ? runBuiltin(step, ctx) : runCommand(step, ctx);
    if (ok === false) (step.advisory ? advisory : failed).push(step.name);
  }

  console.log('\n──────── Quality gate ────────');
  if (skipped.length) console.log(`Skipped: ${skipped.join(', ')}`);
  if (advisory.length) console.log(`Advisory findings (not blocking): ${advisory.join(', ')}`);
  if (failed.length) {
    console.error(`Quality gate: FAILED (${failed.join(', ')})`);
    process.exit(1);
  }
  console.log('Quality gate: PASSED');
}

try {
  main();
} catch (err) {
  console.error(`quality gate: ${err.message}`);
  process.exit(2);
}
