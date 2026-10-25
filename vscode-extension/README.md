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

Open the **Claude Skills** view in the activity bar.

- **When you open a project**, it suggests the detected modules: "Detected Amplify Gen 2, Jest, React. Add 9 modules
  (31 skills, ~2,900 tokens per session)?" Choose **Add**, or **Choose…** to pick.
- **Find Module** (search icon) searches the whole library by technology.
- **Apply Preset** (in the view's `...` menu) adds a curated set for a role, such as "Amplify backend developer".
- **Remove a module** with the `−` button. Its skills are deleted unless another chosen module needs them.
- **Exclude a skill** you don't want (right-click it). It stays excluded for the project.
- **Install and Update** (cloud icon) brings the disk in line with the manifest and pulls library updates.

By default the sidebar shows only modules that are added, required or detected. Use **Show All Modules** to browse
the whole library.

## Files it writes

With the default `workspace` scope, everything goes under the project's `.claude/` folder:

| File | Purpose | Commit it? |
|---|---|---|
| `.claude/skills.json` | Which libraries and modules this project uses, plus exclusions | Yes |
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
| `claudeSkills.autoSuggest` | `true` | Offer detected modules and missing skills when a project opens |
| `claudeSkills.budgetWarningTokens` | `3000` | Warn when skill descriptions would add more than this to every session |
| `claudeSkills.showAllModules` | `false` | List the whole library instead of only relevant modules |

### Several libraries, including private ones

```json
"claudeSkills.sources": [
  { "name": "Shared", "url": "https://raw.githubusercontent.com/Tharaka-Chathuranga/claude-skills/v1.0.0" },
  { "name": "Acme", "url": "https://raw.githubusercontent.com/acme/claude-skills-acme/main", "auth": "github" }
]
```

With `"auth": "github"`, VS Code asks you to sign in to GitHub once and uses that token to read the repo.
Pin `url` to a tag to choose when a project picks up library changes.

To prompt teammates to install the extension, add it to `.vscode/extensions.json`:

```json
{ "recommendations": ["tharaka-chathuranga.claude-skills"] }
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
