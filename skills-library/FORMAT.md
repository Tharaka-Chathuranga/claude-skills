# Library format

How the library is laid out on disk, and what the build turns it into. Read [AUTHORING.md](AUTHORING.md)
for how to write the skills themselves.

## Layers and modules

```
<layer>/<module>/
├── module.json
├── <skill-name>/            # any folder with a SKILL.md is a skill
│   ├── SKILL.md
│   ├── reference/...        # optional, loaded on demand
│   └── scripts/...          # optional, run rather than read
└── agents/                  # optional Claude Code subagents
    └── <agent-name>.md
```

Layers are fixed top-level folders: `core`, `languages`, `frontend`, `backend`, `data`, `mobile`, `testing`,
`infra`, `company`. A module's id is `<layer>/<module>`, for example `backend/amplify-gen2`.

Everything else at the top level (`tooling/`, `templates/`, `presets/`, `scripts/`, `catalog/`) is not a module.

## module.json

```json
{
  "name": "AWS Amplify Gen 2",
  "description": "Backend functions, data models, resolvers and deploys for Amplify Gen 2.",
  "detect": { "dependencies": ["@aws-amplify/backend"] },
  "requires": ["core/quality", "languages/typescript", "backend/aws-lambda"],
  "skills": {
    "amplify-lambda": { "detect": { "anyFiles": ["amplify/functions"] } },
    "appsync-js-resolver": {
      "detect": {
        "anyOf": [
          { "anyFiles": ["amplify/data/resolvers"] },
          { "contains": [{ "glob": "amplify/**/*.ts", "pattern": "a\\.handler\\.custom\\(" }] }
        ]
      }
    }
  }
}
```

| Field | Meaning |
|---|---|
| `name`, `description` | Shown in the extension. One sentence for the description. |
| `detect` | When the module applies to a project (rules below). Omit it for modules that only arrive through `requires`. |
| `requires` | Modules used automatically with this one. Same library only. |
| `placement` | Optional project subfolders, first existing wins (e.g. `["amplify"]`, `["src"]`). The module's skills install into `<folder>/.claude/skills/`, which Claude Code loads only when it reads or edits a file in that folder — so backend skills cost nothing in frontend work and vice versa. Command-only skills and agents always stay at the root. |
| `skills` | Optional per-skill `detect` rules. Inside a chosen module, a skill with a rule installs **only when it matches**; skills without one always install. |

## Detect rules

The same rule format is used for modules and for skills. Every key that is set must hold:

| Key | Holds when |
|---|---|
| `always: true` | Always (core modules) |
| `dependencies` | All listed packages are dependencies in some `package.json` of the project (root and nested packages up to three levels, so monorepos count) |
| `anyDependencies` | At least one listed package is a dependency. A trailing `*` matches a scope: `"@ai-sdk/*"` |
| `files` / `anyFiles` | All / at least one of the paths (file or folder, relative to the project root) exist |
| `scripts` | All listed npm scripts exist in some `package.json` |
| `contains` | At least one file matching `glob` (`**`, `*`, `{a,b}`) contains a line matching the regex `pattern` |
| `anyOf` | At least one of the nested rules holds |

Prefer the cheapest rule that is precise: dependencies, then files, then `contains`. Add a skill rule
whenever a skill only makes sense for part of a module's users — that is what keeps every project's
skill set small as the library grows. The build rejects unknown keys, empty rules and invalid regexes.

## Skills

- Folder name must equal the frontmatter `name`, and be unique across the **whole library**, because every skill
  installs into one flat `.claude/skills/` folder.
- Naming: core skills have no prefix (`code-quality`); tech skills are `<tech>-<task>` (`amplify-lambda`);
  company skills are `<company>-<task>`.
- All limits in AUTHORING.md section 2 are enforced by the build.

## Agents

`agents/<name>.md` is a Claude Code subagent file (frontmatter `name`, `description`, optional `tools`, `model`).
It installs into `.claude/agents/`. File name must equal `name`, unique across the library.

## Presets

`presets/<id>.json` picks modules for a role or a company-standard stack:

```json
{
  "name": "Amplify backend developer",
  "description": "Lambdas, data models and resolvers on Amplify Gen 2.",
  "modules": ["backend/amplify-gen2", "testing/jest"]
}
```

Required modules come in automatically, so list only what the role chooses.

## Build output

`node scripts/build-index.mjs` validates everything and writes:

```
catalog/index.json                      # small: every module + presets; the extension reads this first
catalog/modules/<layer>/<module>.json   # skill and agent details, fetched only when a module is used
```

Versions are content hashes, so editing any file ships an update. Don't edit `catalog/` by hand.

## Project manifest (written by the extension)

Projects record their choice in `.claude/skills.json`, committed to the repo:

```json
{
  "sources": {
    "shared": { "url": "https://raw.githubusercontent.com/Tharaka-Chathuranga/claude-skills/library-v1.0.0/skills-library" },
    "acme": { "url": "https://raw.githubusercontent.com/acme/claude-skills-acme/main", "auth": "github" }
  },
  "autoDetect": true,
  "modules": { "acme": ["company/acme"] },
  "excludeModules": { "shared": ["frontend/mui"] },
  "include": ["nextjs-server-action"],
  "exclude": ["amplify-deploy"]
}
```

| Field | Meaning |
|---|---|
| `autoDetect` | Follow the project: every module whose rule matches is used, and inside modules only the skills whose rule matches. Re-evaluated when dependencies change. |
| `modules` | Modules to use even when not detected, per library |
| `excludeModules` | Modules to leave out even when detected or required, per library |
| `include` | Skill or agent names to install even when their rule doesn't match |
| `exclude` | Skill or agent names to leave out |

Pin `url` to a tag to control when a project picks up library changes.
The extension keeps `.claude/claude-skills.lock.json` with what it installed, so it never touches files it didn't write.
