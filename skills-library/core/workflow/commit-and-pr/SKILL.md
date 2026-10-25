---
name: commit-and-pr
description: Writes Conventional Commits messages, splits work into small reviewable commits and PRs, and structures the PR description. Use when asked to "commit this", "write a commit message", "open a PR", "create a pull request" or "write the PR description".
---

# Commits and pull requests

Commit, push or open a PR only when the user asks. Project rules in CLAUDE.md (branch names,
ticket ids, trailers, templates in `.github/`) override this skill.

## Commits

Format: [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <subject>

<body: why, and anything non-obvious about how>

<footer: BREAKING CHANGE: ..., Refs: TICKET-123>
```

- `type`: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- `scope`: the feature or package touched, as the repo already uses it (check `git log --oneline -20`).
- Subject: imperative, lower case, no trailing period, ≤ 72 characters, says what changes for
  the reader: `fix(billing): round tax per line, not per invoice`.
- Body explains **why** and any trade-off; the diff already shows what.
- Breaking change: `!` after the type/scope and a `BREAKING CHANGE:` footer.
- Trailers (co-author lines, sign-offs, ticket refs) follow the project's or user's stated preference in
  CLAUDE.md or memory — including leaving a default co-author trailer out when they say so.

**One logical change per commit.** Separate:
- refactors / moves from behaviour changes (a move-only commit reviews in seconds);
- formatting from logic;
- baseline or generated-file updates from the code that caused them, unless they must land together.

Stage explicit paths (`git add <files>`), not `git add -A`; check `git status` for stray files,
secrets and local config before committing. Never commit with failing hooks bypassed
(`--no-verify`) unless the user asks.

## Branches

`<type>/<short-kebab-description>` (e.g. `fix/tax-rounding`) unless the project uses another
pattern. Branch from the base branch in `quality.config.json` (`baseBranch`) or CLAUDE.md.

## Pull requests

**Small:** one purpose per PR; aim for a diff a reviewer can read in one sitting (a few hundred
changed lines). Split large work into a stack: preparatory refactor → feature → cleanup.

Before opening: `npm run quality` passes (`quality-gate`), and the diff has had a self-review
(`code-review-standards`).

**Base branch is project-specific.** Target the integration branch from CLAUDE.md or
`quality.config.json` (`baseBranch`), e.g. `development` or `develop`, not `main` by assumption.

Title: same format as a commit subject.

Description:

```markdown
## Why
<problem or ticket, one or two sentences>

## What changed
- <behaviour-level bullets, not a file list>

## How to verify
- <commands run and their result, e.g. "npm run quality: PASSED">
- <manual steps or screenshots for UI changes>

## Risk and rollout
<migrations, flags, config/env changes, backwards compatibility; "none" if none>

## Notes for reviewers
<where to start, anything deliberately left out, debt moved in the baseline>
```

Link the ticket. Call out anything a reviewer must not miss (security-sensitive paths,
permission changes, data migrations) at the top.
