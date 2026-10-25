---
name: code-review-standards
description: Reviews a diff or branch against the core standards — correctness, security and tenant isolation, error handling, boundaries, tests, naming and size — and reports findings by severity with file:line and a concrete failure. Use when asked to "review my changes", "review this PR", "check this code", "is this ready to merge", or as a self-check before reporting work complete.
---

# Code review

Review the change, not the whole repo. Judge it by whether it improves overall code health, not
by whether it is perfect.

## Gather

```bash
git status
git diff --stat <base>...HEAD     # base from quality.config.json baseBranch, else main
git diff <base>...HEAD            # plus `git diff` for uncommitted work
```

Read each changed file in full where the hunk alone doesn't show the context (callers, the
function the hunk sits in, the test that covers it).

## What to check, in order

Each area has an owning skill; apply its checklist rather than re-deriving rules.

1. **Correctness.** Does it do what the task asked? Edge cases: empty, null, zero, boundary,
   concurrent calls, retries, partial failure, time zones, the error path.
2. **Security and tenant isolation** → `security-basics`. Unscoped data access, missing
   server-side authorisation, secrets, unvalidated input, injection.
3. **Error handling** → `error-handling`. Swallowed errors, double handling, leaky messages,
   unsafe logs.
4. **Boundaries** → `architecture-boundaries`. Upward imports, reaching into another feature,
   logic in entry points, duplicated helpers that already exist.
5. **Performance** → `performance-scalability`. Unbounded lists, calls in loops, missing
   timeouts, non-idempotent retried handlers.
6. **Tests.** New logic tested; bug fix has a regression test that fails without the fix;
   tests assert behaviour, not implementation.
7. **Code quality** → `code-quality`. Unit size vs `maxFileLines`, flat control flow, types at
   edges, why-comments, dead code.
8. **Naming** → `naming`. Misleading or vague names, synonyms for one concept.
9. **Stack-specific rules** from installed stack modules and CLAUDE.md.

## Severity

| Level | Meaning | Examples |
| --- | --- | --- |
| **Blocker** | Must fix before merge | data leak across tenants, missing authorisation, secret in code, data loss, broken behaviour, swallowed error on a main path, deploy-breaking change |
| **Should fix** | Fix in this PR unless there's a reason | missing tests, oversized file, boundary violation, unbounded query, duplicated existing helper |
| **Consider** | Worth raising; author decides | naming, magic numbers, narrating comments, minor simplifications |

A finding you can't describe a concrete failure or cost for is a style preference: label it
**Consider** or drop it.

## Output format

```
## Blockers
- path/to/file.ts:42 — <what breaks>. Triggered by <input/state>. Fix: <specific change>.

## Should fix
- ...

## Consider
- ...

## Checks
Quality gate: <summary line from npm run quality, or "not run">

Verdict: Ready to merge | Blocked by N issue(s): <one-line list>
```

Skip empty sections. Order findings by severity, then by file. If everything passes, say so
plainly; don't invent findings to look thorough. Don't rewrite the code in the review unless
asked; propose the fix in one line.

For an independent read in a separate context, delegate to the `code-reviewer` subagent.
