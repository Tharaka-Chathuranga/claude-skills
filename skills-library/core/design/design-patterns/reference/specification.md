# Specification

**Use when:** business predicates must be combined (and/or/not) AND evaluated both in memory and translated to a query.
**Don't when:** the rule is only checked in memory; a named predicate function is enough.
**Lighter first:** `export const isOverdue = (invoice: Invoice, now: Date) => !invoice.paidAt && invoice.dueAt < now;`
**Often over-applied** — spec class hierarchies wrapping one-line booleans used in a single place.

## Shape

```ts
type Spec<T> = { test: (x: T) => boolean; toQuery: () => QueryFilter };

export const and = <T>(a: Spec<T>, b: Spec<T>): Spec<T> => ({
  test: (x) => a.test(x) && b.test(x),
  toQuery: () => ({ and: [a.toQuery(), b.toQuery()] }),
});

export const overdue = (now: Date): Spec<Invoice> => ({
  test: (i) => !i.paidAt && i.dueAt < now,
  toQuery: () => ({ and: [{ paidAt: { exists: false } }, { dueAt: { lt: now.toISOString() } }] }),
});
```

## Rules

- Pass `now` and other volatile inputs as parameters; never call `new Date()` inside.
- Name predicates in domain language (`isOverdue`, `eligibleForRefund`), not `checkInvoice`.
- `toQuery` output must be translated by the repository adapter, not leak store syntax into core.
- Watch for query translation that can't use an index; a spec that forces a full scan is a bug.

## Test it

- Test `test` and `toQuery` agree: run the same fixtures through both (in-memory vs emulator).

**Related:** `repository`, `strategy`, `code-quality` (reference/naming.md)
