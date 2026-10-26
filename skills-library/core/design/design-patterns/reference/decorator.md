# Decorator

**Use when:** cross-cutting concerns (retry, cache, logging, metrics, timing) are duplicated inside implementations of a port.
**Don't when:** only one call site needs the behaviour; put it there.
**Lighter first:** a higher-order function that takes the port and returns the same port type.

## Shape

```ts
export const withRetry = <T extends object>(inner: T, retry: RetryPolicy): T =>
  Object.fromEntries(
    Object.entries(inner).map(([k, fn]) =>
      [k, typeof fn === 'function' ? (...a: unknown[]) => retry.run(() => fn.apply(inner, a)) : fn],
    ),
  ) as T;

// composition root
const orders = withMetrics(withRetry(makeDynamoOrderRepo(client, table), policy), metrics);
```

## Rules

- Same interface in and out; callers must not know they got a decorated instance.
- Compose in the composition root only; never decorate inside a service.
- Order matters: retry inside timing measures one attempt; timing inside retry measures all. Decide explicitly.
- For a small port, write the methods out by hand instead of the generic `Object.entries` trick; it keeps types honest.
- Only retry idempotent operations; cache only reads, keyed on all inputs that affect the result.

## Test it

- Test each decorator alone with a fake inner port (e.g. fails twice, then succeeds).
- Don't re-test decorators through every service.

**Related:** `proxy`, `dependency-injection`, `error-handling`
