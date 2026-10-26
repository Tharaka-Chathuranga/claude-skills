# Claude skills

Shared [Claude Code skills](https://code.claude.com/docs/en/skills) and the VS Code extension that installs them.

| Folder | What it is |
|---|---|
| [`skills-library/`](skills-library/README.md) | The skills, subagents and presets, plus the generated `catalog/` the extension reads |
| [`vscode-extension/`](vscode-extension/README.md) | The **Claude Skills** extension: detects a project's stack and installs the matching modules into `.claude/` |

**New here?** Read [GETTING-STARTED.md](GETTING-STARTED.md): install the extension, set up a project's skills, and use them in Claude Code.

The extension reads the library from
`https://raw.githubusercontent.com/Tharaka-Chathuranga/claude-skills/<branch-or-tag>/skills-library`.

## Releases

Tags are prefixed by the part they release:

- `library-v1.0.0`: a library version that projects pin in `.claude/skills.json`
- `extension-v0.2.0`: an extension version
