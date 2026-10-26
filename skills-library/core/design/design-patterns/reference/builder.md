# Builder

**Use when:** many optional parts, staged validation, or an immutable result assembled step by step.
**Don't when:** an options object with defaults covers it, which in TS is almost always.
**Lighter first:** `const opts = { ...defaults, ...overrides }` with a typed `Options` and `Partial<Options>` input.
**Often over-applied** — stateless one-method "builder" classes behind interfaces that are really pure mapping functions.

## Shape

```ts
// Best use: test-data builders
export const anOrder = (base: Partial<Order> = {}) => {
  let order: Order = { id: 'o-1', status: 'pending', lines: [], ...base };
  const api = {
    withStatus: (status: Order['status']) => ((order = { ...order, status }), api),
    withLine: (line: OrderLine) => ((order = { ...order, lines: [...order.lines, line] }), api),
    build: (): Order => structuredClone(order),
  };
  return api;
};
// anOrder().withStatus('paid').build()
```

## Rules

- If the "builder" has one `build(input)` method and no accumulated state, rename it to `toX(input)` and make it a function.
- Validate in `build()`, return the domain type (or a `Result`), never a half-built object.
- Test builders live next to tests (`test/builders/`), give valid defaults, and expose only fields tests vary.
- Production builders for query/request objects are fine when the target API is genuinely incremental.

## Test it

- Production builders: test `build()` rejects invalid combinations and returns frozen/immutable output.
- Test-data builders need no tests of their own; keep them trivial.

**Related:** `factory`, `result-type`, `jest-tests`
