---
name: dependency-injection
description: Wires dependencies for testable code: composition root, constructor injection, narrow ports, injected time and config, fakes. Use when logic news up clients, reads env or time, or a test needs jest.mock.
---

# Dependency injection

Goal: every unit gets what it needs from outside, so tests pass fakes and the wiring lives in one
place. Pure DI (manual wiring) by default — no container.

## The rules

1. **Wire only in the composition root**, as close to the entry point as possible (table below).
   Nothing else calls `new` on a volatile dependency or reads `process.env`.
2. **Inject volatile dependencies only**: anything doing I/O (DB, HTTP, queue, files, SDKs) or
   non-deterministic (time, random, ids, remaining Lambda time). Import stable code directly — pure
   functions, zod, lodash, domain helpers. Not everything needs an interface.
3. **Constructor injection by default**: `constructor(private readonly repo: OrderRepo, private readonly clock: Clock)`.
   For functions, a factory: `makeCloseOrder(deps) => (input) => …`. Pass per-call context (a
   transaction, request user) as a method parameter.
4. **Depend on the narrowest port**: `Pick<EventPublisher, 'publish'>` or a 1–3 method interface
   the consumer owns — never the whole SDK client or a "deps bag" every unit shares.
5. **Config is a value**: parse and validate env once in the root, pass a typed object
   (`{ ordersTable, timeoutMs }`). A typo then fails at startup, not at 3 a.m.
6. **Time and budgets are ports**: `Clock { now(): string }`, `TimeBudget { remainingMs(): number }`,
   `newId: () => string`. Pure builders take `now` as a plain value instead.
7. **Past ~6 dependencies, look for a split first**; only then group them in a `Deps` object with
   null-object defaults for optional ports (`timeBudget ?? unlimitedTimeBudget`). Many deps is an SRP
   smell, not a reason for a container.
8. **Interface only with a reason**: a second implementation or a test fake that tests actually use.
   An `IOrderBuilder` whose tests use the real class is noise — make it a function.
9. **Adapters wrap vendors**: services see `ILogger`, `IStructuredClient`, `OrderRepo` — never
   Powertools, axios or `@aws-sdk` types. Adapters accept the SDK client so the root can share it.
10. **Push decisions into pure functions** that take values and return values; the shell does I/O.
    The pure core needs no fakes at all.

## Lifetimes

| Lifetime | What | Where it is built |
|---|---|---|
| Process / module scope | SDK clients, HTTP agents, pools, base logger, parsed config, stateless adapters | Module scope of the root, reused across warm invocations |
| Per request | Anything holding a user, tenant, token, trace id, transaction, collector, job store | Inside the handler / request middleware |
| Per use | Cheap stateless helpers | Wherever needed |

**Captive dependency**: a longer-lived object holding a shorter-lived one (a module-level service
capturing a request logger or transaction) leaks data across requests. A dependency must live at
least as long as its consumer; otherwise inject a factory and call it per use.

## Composition root by runtime

| Runtime | Root | Shape |
|---|---|---|
| Lambda | `handler.ts` | Module scope: clients, base logger, config. Handler body: validate input → build per-request objects → call one service method → map result |
| Express / Next.js server | `app.ts` / a `server-only` container module | Singletons at module level; per-request pieces from auth, headers, cookies in middleware / the route |
| React | `main.tsx` / root layout providers | Build clients once, expose through a provider; hooks read via `useX()`; props first, context for far-apart consumers |
| CLI / script | `main()` | Parse args + env → build deps → `run(deps, args)` → exit code; `run` stays importable for tests |

## Anti-patterns — how to spot them in a diff

| Smell in the diff | Name | Fix |
|---|---|---|
| `new XClient(`, `Date.now()`, `new Date()`, `Math.random()`, `process.env.` inside a service/repository | Control Freak / ambient context | Inject a port or value from the root |
| `container.resolve(`, `getClient()` called inside logic, module-level `const client = getX()` | Service Locator | Constructor/parameter injection; default to the locator only at the call site |
| `constructor(repo = new RealRepo())`, `tableName = process.env.X!` | Foreign default | Required parameter, wired in the root |
| `static init(client)` / `initWithClient` beside a private constructor | Needless static factory | Public constructor or a plain factory function |
| Module-level `let currentUser`, global singleton holding request data | Ambient context, captive dependency | Per-request object passed down |
| Service test needs `jest.mock('./module')` | Hidden dependency | Make it a constructor dependency, fake it |
| `logger?.warn?.(…)`, optional port methods | Weakened port | Required methods + a no-op default |
| `IFooFactory` that only defers `new` for a stateless thing | Factory overuse | Inject the instance |

## Where to look

- **Writing tests for injected code** (fakes with `satisfies`, `makeDeps(overrides)`, fixed clocks,
  contract tests, what not to mock) → read [reference/testing-with-fakes.md](reference/testing-with-fakes.md)
- **React / frontend DI** (providers, injectable services and hooks, per-provider stores) → read
  [reference/frontend.md](reference/frontend.md)
- **Considering a DI container** (tsyringe, InversifyJS) → read [reference/containers.md](reference/containers.md)
- Principles behind this (SRP, DIP, composition) → `design-principles`. Adapter, Decorator, Facade,
  Null Object shapes → `design-patterns`.
