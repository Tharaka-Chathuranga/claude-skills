---
name: code-quality
description: Coding standard for any code change: naming, small units, errors, security, performance, boundaries. Use for any feature, fix or refactor, "name this", "where should this live", "is this secure", "will this scale".
---

# Code quality

Write code for the next person who reads it. The rules below always apply; the reference files hold
the detail. Related skills: wiring and testability → `dependency-injection`; principles →
`design-principles`; patterns → `design-patterns`; checking → `quality-gate`.

Numbers (line cap, forbidden patterns, layers) come from `quality.config.json`. Project rules in
CLAUDE.md win over this skill.

## Before writing

1. **Read the neighbours.** Open two or three files beside where the code will live; match their
   idiom, structure and naming.
2. **Reuse before writing.** Search shared folders, existing utilities and current dependencies
   before adding a helper or a package.
3. **Name the units first.** One sentence per unit. A sentence that needs "and" is two units.
4. **Decide where it lives.** Imports flow one way (entry → features → domain → shared); features
   never import each other's internals; code moves down to shared on its **second** use.

## Rules

### 1. One unit, one job
- One reason to change per function, class, component or module. Entry points (handlers,
  controllers, routes, pages) parse, delegate and map; they don't decide.
- Functions ~40 lines, one level of abstraction, low nesting. Files never over `maxFileLines`.
- Up to 2 positional parameters; 3 or more → one options object. No boolean behaviour flags.

### 2. Names reveal intent, in the domain's words
- Says why it exists (`findOverdueInvoices`, not `filterList`); one word per concept across the code.
- Reject `data`, `info`, `item`, `manager`, `helper`, `util`, `temp`; no unexplained abbreviations.
- Verb prefixes keep their promise: `get`/`is`/`has` only read; `fetch`/`load` do I/O.
- Booleans are positive questions (`isActive`, `canEdit`); units in names (`timeoutMs`).

### 3. Flat, linear control flow
- Return early on invalid input; no nested ternaries; compute named values before returning.
- Long `if/else` chains on a type → lookup table or exhaustive switch. Don't mutate inputs.

### 4. Pure core, I/O at the edges
Business logic takes data and returns data: no network, storage, environment, clock or randomness
inside it. Those are passed in.

### 5. Duplication: wait for the third time
Duplicated **knowledge** (a rule, a key format, a limit) is a bug; centralise it now. Duplicated
**code shape** is cheap; extract on the third occurrence. Build only what the task needs.

### 6. Types and validation at every edge
- External data (requests, events, files, APIs, model output, storage reads) is untrusted until
  parsed by a schema; derive the type from the schema.
- No type-system escape hatches in new code. Literal unions over magic strings; named constants.

### 7. Errors handled once, on purpose
- Never swallow (no empty or log-and-continue catch). Catch only to retry, fall back, add context
  or map to a response; otherwise let it propagate.
- Rethrow with context and the original `cause`. Map to the outside world once, at the edge:
  expected errors → specific status; unexpected → generic message + detailed log.
- Structured logs with a correlation id; never secrets, tokens or personal data.

### 8. Secure by default
- Authorise on the server for every operation, at object level (this caller, this record); deny
  by default; derive identity from the verified session, never from input.
- No secrets in code, fixtures or client bundles. No string-built queries, shell commands or raw HTML.

### 9. Scalable by default
- Every list paginated with a server-side maximum. No remote call per item in a loop; batch.
- Timeouts on every outbound call; bounded retries for transient errors only; anything a retrying
  source triggers is idempotent. Bound concurrency; heavy work goes off the request path.
- Optimise only with a measurement.

### 10. Comments say why
Record constraints, trade-offs and workarounds; one-line doc comment on public functions; no
commented-out code; no `TODO` without an owner or ticket.

## Tests are part of the change
- New logic ships with tests; a bug fix ships with a regression test that failed first.
- Test behaviour through the public contract. Cover empty, boundary, null, the error path and a
  caller without access.

## Changing existing code
- Leave each file you touch closer to the standard; don't rewrite files you weren't asked to change.
- Keep refactors and behaviour changes in separate commits; keep diffs small.

## Self-review before reporting done

- [ ] Names are precise, domain words, one word per concept.
- [ ] Each new unit has one job; no file over `maxFileLines`; imports only flow down.
- [ ] No new forbidden pattern (type escapes, lint disables, debug logging).
- [ ] External input validated; errors handled once with cause; nothing swallowed.
- [ ] Server-side, object-level authorisation on every new data path; no secrets.
- [ ] Lists bounded; no awaited calls inside loops where a batch fits; timeouts set.
- [ ] Comments explain why; no dead code. Tests cover the new behaviour and its edges.
- [ ] `npm run quality` passes, or each failure is explained (`quality-gate`).

## Where to look

- **Naming or renaming anything, or reviewing names in a diff** → read [reference/naming.md](reference/naming.md)
- **Justifying a naming rule, or two naming guides disagree** → read [reference/naming-sources.md](reference/naming-sources.md)
- **Writing try/catch, logging, or mapping errors to responses** → read [reference/error-handling.md](reference/error-handling.md)
- **Handling input, adding an endpoint, upload, permission check, or touching secrets** → read [reference/security.md](reference/security.md)
- **Data access, list endpoints, loops over remote calls, caches, "why is this slow"** → read [reference/performance.md](reference/performance.md)
- **Creating a folder, feature or package, or one feature needs another's code** → read [reference/architecture-boundaries.md](reference/architecture-boundaries.md)
- **Why a rule exists, or two rules conflict** → read [reference/research-summary.md](reference/research-summary.md)
