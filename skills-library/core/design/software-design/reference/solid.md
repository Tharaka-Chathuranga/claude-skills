## Contents

- Single responsibility (SRP)
- Open/closed (OCP)
- Liskov substitution (LSP)
- Interface segregation (ISP)
- Dependency inversion (DIP)
- Applying SOLID without over-engineering

Each principle is a diagnostic, not a goal. Apply it when its test fails on real code.

## Single responsibility (SRP)

**Problem:** a unit changes for unrelated reasons (pricing rules and email formatting in one class), so
edits collide and tests need unrelated setup.

**Test:** one-sentence description without "and"; one group of people asks for its changes.

**When not to:** don't split a 40-line cohesive function into five files. Responsibility is about reasons
to change, not line count.

```ts
// Before: computes, persists and notifies
class InvoiceService {
  async close(id: string) { /* calc totals + db write + send email */ }
}
// After: pure calculation, orchestration with injected I/O
export const computeTotals = (lines: Line[]): Totals => ({
  net: sum(lines.map((l) => l.net)),
  tax: sum(lines.map((l) => l.tax)),
});
class CloseInvoice {
  constructor(private readonly invoices: InvoiceRepo, private readonly notifier: Notifier) {}
  async run(id: string) {
    const invoice = await this.invoices.get(id);
    const closed = { ...invoice, totals: computeTotals(invoice.lines), status: 'closed' as const };
    await this.invoices.save(closed);
    await this.notifier.invoiceClosed(closed);
  }
}
```

**Seen in:** UI components that fetch, transform and render — move fetch to a hook/service, transform to a pure function.

## Open/closed (OCP)

**Problem:** every new variant means editing the same switch statements in several files.

**Test:** count files a new variant touches. More than one or two → close the variation behind a map or strategy.

**When not to:** a single switch in one place with an exhaustiveness check is already open/closed enough;
the compiler finds the one edit. Don't build plugin systems for two variants.

```ts
type Exporter = (rows: Row[]) => string;
const exporters: Record<Format, Exporter> = { csv: toCsv, json: toJson };
export const exportRows = (format: Format, rows: Row[]) => exporters[format](rows);
// New format: add one function and one map entry; nothing else changes.
```

**Seen in:** payment/notification channels, file formats, report types.

## Liskov substitution (LSP)

**Problem:** a subtype weakens the contract (throws on a method, ignores an argument, narrows accepted input),
so callers add `instanceof` checks.

**Test:** could every caller of the parent receive the subtype unchanged?

**When not to:** irrelevant without subtyping. The usual fix is to stop subtyping: model variants as a
discriminated union or separate interfaces.

```ts
// Violation: ReadOnlyStore extends Store but throws from save()
// Fix: split capabilities so nothing promises what it can't do
interface Reader<T> { get(id: string): Promise<T | null> }
interface Writer<T> { save(item: T): Promise<void> }
class CacheStore<T> implements Reader<T> { /* ... */ }
class DbStore<T> implements Reader<T>, Writer<T> { /* ... */ }
```

**Seen in:** `Square extends Rectangle`, read-only collections extending mutable ones, "not supported" overrides.

## Interface segregation (ISP)

**Problem:** consumers depend on fat interfaces; test fakes stub ten methods to exercise one.

**Test:** does the consumer call every method of the type it depends on?

**When not to:** don't pre-slice an interface into one-method pieces before any consumer exists.
Define the interface at the consumer, when the consumer is written.

```ts
// Consumer-owned, minimal
interface UserLookup { getById(id: string): Promise<User | null> }
export const greet = async (users: UserLookup, id: string) =>
  `Hello ${(await users.getById(id))?.name ?? 'guest'}`;
// The full UserRepository class satisfies UserLookup structurally.
```

**Seen in:** TypeScript and Go satisfy small interfaces structurally — no `implements` needed at the provider.

## Dependency inversion (DIP)

**Problem:** business logic imports the database client, HTTP SDK or clock, so it can't be tested or
reused without them.

**Test:** can the unit run in a unit test with plain in-memory fakes?

**When not to:** pure functions need no abstraction. Don't wrap stable, deterministic libraries
(a date-formatting or collection utility) behind interfaces.

```ts
interface Clock { now(): Date }
interface OrderRepo { save(o: Order): Promise<void> }
export class PlaceOrder {
  constructor(private readonly repo: OrderRepo, private readonly clock: Clock) {}
  run(input: NewOrder) { return this.repo.save({ ...input, placedAt: this.clock.now() }); }
}
// Composition root: new PlaceOrder(new SqlOrderRepo(pool), { now: () => new Date() })
```

**Seen in:** serverless handlers and `main()` as composition roots; DI containers in frameworks that provide them.

## Applying SOLID without over-engineering

- Start concrete. Extract an interface when a second implementation or a test fake actually needs it.
- SRP and DIP pay off fastest (testability). OCP matters only where variants really grow.
- If following a principle adds more indirection than it removes, the principle isn't the problem being solved.
