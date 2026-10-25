# Quality kit

A single quality gate and a code-health ratchet for any Node project, configured by one
`quality.config.json`. Node built-ins only; no install step. The `core/workflow` and
`core/playbooks` skills assume this kit (or an equivalent wired to the same npm scripts).

## Files

| File | What it does |
|---|---|
| `check-changed.mjs` | The gate. Finds every file changed vs the base branch (committed, staged, unstaged, untracked) and runs the configured `steps` over them. Prints `Quality gate: PASSED` or `Quality gate: FAILED (<steps>)` and exits non-zero on failure. |
| `ratchet.mjs` | Per-file debt counts that may only go down: file size over `maxFileLines` and each `forbiddenPatterns` entry, plus optional locale-key parity. Commands: `check <files>`, `update`, `report [--top N]`, `--help`. |
| `quality.config.json` | Template config. Copy to the repo root and edit. Same file as `templates/quality.config.json`. |
| `baseline.json` | Created by `ratchet.mjs update` next to the scripts (or at `baselinePath`). Commit it. |
| `templates/quality.config.amplify.json` | Preset for a Next.js + Amplify Gen 2 repo: frontend and backend typecheck steps, blocking lint on `src/`, advisory lint on backend folders, CloudFormation validation only when `amplify/` changed, locale parity on `messages/` with `en` as source. |
| `templates/pre-push` | Husky hook running `npm run quality`; skipped when `CI`, `AMPLIFY_CI` or `AWS_EXECUTION_ENV` is set. Copy to `.husky/pre-push`. |
| `templates/claude-settings.json` | Claude Code permissions to merge into `.claude/settings.json`: allows read-only git, lint, typecheck, test and quality commands; asks before deploy/sandbox/push; denies reading `.env*` and token/credential files. |

## Install

1. Copy this folder's `check-changed.mjs` and `ratchet.mjs` to `scripts/quality/`.
2. Copy `quality.config.json` to the repo root and edit `baseBranch`, `include`, `layers` and `steps`.
3. Add the npm scripts:

   ```json
   "scripts": {
     "quality": "node scripts/quality/check-changed.mjs",
     "quality:report": "node scripts/quality/ratchet.mjs report",
     "quality:baseline": "node scripts/quality/ratchet.mjs update"
   }
   ```

4. Run `npm run quality:baseline` once and commit `scripts/quality/baseline.json`. Existing debt is
   now recorded; new debt fails the gate.
5. Optional: run `npm run quality` in a pre-push hook (`templates/pre-push`) and in CI (fetch the base
   branch first: `git fetch origin main --depth=50`).

Adopting the kit in a repo that already has a ratchet baseline: legacy keys are read as aliases —
`lineCap` for `maxFileLines` (config and baseline), `i18nMissing` for `localesMissing`, and the metric
`eslintDisable` for `lintDisable` — so the existing baseline keeps working. The next `update` rewrites it
with the kit's names.

## Using it

```bash
npm run quality                          # the full gate; run before reporting work done
npm run quality -- --base origin/develop # another base ref
npm run quality -- --skip test,typecheck # while iterating only, never for the final run
npm run quality -- --only ratchet,boundaries
npm run quality:report -- --top 20       # debt totals and worst files
npm run quality:baseline                 # only after reducing debt
```

## Config reference

| Key | Meaning |
|---|---|
| `baseBranch`, `baseBranchFallbacks` | Ref to diff against; fallbacks are tried in order if it is missing locally. |
| `include`, `exclude` | Path prefixes in scope / substrings to ignore. Only files passing both count as code. |
| `codeExtensions` | Extensions treated as code. |
| `maxFileLines` | Cap on non-blank, non-comment lines. New files may not exceed it; files already over it may not grow. Every skill reads the cap from here. |
| `forbiddenPatterns` | `{ name, pattern, fix }`. `pattern` is a JS regex (counted per file, may not increase). `fix` is the skill name or hint printed with a regression. |
| `locales` | `null`, or `{ "dir": "messages", "source": "en" }` to fail when a key in the source locale is missing from another locale file. |
| `layers.order` | Layers from top (may import everything below) to bottom. Each has `name`, `paths`, optional `isolated: true` (slices in that layer may only reach each other through the slice's `index` file). |
| `layers.aliases` | Import alias → path prefix, e.g. `{ "@/": "src/" }`, so aliased imports are checked too. |
| `steps` | Ordered list; see below. |
| `baselinePath` | Optional; defaults to `baseline.json` beside `ratchet.mjs`. |

### Steps

A step is either `{ "name", "builtin": "ratchet" | "boundaries" }` or a command:

| Field | Meaning |
|---|---|
| `run` | Command and arguments, e.g. `["npx", "eslint"]`. No shell. |
| `passFiles` | Append the changed code files to the command. `passAllChanged` appends all changed files instead. |
| `paths` | Only pass files under these prefixes. |
| `advisory` | Report failures without failing the gate (for areas with old lint debt). |
| `enabled: false` | Turn a step off. |
| `requiresFile`, `requiresPackage`, `requiresScript` | Skip unless the file exists / the package is a dependency / the npm script exists. |
| `onlyIfChanged` | Skip unless something under these prefixes changed (e.g. infrastructure templates). |
| `onlyIfCodeChanged` | Skip when no code file changed. |

Skipped steps are listed with their reason in the summary, so "green" never hides a skipped step.

**Several typecheck projects.** A root `tsc --noEmit` skips folders the root tsconfig excludes (often the
backend). Either add one step per project, or call the project's script if it already checks them all:

```json
{ "name": "typecheck-frontend", "run": ["npx", "tsc", "--noEmit", "-p", "tsconfig.json"], "onlyIfCodeChanged": true },
{ "name": "typecheck-backend", "run": ["npx", "tsc", "--noEmit", "-p", "amplify/tsconfig.json"], "onlyIfCodeChanged": true }
// or
{ "name": "typecheck", "run": ["npm", "run", "tsc"], "requiresScript": "tsc", "onlyIfCodeChanged": true }
```

**Blocking in one area, advisory in another.** Use the same tool in two steps with `paths`, and mark the
one for the area with old debt `advisory`. If the ESLint config ignores that area, pass `--no-ignore` so
the files are linted at all:

```json
{ "name": "lint", "run": ["npx", "eslint", "--no-warn-ignored"], "passFiles": true, "paths": ["src/"] },
{ "name": "lint-backend", "run": ["npx", "eslint", "--no-ignore"], "passFiles": true, "paths": ["amplify/"], "advisory": true }
```

**Formatting** is scoped to code files by default (`passFiles` without `passAllChanged`), so Prettier
doesn't fail on changed JSON fixtures, lockfiles or Markdown the project never formatted. Add
`passAllChanged: true` only if the whole repo is Prettier-clean.
Swap the template's commands for your stack, e.g. `["npx", "vitest", "related", "--run"]` for
Vitest, or a `dependency-cruiser` / `eslint-plugin-boundaries` run in place of the built-in
`boundaries` step.

## How the skills use it

- `quality-gate` runs `npm run quality`, reads the summary, and routes each failure to a playbook.
- `quality-ratchet` explains the baseline, `quality:report` and when `quality:baseline` is allowed.
- Failure messages end with `→ <skill>` (`split-oversized-file`, `fix-import-boundary`,
  `type-safety`, …), so the next step is always named in the output.
- `code-quality`, `architecture-boundaries` and `split-oversized-file` read `maxFileLines` and
  `layers` from this config instead of hardcoding numbers.

## Limits

Counting is regex, not AST: a match inside a string or comment still counts. That is fine because a
file is only compared with its own past count. The built-in boundary check resolves relative
imports and configured aliases only; use a dedicated tool for monorepo package graphs.
