#!/usr/bin/env node
/**
 * Code-health ratchet: per-file debt counts may go down, never up.
 *
 *   node scripts/quality/ratchet.mjs check <files...>   fail if any listed file got worse
 *   node scripts/quality/ratchet.mjs update             re-measure the repo and rewrite the baseline
 *   node scripts/quality/ratchet.mjs report [--top N]   print totals and the worst files
 *
 * Metrics come from quality.config.json: `maxFileLines` and every `forbiddenPatterns` entry.
 * A file not in the baseline is held to zero for every pattern and to `maxFileLines` for size.
 * A file already over the cap may not grow. Run `update` after paying debt down so the lower
 * number becomes the new ceiling.
 *
 * Legacy key names are read as aliases so a repo can adopt the kit without rewriting its
 * baseline: `lineCap` = `maxFileLines`, `i18nMissing` = `localesMissing`, metric `eslintDisable` =
 * `lintDisable`. `update` always writes the kit's names.
 *
 * Counting is line-based regex, not AST: cheap enough to scan a whole repo in seconds, and
 * consistent, which is all a file-against-its-own-past comparison needs. Node built-ins only.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_NAME = 'quality.config.json';
const DEFAULT_MAX_FILE_LINES = 400; // used only when the config omits maxFileLines

/** Legacy metric names → the kit's names, so older baselines and configs keep working. */
const METRIC_ALIASES = { eslintDisable: 'lintDisable' };
const canonicalMetric = (name) => METRIC_ALIASES[name] ?? name;

// ---------------------------------------------------------------------------
// Config

/** Reads quality.config.json from the repo root (cwd), falling back to the kit folder. */
export function loadConfig() {
  const candidates = [path.resolve(process.cwd(), CONFIG_NAME), path.join(KIT_DIR, CONFIG_NAME)];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) {
    throw new Error(
      `No ${CONFIG_NAME} found. Looked in: ${candidates.join(', ')}. Copy the template from the quality kit to the repo root.`
    );
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
  return {
    file,
    baseBranch: raw.baseBranch ?? 'origin/main',
    baseBranchFallbacks: raw.baseBranchFallbacks ?? ['main'],
    include: raw.include ?? [''],
    exclude: raw.exclude ?? ['node_modules/'],
    codeExtensions: raw.codeExtensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    maxFileLines: raw.maxFileLines ?? raw.lineCap ?? DEFAULT_MAX_FILE_LINES,
    forbiddenPatterns: (raw.forbiddenPatterns ?? []).map((entry) => ({
      ...entry,
      name: canonicalMetric(entry.name),
      regex: new RegExp(entry.pattern, 'g'),
    })),
    locales: raw.locales ?? null,
    layers: raw.layers ?? null,
    steps: raw.steps ?? [],
    baselinePath: raw.baselinePath
      ? path.resolve(process.cwd(), raw.baselinePath)
      : path.join(KIT_DIR, 'baseline.json'),
  };
}

export function metricNames(config) {
  return ['lines', ...config.forbiddenPatterns.map((entry) => entry.name)];
}

/** A file the ratchet and the code steps look at: included, not excluded, a code extension. */
export function isScopedCodeFile(file, config) {
  return (
    config.include.some((prefix) => file.startsWith(prefix)) &&
    config.codeExtensions.some((ext) => file.endsWith(ext)) &&
    !config.exclude.some((part) => file.includes(part))
  );
}

// ---------------------------------------------------------------------------
// Measuring

/** Non-blank, non-comment lines; approximates ESLint max-lines with skipBlankLines + skipComments. */
function countCodeLines(text) {
  let count = 0;
  let inBlock = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('#')) continue;
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    count += 1;
  }
  return count;
}

/** Returns only non-zero metrics, plus `lines` when the file is over the cap. null if deleted. */
export function measureFile(file, config) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const result = {};
  const lines = countCodeLines(text);
  if (lines > config.maxFileLines) result.lines = lines;
  for (const entry of config.forbiddenPatterns) {
    const matches = text.match(entry.regex);
    if (matches?.length) result[entry.name] = matches.length;
  }
  return result;
}

function listTrackedCodeFiles(config) {
  const out = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return out.split('\n').filter((file) => file && isScopedCodeFile(file, config));
}

// ---------------------------------------------------------------------------
// Locale parity (optional): every key in the source locale must exist in every other locale.

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) keys.push(...flattenKeys(value, keyPath));
    else keys.push(keyPath);
  }
  return keys;
}

/** { de: ['Namespace.key', ...] } for keys in the source locale missing elsewhere; {} when disabled. */
export function findMissingLocaleKeys(config) {
  const { locales } = config;
  if (!locales?.dir || !existsSync(locales.dir)) return {};
  const source = locales.source ?? 'en';
  const read = (locale) => JSON.parse(readFileSync(path.join(locales.dir, `${locale}.json`), 'utf8'));
  const sourceKeys = flattenKeys(read(source));
  const missing = {};
  for (const fileName of readdirSync(locales.dir).filter((name) => name.endsWith('.json'))) {
    const locale = fileName.replace(/\.json$/, '');
    if (locale === source) continue;
    const present = new Set(flattenKeys(read(locale)));
    missing[locale] = sourceKeys.filter((key) => !present.has(key)).sort();
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Baseline

export function loadBaseline(config) {
  if (!existsSync(config.baselinePath)) return { files: {}, localesMissing: {} };
  return normalizeBaseline(JSON.parse(readFileSync(config.baselinePath, 'utf8')));
}

/** Maps legacy baseline keys (lineCap, i18nMissing, eslintDisable) onto the kit's names. */
function normalizeBaseline(raw) {
  const { lineCap, i18nMissing, ...rest } = raw;
  const files = {};
  for (const [file, metrics] of Object.entries(raw.files ?? {})) {
    files[file] = {};
    for (const [name, count] of Object.entries(metrics)) {
      const key = canonicalMetric(name);
      files[file][key] = Math.max(files[file][key] ?? 0, count);
    }
  }
  return {
    ...rest,
    maxFileLines: raw.maxFileLines ?? lineCap,
    files,
    localesMissing: raw.localesMissing ?? i18nMissing ?? {},
  };
}

function buildBaseline(config) {
  const files = {};
  for (const file of listTrackedCodeFiles(config)) {
    const metrics = measureFile(file, config);
    if (metrics && Object.keys(metrics).length) files[file] = metrics;
  }
  return {
    generatedAt: new Date().toISOString(),
    maxFileLines: config.maxFileLines,
    files,
    localesMissing: findMissingLocaleKeys(config),
  };
}

function fixHint(config, metric) {
  if (metric === 'lines') return 'quality-gate (reference/split-oversized-file.md)';
  return config.forbiddenPatterns.find((entry) => entry.name === metric)?.fix ?? 'remove it';
}

/** Human-readable regressions for the given files. Empty array = pass. */
export function checkFiles(files, config, baseline = loadBaseline(config)) {
  const regressions = [];
  const cap = config.maxFileLines;
  for (const file of files.filter((f) => isScopedCodeFile(f, config))) {
    const current = measureFile(file, config);
    if (!current) continue;
    const before = baseline.files?.[file] ?? {};
    for (const metric of metricNames(config)) {
      const now = current[metric] ?? 0;
      if (metric === 'lines') {
        const ceiling = Math.max(cap, before.lines ?? 0);
        if (now <= ceiling) continue;
        regressions.push(
          before.lines
            ? `${file}: ${now} lines, was ${before.lines} (a file over ${cap} may not grow) → ${fixHint(config, metric)}`
            : `${file}: ${now} lines, over the ${cap}-line cap → ${fixHint(config, metric)}`
        );
        continue;
      }
      const was = before[metric] ?? 0;
      if (now > was) regressions.push(`${file}: ${metric} ${was} → ${now} → ${fixHint(config, metric)}`);
    }
  }
  return regressions;
}

export function checkLocales(config, baseline = loadBaseline(config)) {
  const regressions = [];
  for (const [locale, keys] of Object.entries(findMissingLocaleKeys(config))) {
    const known = new Set(baseline.localesMissing?.[locale] ?? []);
    const added = keys.filter((key) => !known.has(key));
    if (!added.length) continue;
    const sample = added.slice(0, 10).join(', ') + (added.length > 10 ? ', …' : '');
    regressions.push(`${config.locales.dir}/${locale}.json is missing ${added.length} key(s): ${sample}`);
  }
  return regressions;
}

// ---------------------------------------------------------------------------
// Commands

function report(config, top) {
  const { files, localesMissing } = buildBaseline(config);
  const names = metricNames(config);
  const totals = Object.fromEntries(names.map((name) => [name, 0]));
  for (const metrics of Object.values(files)) {
    for (const name of names) if (metrics[name]) totals[name] += name === 'lines' ? 1 : metrics[name];
  }
  console.log(`Files over ${config.maxFileLines} lines: ${totals.lines}`);
  for (const name of names.filter((n) => n !== 'lines')) console.log(`${name}: ${totals[name]}`);
  for (const [locale, keys] of Object.entries(localesMissing)) {
    if (keys.length) console.log(`locale ${locale}: ${keys.length} missing key(s)`);
  }
  for (const name of names) {
    const worst = Object.entries(files)
      .filter(([, metrics]) => metrics[name])
      .sort((a, b) => b[1][name] - a[1][name])
      .slice(0, top);
    if (!worst.length) continue;
    console.log(`\nTop ${worst.length} by ${name} (fix: ${fixHint(config, name)}):`);
    for (const [file, metrics] of worst) console.log(`  ${String(metrics[name]).padStart(5)}  ${file}`);
  }
}

const USAGE = `Usage:
  ratchet.mjs check <files...>   fail if any listed file got worse than its baseline
  ratchet.mjs update             re-measure tracked files and rewrite the baseline
  ratchet.mjs report [--top N]   totals and worst files per metric (default top 10)
  ratchet.mjs --help             this text
Config: ${CONFIG_NAME} in the repo root (maxFileLines, forbiddenPatterns, include, exclude, locales).`;

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE);
    return;
  }
  const config = loadConfig();
  if (command === 'update') {
    const baseline = buildBaseline(config);
    writeFileSync(config.baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Baseline written to ${path.relative(process.cwd(), config.baselinePath)}: ${Object.keys(baseline.files).length} file(s) with recorded debt.`);
    return;
  }
  if (command === 'report') {
    const topIndex = rest.indexOf('--top');
    report(config, topIndex >= 0 ? Number(rest[topIndex + 1]) || 10 : 10);
    return;
  }
  if (command === 'check') {
    const regressions = [...checkFiles(rest, config), ...checkLocales(config)];
    if (regressions.length) {
      console.error(`Ratchet failed: ${regressions.length} regression(s)`);
      for (const line of regressions) console.error(`  ✗ ${line}`);
      process.exit(1);
    }
    console.log('Ratchet passed.');
    return;
  }
  console.error(`Unknown command "${command}".\n${USAGE}`);
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`ratchet: ${err.message}`);
    process.exit(2);
  }
}
