---
name: code-quality
description: The always-on standard for writing or changing code in any language — small single-purpose units, flat control flow, typed and validated edges, deliberate duplication, why-comments, tests with the change, and a self-review before reporting done. Use for any code-writing task (feature, fix, refactor, script), when asked to "write clean code", "make this maintainable", "improve this code" or "follow best practices".
---

# Code quality

Write code for the next person who reads it. This skill is **how to write it**. Related owners,
linked rather than repeated: names → `naming`; where code goes → `architecture-boundaries`;
principles and patterns → `software-design`; failures → `error-handling`; trust and tenants →
`security-basics`; data access at scale → `performance-scalability`; checking → `quality-gate`.

Numbers (line cap, forbidden patterns) come from `quality.config.json`. Project-specific rules
in CLAUDE.md win over this skill.

## Before writing

1. **Read the neighbours.** Open two or three files beside where the code will live; match their
   idiom, structure and naming. Consistency with the folder beats personal preference.
2. **Reuse before writing.** Search the project's shared folders, existing utilities and current
   dependencies before adding a helper or a package.
3. **Name the units first.** One sentence per unit you will create. A sentence that needs "and"
   describes two units.

## Rules

### 1. One unit, one job
- Each function, class, component or module has one reason to change. Entry points (handlers,
  controllers, routes, pages) wire and delegate; they don't decide.
- Functions: aim for ~40 lines, one level of abstraction, low nesting.
- Files: never over `maxFileLines` from `quality.config.json`; split early (`split-oversized-file`).
- Parameters: up to 2 positional; 3 or more → one options object. No boolean flags that switch
  behaviour; write two functions or take a named option.

### 2. Flat, linear control flow
- Return early on invalid input; keep the happy path unindented.
- No nested ternaries. Compute named values before returning or rendering.
- Replace long `if/else` chains on a type with a lookup table or an exhaustive switch the
  compiler checks.
- Don't mutate inputs; return new values.

### 3. Pure core, I/O at the edges
Business logic takes data and returns data: no network, storage, environment, clock or
randomness inside it. Those are passed in. Detail and patterns: `software-design`.

### 4. Duplication: wait for the third time
Duplicated **knowledge** (a business rule, a key format, a limit) is a bug; centralise it now.
Duplicated **code shape** is cheap; extract on the third occurrence. A shared helper that keeps
gaining flags is the wrong abstraction; inline it back. Build only what the task needs: no
speculative options, layers or config.

### 5. Types and validation at every edge
- Data entering the system (request bodies, events, files, external APIs, model output,
  storage reads) is untrusted until parsed by a schema; derive the type from the schema.
- No escape hatches from the type system in new code (the project's forbidden patterns list
  them). Language detail: `type-safety` or the language module's skill.
- Literal unions or constant maps over magic strings; named constants over magic numbers.

### 6. Errors handled once, on purpose
Never swallow; add context when rethrowing; map to a response once at the edge. Full rules:
`error-handling`.

### 7. Safe and scalable by default
Validate input, authorise on the server, scope every data path to the tenant, keep secrets out of
code and logs (`security-basics`). Paginate lists, batch, no calls inside loops, bound every
wait (`performance-scalability`). Anything triggered by a retrying source must be idempotent.

### 8. Comments say why
- Record constraints, trade-offs, workarounds and links; don't narrate what the code does.
- Public functions and modules get a one-line doc comment saying what they do.
- Significant design decisions get an ADR if the project keeps them.
- No commented-out code; no `TODO` without an owner or ticket.

## Tests are part of the change
- New logic ships with tests; a bug fix ships with a regression test that failed first.
- Test behaviour through the public contract, not internals. Cover edges: empty, zero,
  boundary, null, the error path, the other tenant.
- Pure logic gets unit tests; I/O wiring gets integration tests with fakes at the boundary.

## Changing existing code
- Leave each file you touch closer to the standard; don't rewrite files you weren't asked to change.
- Keep refactors and behaviour changes in separate commits.
- Keep diffs small and focused on the task.

## Self-review before reporting done

Read the diff as a reviewer would:

- [ ] Names pass the `naming` checklist.
- [ ] Each new unit has one job; no file over `maxFileLines`.
- [ ] No new forbidden pattern (type escapes, lint disables, debug logging).
- [ ] External input validated; errors handled once with context; nothing swallowed.
- [ ] Authorisation and tenant scoping on every new data path.
- [ ] Lists bounded; no awaited calls or writes inside loops where a batch fits.
- [ ] Comments explain why; no dead or commented-out code.
- [ ] Tests cover the new behaviour and its edges.
- [ ] `npm run quality` passes, or each failure is explained (`quality-gate`).

## Where to look
- **Why a rule exists, or two rules conflict** → read [reference/research-summary.md](reference/research-summary.md)
