#!/usr/bin/env node
// Validates every module and writes catalog/. The VS Code extension reads only catalog/,
// so run this after any change to a module, skill, agent or preset. See FORMAT.md.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogDir = path.join(root, 'catalog');
const LAYERS = ['core', 'languages', 'frontend', 'backend', 'data', 'mobile', 'testing', 'infra', 'company'];
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const RESERVED_WORDS = /claude|anthropic/;
const XML_TAG = /<\/?[A-Za-z][^>]*>/;
const errors = [];
const warnings = [];

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), rel)));
    else if (entry.isFile()) files.push(rel);
  }
  return files.sort();
}

async function subdirectories(dir) {
  if (!(await exists(dir))) return [];
  return (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

function readFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, '')]),
  );
}

async function hashFiles(dir, files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file).update('\0').update(await readFile(path.join(dir, file))).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

// Rough cost of one entry in Claude Code's skill listing: name + description at ~4 characters per token.
const listingTokens = (name, description) => Math.ceil((name.length + description.length) / 4) + 15;

/** Hard limits from Anthropic's skill spec; see AUTHORING.md section 2. */
function checkMetadata(label, frontmatter, expectedName) {
  const { name = '', description = '' } = frontmatter;
  if (name !== expectedName) errors.push(`${label}: frontmatter name must be "${expectedName}"`);
  if (!NAME.test(expectedName)) errors.push(`${label}: names use lowercase letters, digits and dashes only`);
  if (expectedName.length > 64) errors.push(`${label}: name must be 64 characters or fewer`);
  if (RESERVED_WORDS.test(expectedName)) errors.push(`${label}: name must not contain "claude" or "anthropic"`);
  if (!description || /^[>|]/.test(description)) errors.push(`${label}: frontmatter needs a one-line description`);
  if (description.length > 1024) errors.push(`${label}: description is ${description.length} characters (max 1024)`);
  if (XML_TAG.test(description)) errors.push(`${label}: description must not contain XML tags`);
  if (description && !/\buse (it |this )?(when|for|before|after|whenever)\b/i.test(description)) {
    warnings.push(`${label}: description has no "Use when ..." clause, so Claude may not know when to trigger it`);
  }
}

async function buildSkill(moduleDir, moduleId, name) {
  const dir = path.join(moduleDir, name);
  const label = `${moduleId}/${name}`;
  const files = await listFiles(dir);
  const skillMd = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
  const frontmatter = readFrontmatter(skillMd);
  checkMetadata(label, frontmatter, name);

  const lineCount = skillMd.split(/\r?\n/).length;
  if (lineCount > 500) errors.push(`${label}: SKILL.md is ${lineCount} lines (max 500); move detail into reference files`);
  for (const file of files.filter((f) => f.endsWith('.md') && f !== 'SKILL.md')) {
    const lines = (await readFile(path.join(dir, file), 'utf8')).split(/\r?\n/);
    if (lines.length > 100 && !lines.slice(0, 30).some((line) => /^#{1,3}\s*(table of )?contents\b/i.test(line))) {
      warnings.push(`${label}/${file}: over 100 lines with no "Contents" section at the top`);
    }
  }

  const manualOnly = /^(true|yes|on|1)$/i.test(frontmatter['disable-model-invocation'] ?? '');
  const description = frontmatter.description ?? '';
  return {
    name,
    description,
    version: await hashFiles(dir, files),
    files,
    manualOnly,
    listingTokens: manualOnly ? 0 : listingTokens(name, description),
  };
}

async function buildAgent(moduleDir, moduleId, file) {
  const name = file.replace(/\.md$/, '');
  const text = await readFile(path.join(moduleDir, 'agents', file), 'utf8');
  checkMetadata(`${moduleId}/agents/${file}`, readFrontmatter(text), name);
  return {
    name,
    description: readFrontmatter(text).description ?? '',
    version: await hashFiles(path.join(moduleDir, 'agents'), [file]),
    file: `agents/${file}`,
  };
}

async function buildModule(layer, moduleName) {
  const id = `${layer}/${moduleName}`;
  const dir = path.join(root, layer, moduleName);
  let config;
  try {
    config = JSON.parse(await readFile(path.join(dir, 'module.json'), 'utf8'));
  } catch (err) {
    errors.push(`${id}: module.json is missing or not valid JSON (${err.message})`);
    return null;
  }
  if (!NAME.test(moduleName)) errors.push(`${id}: module folder names use lowercase letters, digits and dashes`);
  if (typeof config.name !== 'string' || typeof config.description !== 'string') {
    errors.push(`${id}: module.json needs "name" and "description"`);
  }

  const skills = [];
  for (const name of await subdirectories(dir)) {
    if (name === 'agents') continue;
    if (await exists(path.join(dir, name, 'SKILL.md'))) skills.push(await buildSkill(dir, id, name));
    else errors.push(`${id}/${name}: folder has no SKILL.md`);
  }
  const agentFiles = (await exists(path.join(dir, 'agents')))
    ? (await readdir(path.join(dir, 'agents'))).filter((file) => file.endsWith('.md')).sort()
    : [];
  const agents = await Promise.all(agentFiles.map((file) => buildAgent(dir, id, file)));
  if (skills.length === 0 && agents.length === 0) errors.push(`${id}: module has no skills or agents`);

  const version = createHash('sha256')
    .update([...skills, ...agents].map((item) => `${item.name}@${item.version}`).join(','))
    .digest('hex')
    .slice(0, 12);

  return {
    summary: {
      id,
      layer,
      name: config.name ?? id,
      description: config.description ?? '',
      ...(config.detect ? { detect: config.detect } : {}),
      requires: config.requires ?? [],
      version,
      skills: skills.map((skill) => skill.name),
      agents: agents.map((agent) => agent.name),
      listingTokens: skills.reduce((sum, skill) => sum + skill.listingTokens, 0),
    },
    detail: { id, version, skills, agents },
  };
}

function checkUnique(kind, modules, pick) {
  const owners = new Map();
  for (const { summary } of modules) {
    for (const name of pick(summary)) {
      if (owners.has(name)) errors.push(`${kind} "${name}" exists in both ${owners.get(name)} and ${summary.id}`);
      else owners.set(name, summary.id);
    }
  }
}

function checkRequires(summaries) {
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  for (const summary of summaries) {
    for (const required of summary.requires) {
      if (!byId.has(required)) errors.push(`${summary.id}: requires unknown module "${required}"`);
    }
  }
  const visiting = new Set();
  const done = new Set();
  const visit = (id, trail) => {
    if (done.has(id) || !byId.has(id)) return;
    if (visiting.has(id)) {
      warnings.push(`requires cycle: ${[...trail, id].join(' -> ')}`);
      return;
    }
    visiting.add(id);
    for (const required of byId.get(id).requires) visit(required, [...trail, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const summary of summaries) visit(summary.id, []);
}

async function loadPresets(moduleIds) {
  const dir = path.join(root, 'presets');
  if (!(await exists(dir))) return [];
  const presets = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
    const id = file.replace(/\.json$/, '');
    const preset = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    for (const moduleId of preset.modules ?? []) {
      if (!moduleIds.has(moduleId)) errors.push(`preset "${id}": unknown module "${moduleId}"`);
    }
    presets.push({ id, name: preset.name ?? id, description: preset.description ?? '', modules: preset.modules ?? [] });
  }
  return presets;
}

const modules = [];
for (const layer of LAYERS) {
  for (const moduleName of await subdirectories(path.join(root, layer))) {
    const built = await buildModule(layer, moduleName);
    if (built) modules.push(built);
  }
}

checkUnique('skill', modules, (summary) => summary.skills);
checkUnique('agent', modules, (summary) => summary.agents);
checkRequires(modules.map((m) => m.summary));
const presets = await loadPresets(new Set(modules.map((m) => m.summary.id)));

if (warnings.length) console.warn(warnings.map((warning) => `warning: ${warning}`).join('\n'));
if (errors.length) {
  console.error(errors.map((error) => `error: ${error}`).join('\n'));
  process.exit(1);
}

await rm(catalogDir, { recursive: true, force: true });
for (const { summary, detail } of modules) {
  const file = path.join(catalogDir, 'modules', `${summary.id}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(detail, null, 2)}\n`);
}
await writeFile(
  path.join(catalogDir, 'index.json'),
  `${JSON.stringify({ version: 2, modules: modules.map((m) => m.summary), presets }, null, 2)}\n`,
);

const skillCount = modules.reduce((sum, m) => sum + m.summary.skills.length, 0);
console.log(`catalog: ${modules.length} modules, ${skillCount} skills, ${presets.length} presets`);
