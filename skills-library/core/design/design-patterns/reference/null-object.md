# Null object

**Use when:** many `if (x)` checks or optional chaining guard an optional collaborator (logger, metrics, time budget).
**Don't when:** absence is meaningful data (no discount, user not found); model it explicitly.
**Lighter first:** a default parameter value set to a no-op implementation.

## Shape

```ts
export interface Logger { info(msg: string, meta?: object): void; warn(msg: string, meta?: object): void }

export const noopLogger: Logger = { info: () => {}, warn: () => {} };

export const unlimitedTimeBudget: TimeBudget = {
  remainingMs: () => Number.POSITIVE_INFINITY,
  isLow: () => false,
};

export const makeReportService = ({ logger = noopLogger, budget = unlimitedTimeBudget }: Partial<Deps> = {}) => ...;
```

## Rules

- Makes port methods required instead of optional; `logger?.warn?.()` is the smell.
- Implement the full interface; a partial null object fails at runtime on the missing method.
- Null objects must be truly neutral: no side effects, safe return values (empty list, `false`, infinity).
- Production composition roots pass real implementations; defaults are for tests and optional wiring.
- Export them next to the port so every consumer uses the same one.

## Test it

- Tests omit the collaborator and rely on the null default; no mocks needed.
- One test that the null object satisfies the interface (compile-time) and returns neutral values.

**Related:** `dependency-injection`, `pipeline`, `template-method`
