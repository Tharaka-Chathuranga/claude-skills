# Strategy

**Use when:** the same `switch (kind)` appears in several places, or the algorithm is chosen at runtime from config/data.
**Don't when:** 2–3 stable branches in one place; a union + exhaustive `switch` is clearer.
**Lighter first:** a discriminated union with an exhaustive `switch` and `assertNever`.
**Often over-applied** — a class + interface per strategy where a plain function type does the job.

## Shape

```ts
type PricingFn = (order: Order) => Money;
type PricingKind = 'standard' | 'wholesale' | 'promo';

const pricing: Record<PricingKind, PricingFn> = {
  standard: (o) => o.subtotal,
  wholesale: (o) => o.subtotal.times(0.8),
  promo: (o) => o.subtotal.minus(o.discount),
};

const price = (order: Order) => pricing[order.pricingKind](order);
```

## Rules

- Type the map as `Record<Kind, Fn>` so adding a kind without a strategy fails to compile.
- Use a class strategy only when it holds injected deps (e.g. a rates client); build it in the composition root.
- Select once at the edge (handler/factory) and pass the chosen function in; don't re-select deep inside.
- Keep strategies pure where possible; pass volatile inputs (clock, rates) as arguments or deps.
- Don't key on raw strings from input; parse to the `Kind` union first and reject unknowns.

## Test it

- Table-test each strategy alone; one test that every `Kind` has an entry (the type usually guarantees it).
- Test the caller with a stub strategy, not every real one.

**Related:** `factory`, `state`, `typescript-idioms`
