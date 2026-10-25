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
  "requires": ["core/quality", "languages/typescript", "backend/aws-lambda"]
}
```

| Field | Meaning |
|---|---|
| `name`, `description` | Shown in the extension. One sentence for the description. |
| `detect` | When to suggest the module. `"always": true` suggests it for every project. Otherwise every listed `dependencies` entry must be in the root `package.json`, and every listed `files` entry must exist. Omit `detect` for modules that only arrive through `requires`. |
| `requires` | Modules installed automatically with this one. Same library only. |

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
    "shared": { "url": "https://raw.githubusercontent.com/Tharaka-Chathuranga/claude-skills/v1.0.0" },
    "acme": { "url": "https://raw.githubusercontent.com/acme/claude-skills-acme/main", "auth": "github" }
  },
  "modules": {
    "shared": ["backend/amplify-gen2", "frontend/nextjs"],
    "acme": ["company/acme"]
  },
  "exclude": ["amplify-deploy"]
}
```

Pin `url` to a tag to control when a project picks up library changes. `exclude` lists skill or agent names to skip.
The extension keeps `.claude/claude-skills.lock.json` with what it installed, so it never touches files it didn't write.
