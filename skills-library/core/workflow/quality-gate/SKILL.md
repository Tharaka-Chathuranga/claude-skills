---
name: quality-gate
description: Runs the project's single quality gate (npm run quality) over everything the branch changed, reads the output, routes each failure to the right fix, and re-runs until green. Use before reporting any code task complete, before opening a PR, when asked to "run the checks", "check my changes", "is this green", or when a pre-push hook or CI check failed.
---

# Quality gate

One command checks every file the branch changed against the base branch (committed, staged,
unstaged and untracked):

```bash
npm run quality
```

By convention this is `scripts/quality/check-changed.mjs` from the library's `tooling/quality-kit`;
its steps, base branch, line cap and forbidden patterns come from `quality.config.json`. If the
project has no `quality` script, run the checks CLAUDE.md lists, and say that there is no gate.

## Rules

1. **Never report a task done on a red gate.** Fix, re-run, repeat. If something can't be fixed
   in scope, report it as an open failure with the error, not as done.
2. **Report the real output.** Quote the gate's final summary line. Don't paraphrase a run you
   didn't observe; don't call it green if steps were skipped by flag.
3. **Fix the code, not the check.** No new lint disables, type escapes, baseline bumps, skipped
   tests or loosened config to get to green.
4. **Full run at the end.** While iterating, run the narrow tool on one file (the linter, the
   one test file) or `npm run quality -- --only <step>`; finish with one full run without `--skip`.

## Loop

```
- [ ] npm run quality
- [ ] For each failed step, apply the fix below
- [ ] Re-run the failed step only (--only <step>) until it passes
- [ ] Final full npm run quality → PASSED
```

## Routing failures

Each ratchet/boundary message ends with `→ <fix>`. Follow it:

| Failure | Do this |
| --- | --- |
| `ratchet`: `N lines, over the cap` or `may not grow` | `split-oversized-file` |
| `ratchet`: a type-escape pattern grew (`any`, ignore comments, unchecked casts) | `type-safety` |
| `ratchet`: lint-disable, debug logging or another forbidden pattern grew | Remove it; fix the underlying issue |
| `ratchet`: locale file missing keys | Add the key to every locale file |
| `ratchet`: debt moved between files during a refactor | `quality-ratchet` (moves section) |
| `boundaries`: upward import or another feature's internals | `fix-import-boundary` |
| `typecheck` | Fix the type error; never silence it |
| `lint` / `format` | Fix the rule; run the formatter on the changed files |
| `test` | Read the failing assertion. A test protecting behaviour you changed is right until proven otherwise |
| Infrastructure validation | Follow the stack module's deploy/validate skill |

## Skipped steps

The summary lists skipped steps with a reason (`no tsconfig.json`, `nothing changed under
infra/`, `by flag`). Config-based skips are normal. Skips by flag are not allowed on the final run.

## A failure that is not yours

Related-test runs can pull in a suite that was already broken. Before calling a failure
pre-existing, prove it: run the same command on the base commit (e.g. in a temporary
`git worktree add <dir> <base>`). Report it as "pre-existing, also fails on <base>" with the
error; don't fix it inside an unrelated change unless asked. Known environmental failures (a
generated file that only exists after a local setup step) should be listed in CLAUDE.md.

## Report format

```
Quality gate: PASSED (skipped: infra-validate — nothing changed under infra/)
Quality gate: FAILED (ratchet: src/features/billing/invoice-table.tsx 431 lines; test: 2 failing in format-date.test.ts)
```
