# Claude Skills

Pick [Claude Code skills](https://code.claude.com/docs/en/skills) for your tech stack from shared libraries.
The extension detects what your project uses, installs only those modules (plus what they depend on), keeps
teammates on the same set through a committed manifest, and shows how many tokens the skills add to every session.

## How it works

A **library** is a GitHub repo of **modules**, grouped in layers:

| Layer | Examples |
|---|---|
| Core | code quality, naming, architecture, software design and patterns, review workflow |
| Languages | TypeScript, Dart |
| Frontend | React, Next.js, MUI, next-intl, Amplify client |
| Backend | AWS Lambda, Amplify Gen 2 |
| Data | DynamoDB |
| Testing | Jest, Storybook, Playwright |

Modules declare what they need. Adding **Amplify Gen 2** also brings in Lambda, DynamoDB, TypeScript and the core
modules, so you choose one thing and get a consistent set.

## Using it

**Open a project. That's it.** The extension inspects it and installs only the skills that match:

- **Modules** by what the project uses: dependencies in every `package.json` (monorepo packages too), marker files
  and npm scripts.
- **Skills** by their own rules inside each module, e.g. `nextjs-server-action` only if the code contains
  `'use server'`, `llm-functions` only with an LLM SDK, `amplify-lambda` only if `amplify/functions/` exists.
  Skills that don't apply show as **not used in this project** and cost nothing.

A notification shows what was set up, with **Review** and **Undo**. After that the skills **follow the project**:
add or remove a dependency and the matching skills arrive or leave (shown in the status bar).

Adjust in the **Claude Skills** view; every choice is saved as an override in `.claude/skills.json`:

- **Turn Off** (⊘) a detected module the project doesn't want; it stays off.
- **Exclude** a skill (right-click), or **include** a skipped one (`+`).
- **Find Module** (search icon) or **Apply Preset** (`…` menu) for modules detection can't see.
- **Remove All Installed Skills** (`…` menu) to start over.

By default the sidebar shows only modules in use, required, detected or turned off. **Show All Modules** browses
the whole library.

## Files it writes

With the default `workspace` scope, everything goes under the project's `.claude/` folder:

| File | Purpose | Commit it? |
|---|---|---|
| `.claude/skills.json` | Libraries, `autoDetect`, and your overrides (modules added or turned off, skills included or excluded) | Yes |
| `.claude/claude-skills.lock.json` | What the extension installed, with versions | Yes |
| `.claude/skills/<name>/` | Installed skills | Yes, so Claude works without the extension |
| `.claude/agents/<name>.md` | Installed subagents | Yes |

Skills and agents you created by hand are never overwritten or deleted. Only items in the lock file are managed.

When a teammate opens the repo, the extension offers to install anything in `skills.json` that's missing. When
`skills.json` changes in a pull, the sidebar follows it.

## Settings

| Setting | Default | |
|---|---|---|
| `claudeSkills.sources` | the shared library | Libraries to use until a project has its own `skills.json` |
| `claudeSkills.installScope` | `workspace` | `workspace` uses the project's `.claude/`; `user` uses `~/.claude/` for every project |
| `claudeSkills.setupMode` | `auto` | `auto` sets up projects and follows dependency changes; `ask` confirms first; `manual` only acts on your commands |
| `claudeSkills.budgetWarningTokens` | `3000` | Warn when skill descriptions would add more than this to every session |
| `claudeSkills.showAllModules` | `false` | List the whole library instead of only relevant modules |

### Several libraries, including private ones

```json
"claudeSkills.sources": [
  { "name": "Shared", "url": "https://raw.githubusercontent.com/Tharaka-Chathuranga/claude-skills/library-v1.0.0/skills-library" },
  { "name": "Acme", "url": "https://raw.githubusercontent.com/acme/claude-skills-acme/main", "auth": "github" }
]
```

With `"auth": "github"`, VS Code asks you to sign in to GitHub once and uses that token to read the repo.
Pin `url` to a tag to choose when a project picks up library changes.

To prompt teammates to install the extension, add it to `.vscode/extensions.json`:

```json
{ "recommendations": ["TharakaChathuranga.claude-skills"] }
```

## Notes

- Token numbers are estimates from description length. In Claude Code, `/context` and `/skill-doctor` show the
  real figures.
- GitHub caches raw files for a few minutes, so a change you just pushed to a branch may take up to 5 minutes to appear.
- Detection reads the `package.json` at the root of the first workspace folder.

## Development

```bash
npm install
npm run compile      # or: npm run watch
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

## Publishing (free)

1. Create a publisher at <https://marketplace.visualstudio.com/manage> and put its id in `package.json`
   under `publisher`.
2. Create an Azure DevOps personal access token with the **Marketplace > Manage** scope, then run
   `npx vsce login <publisher>`.
3. `npm run package` builds a `.vsix` you can share directly or install with **Extensions: Install from VSIX...**.
4. `npm run publish:vscode` publishes to the VS Code Marketplace.
5. `npx ovsx create-namespace <publisher> -p <token>` once, then `npm run publish:openvsx -- -p <token>`,
   publishes to Open VSX for Cursor, VSCodium and Windsurf users.
