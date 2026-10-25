---
name: quality-ratchet
description: Explains and pays down recorded code-health debt — the per-file baseline of oversized files and forbidden patterns that may only go down — and governs when the baseline may be updated. Use when the ratchet step of npm run quality fails, when asked for a "tech debt report", "code health", "what should we clean up" or "where is the worst code", or after a cleanup to lock in lower numbers.
---

# Quality ratchet

Banning existing debt outright blocks every PR; ignoring it lets it grow. The ratchet records each
file's current counts in a baseline (`scripts/quality/baseline.json` by default). **A file may
get better, never worse.** A file not in the baseline is held to zero for every forbidden pattern
and to `maxFileLines`. The metrics are `lines` plus every `forbiddenPatterns` entry in
`quality.config.json`; each entry's `fix` names the skill or action that removes it.

## Commands

```bash
npm run quality:report                          # totals + worst files per metric
npm run quality:report -- --top 20
node scripts/quality/ratchet.mjs check <files>  # what the gate runs
npm run quality:baseline                        # re-measure and rewrite the baseline
```

Use the report as the only source of numbers. Never estimate debt by hand.

## When the ratchet fails

The diff added debt to the named file. **Fix the code.** The message names the file, the
metric and the fix (`any 2 → 3 → type-safety`, `431 lines, over the 400-line cap →
split-oversized-file`).

**Moving code between files** can look like a regression: a pattern moves from `a.ts` into a new
`b.ts`, which has no allowance. Fix the moved occurrence while you're there. If that is truly out
of scope, update the baseline in the same PR and say so in the description, so the reviewer
sees a transfer rather than new debt.

## When updating the baseline is legitimate

`npm run quality:baseline` rewrites every file's ceiling. Run it **only** when:

1. You reduced debt and want to lock the lower numbers in (the normal case). Commit the baseline
   with the cleanup.
2. A reviewed move transferred existing debt between files, as above.
3. The config changed (a new pattern or a new cap) and the team agreed to record current debt.

Never run it to turn a failing gate green on new debt. A baseline diff must be all decreases or
explained moves; reviewers check it like code. Check with `git diff scripts/quality/baseline.json`
before committing.

## Paying down debt

Pick by blast radius, not by count:

1. Type escapes in shared code: every consumer inherits them.
2. Ignore comments in entry points and services: they hide real runtime bugs.
3. Oversized files that change often:
   `git log --since=6.months --format= --name-only | sort | uniq -c | sort -rn | head -20`,
   crossed with the report's `lines` list.
4. Debug logging on the server side: it may leak data into logs.

Keep cleanup PRs separate from feature PRs, one metric or one area per PR, tests passing
before and after, then run `npm run quality:baseline` and commit the lower numbers.

## Reporting

Lead with totals, then the worst files per metric, then one recommended next cleanup with its
expected reduction, all taken from `npm run quality:report` output.
