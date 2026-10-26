---
name: design-patterns
description: Picks a design pattern from a concrete symptom, offering the lighter TypeScript option first — strategy, factory, adapter, decorator, repository, pipeline, result type and more. Use when a pattern is named, when asked which pattern fits, or for repeated switches, cross-cutting concerns or vendor coupling.
---

# Design patterns

**Gate: name the symptom first.** If you can't point to a current, concrete problem in this code,
don't apply a pattern. Try the "lighter first" option before the full pattern. Read only the one
reference file you need.

| Symptom in the code | Lighter first | Pattern | Read |
|---|---|---|---|
| Same `switch` on a type in several places; algorithm chosen at runtime | Union + exhaustive switch, or `Record<Kind, Fn>` | Strategy ★ | [strategy](reference/strategy.md) |
| Construction needs a decision, wiring or per-call data | A plain factory function | Factory | [factory](reference/factory.md) |
| Many optional parts, staged validation, test data | Options object with defaults | Builder ★ | [builder](reference/builder.md) |
| Business code touches a vendor SDK or legacy API | — (always adapt vendors) | Adapter | [adapter](reference/adapter.md) |
| Callers repeat the same multi-call orchestration; too many constructor deps | Extract a function | Facade | [facade](reference/facade.md) |
| Retry, cache, logging, metrics around calls | Inline at the single call site | Decorator | [decorator](reference/decorator.md) |
| Lazy init or access control behind the same interface | Explicit decorator | Proxy | [proxy](reference/proxy.md) |
| One event, several independent reactions | Call the one consumer directly | Observer / events | [observer](reference/observer.md) |
| Operation must be queued, retried, undone or audited | A plain function call | Command | [command](reference/command.md) |
| Ordered optional pre/post steps (auth → validate → handle) | A fixed sequence of calls | Middleware chain | [middleware-chain](reference/middleware-chain.md) |
| Behaviour depends on a status with legal transitions | — | State (reducer) | [state](reference/state.md) |
| Shared skeleton with varying steps in subclasses | Function taking the steps | (replaces Template Method ★) | [template-method](reference/template-method.md) |
| Persistence details leak into business code | — | Repository | [repository](reference/repository.md) |
| Several writes must commit atomically | Single write | Unit of work | [unit-of-work](reference/unit-of-work.md) |
| Core logic must run and be tested without I/O | Handler → service → repository | Ports and adapters ★ | [ports-and-adapters](reference/ports-and-adapters.md) |
| Sequential transformations with typed intermediates | Two direct calls | Pipeline / stages | [pipeline](reference/pipeline.md) |
| Business predicates reused in memory and in queries | A named predicate function | Specification ★ | [specification](reference/specification.md) |
| Expected failures the caller must handle | — | Result type | [result-type](reference/result-type.md) |
| `if (x)` / `x?.y?.()` checks on an optional collaborator | — | Null object | [null-object](reference/null-object.md) |

★ = often over-applied, especially in generated code. Wiring (composition root) lives in
`dependency-injection`.

## Rules for any pattern

- Prefer functions, closures and unions; use classes only where state or several related methods
  justify them.
- One pattern per problem. Stacking factories of strategies of builders is a smell.
- A pattern's interface earns its keep only with a second implementation or a fake that tests use.
- Name things for the domain (`OrderPricing`), not the pattern (`PricingStrategyFactory`).
- Removing a pattern that no longer pays (one strategy left, a pass-through facade) is a good change.

## Where to look

- Principles behind these choices → `design-principles`
- Injecting the collaborators these patterns need → `dependency-injection`
- An independent design read of a diff → the `design-reviewer` agent
