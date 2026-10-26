# Getting started

How to install the Claude Skills extension and set up the right skills for a project's tech stack.
Setup is automatic: open the project and the matching skills are installed.

## Contents

1. What you get
2. Install the extension
3. Set up a project (first person)
4. Join a project that's already set up
5. Using the skills in Claude Code
6. Keeping skills up to date
7. Changing the setup later
8. Optional: the quality kit
9. Troubleshooting

## 1. What you get

The library is a set of **modules**, one per technology, grouped in layers:

| Layer | Modules |
|---|---|
| Core (every project) | code quality, naming, architecture, error handling, security, performance, software design and patterns, review workflow, fix playbooks |
| Languages | TypeScript, Dart |
| Frontend | React (components, feature structure, forms, hooks, performance), Next.js, MUI, next-intl, Amplify client |
| Backend | AWS Lambda (incl. LLM functions), Amplify Gen 2 |
| Data | DynamoDB |
| Testing | Jest, Storybook, Playwright |

The extension reads your project's `package.json`, suggests the modules that match, installs them into
`.claude/`, and records the choice in `.claude/skills.json` so the whole team gets the same skills.
Modules bring what they depend on: choosing **Amplify Gen 2** also installs Lambda, DynamoDB,
TypeScript and the core modules.

## 2. Install the extension

**From the Marketplace** (once published): open the Extensions view, search **Claude Skills**
(publisher `TharakaChathuranga`), install. Cursor, VSCodium and Windsurf use Open VSX — same name.

**Until then, from a VSIX:**

```bash
git clone https://github.com/Tharaka-Chathuranga/claude-skills.git
cd claude-skills/vscode-extension
npm ci
npm run package          # creates claude-skills-<version>.vsix
```

In VS Code: Command Palette → **Extensions: Install from VSIX…** → pick the `.vsix`. Or download the
`.vsix` from the repo's GitHub Releases if one is attached.

You also need Claude Code (the CLI or the VS Code extension). Skills are plain files, so nothing else
is required.

## 3. Set up a project (first person)

### 3.1 Open the project

Open the project folder. That's the setup: the extension inspects the project and installs only
the skills that match it.

- **Modules** are picked by what the project uses: dependencies in every `package.json` (root and
  monorepo packages), marker files (`pubspec.yaml`, `.storybook/`, `playwright.config.ts`) and npm scripts.
- **Skills inside a module** have their own rules, so you get only the ones your code needs. For
  example, `nextjs-server-action` installs only if the code contains `'use server'`, `llm-functions`
  only if an LLM SDK is a dependency, `amplify-lambda` only if `amplify/functions/` exists,
  `react-forms` only if the code uses react-hook-form or Formik.

A notification shows what was set up, with **Review** and **Undo**:

> Claude Skills set up 33 skills for Next.js, Amplify Gen 2, MUI, next-intl, Jest, Storybook
> (~3,600 tokens per session). Commit the .claude folder to share them.

Folders that don't look like a project (no detected stack) are left alone.

**It keeps following the project.** Add `@playwright/test` and a `playwright.config.ts`, and the
Playwright skills arrive; remove a dependency, and its skills leave. Changes show briefly in the status
bar ("Claude skills updated (+1)").

Prefer to confirm first? Set `claudeSkills.setupMode` to `ask` (prompts before setting up or applying
changes) or `manual` (only when you use the sidebar). **Set Up This Project Automatically** in the
view's `…` menu runs the setup on demand.

### 3.2 Review and adjust

Open the **Claude Skills** view. Modules show **detected · in use**, **required by …**, **added** or
**turned off**; skills show **installed**, **not used in this project**, **excluded** or
**hand-made copy**.

| To | Do |
|---|---|
| Drop a whole module the project doesn't want | ⊘ on the module (**Turn Off for This Project**); it stays off even when detected |
| Drop one skill | Right-click → **Exclude from This Project** |
| Install a skill marked "not used in this project" anyway | `+` on the skill |
| Add a module that isn't detected | 🔍 **Find Module**, or `…` → **Apply Preset** |

Every choice is saved in `.claude/skills.json` as an override on top of detection, so it survives
future re-checks and applies to the whole team.

Watch the token count in the view's title bar. Every installed skill's description is loaded into every
Claude session; per-skill rules keep this small, and the view warns above `claudeSkills.budgetWarningTokens`.

### 3.3 Pin the library version

By default the project follows the library's `main` branch. Pin a release so library changes reach
the project only when you choose: `…` → **Open skills.json**, then change the URL:

```json
{
  "sources": {
    "shared": {
      "url": "https://raw.githubusercontent.com/Tharaka-Chathuranga/claude-skills/library-v1.0.0/skills-library"
    }
  },
  "autoDetect": true
}
```

Save; the extension reloads. Click ☁️ **Install and Update Skills** if it shows changes.

### 3.4 Tell the skills about your project

The skills are generic. Project-specific facts they need live in the project's `CLAUDE.md`, which
Claude reads every session. Add (or check) these:

- **Folder map**: where pages, features, shared components, backend functions live.
- **Layer rules**: what may import what, if it differs from app → features → shared.
- **Vocabulary**: the product's domain words and what they mean.
- **Workflow**: the PR base branch, the check command (e.g. `npm run quality`), the typecheck script.
- **Anything the generic skill gets wrong for this repo**, stated as a rule.

Numbers (line cap, forbidden patterns, locales) go in `quality.config.json` if you use the quality kit
(section 8).

### 3.5 Handle existing hand-made skills

If `.claude/skills/` already has a skill with the same name as a library skill (e.g. your own
`add-i18n-strings`), the extension never overwrites it: the sidebar shows **hand-made copy, not
managed** and a warning. Decide per skill:

- Keep yours → exclude the library one (right-click → Exclude).
- Switch to the library → delete or rename your folder, then click **Install and Update Skills**.
- Merge → move your project-specific rules into `CLAUDE.md`, then switch to the library skill.

### 3.6 Commit

```bash
git add .claude/skills.json .claude/claude-skills.lock.json .claude/skills .claude/agents
git commit -m "chore(claude): add shared Claude skills"
```

Committing the installed files means Claude works for teammates even before they install the
extension. To prompt them to install it, add `.vscode/extensions.json`:

```json
{ "recommendations": ["TharakaChathuranga.claude-skills"] }
```

## 4. Join a project that's already set up

1. Install the extension (section 2).
2. Open the repo. The extension reads `.claude/skills.json` and installs anything missing, with the
   same detection and overrides as everyone else (in `ask` mode it asks first).
3. When `skills.json` or a dependency changes in a pull, the skills follow.

## 5. Using the skills in Claude Code

- **Skills trigger automatically** when your request matches their description: "add a component",
  "write tests for this", "add a lambda", "why did the deploy fail", "is this ready to merge".
- **Command-only skills** run when you type them: `/amplify-deploy`.
- **Agents**: ask for them by name — "use the code-reviewer agent on my changes", "ask the
  design-reviewer to look at this service".
- **Check what Claude sees**: ask "What skills are available?". In Claude Code, `/context` shows the
  skill listing's size and `/skill-doctor` shows each skill's cost and usage.
- **Backend and frontend skills only activate in their folders** (e.g. Amplify standards under
  `amplify/**`), so frontend work doesn't load backend rules.
- New or updated skills not showing up? Start a new Claude session.

## 6. Keeping skills up to date

- The sidebar marks skills with **update available** when the library version you follow changes;
  ☁️ **Install and Update Skills** applies them. On a pinned tag, nothing changes until you bump it.
- To upgrade a pinned project: change `library-v1.0.0` → `library-v1.1.0` in `skills.json`, click
  **Install and Update Skills**, commit `skills.json`, the lock file and `.claude/skills/` in one PR.

## 7. Changing the setup later

| To | Do |
|---|---|
| Add a technology the project starts using | Nothing: add the dependency and its skills arrive. Or 🔍 Find Module for one that isn't detectable |
| Stop using a module | ⊘ on the module (Turn Off), or `−` on a module you added by hand |
| Drop one skill | Right-click → Exclude from This Project (to undo, click `+` on the excluded skill) |
| Install a skipped skill anyway | `+` on a skill marked "not used in this project" |
| Start over | `…` → Remove All Installed Skills, then Set Up This Project Automatically |
| Use skills in every project, just for you | Setting `claudeSkills.installScope` → `user` (installs into `~/.claude/`) |
| Read an extra private library | Add it to `claudeSkills.sources` with `"auth": "github"`, or to `skills.json` `sources` |
| Change the token warning | Setting `claudeSkills.budgetWarningTokens` |

## 8. Optional: the quality kit

Several core skills (`quality-gate`, `quality-ratchet`, `split-oversized-file`) work best with the
library's quality kit: one `npm run quality` command that checks only what you changed, plus a
baseline so existing debt can only go down.

1. Copy `skills-library/tooling/quality-kit/check-changed.mjs` and `ratchet.mjs` into the project's
   `scripts/quality/`.
2. Copy a config to the project root as `quality.config.json`:
   `tooling/quality-kit/quality.config.json` (any project) or
   `tooling/quality-kit/templates/quality.config.amplify.json` (Next.js + Amplify Gen 2). Set
   `baseBranch` (e.g. `origin/development`), `include`, `layers` and `steps`.
3. Add npm scripts:
   ```json
   "quality": "node scripts/quality/check-changed.mjs",
   "quality:report": "node scripts/quality/ratchet.mjs report",
   "quality:baseline": "node scripts/quality/ratchet.mjs update"
   ```
4. Run `npm run quality:baseline` once and commit `scripts/quality/baseline.json`.
5. Optional: `templates/pre-push` as a husky hook, and `templates/claude-settings.json` as a starting
   point for `.claude/settings.json` permissions.

Already have a ratchet with `lineCap` / `i18nMissing` / `eslintDisable` keys? The kit reads them as
aliases, so the existing baseline keeps working.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing set up when opening the project | Check `claudeSkills.setupMode` isn't `manual`; run **Set Up This Project Automatically**; if you clicked Undo earlier, that project is skipped until you run it |
| A technology isn't detected | Detection reads `package.json` files up to three folders deep and marker files at the root. Add the module with 🔍 Find Module; it's kept as an override |
| A skill you want shows "not used in this project" | Its rule didn't match your code; click `+` to include it anyway |
| Sidebar shows a fetch error | Check the source URL in `skills.json` or settings; for a private library set `"auth": "github"` and sign in to GitHub when asked |
| "hand-made copy, not managed" | A local skill has the same name; see 3.5 |
| A change pushed to the library doesn't appear | GitHub caches raw files ~5 minutes; on a pinned tag, bump the tag |
| Claude doesn't use a skill | Ask "What skills are available?"; start a new session; phrase the request with the words in the skill's description |
| Token warning in the view | Exclude skills the project doesn't use, or remove modules you don't need |
