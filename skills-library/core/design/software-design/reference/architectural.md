## Contents

- Layered architecture (and the dependency rule)
- Composition root + dependency injection
- Service layer
- Repository
- Ports & adapters (hexagonal)
- Unit of work / transactions
- CQRS-lite
- Sizing the architecture to the codebase

## Layered architecture (and the dependency rule)

**Problem:** UI, business rules and persistence are tangled, so a change in one ripples everywhere.

**When to use:** almost always, in its light form: **entry point → service → repository/adapter**, with
pure domain functions used by services. Dependencies point one way only: inward/downward.

**When not to:** don't add layers that only forward calls (a "manager" that calls a "service" that calls
a "helper" with the same signature). A script or a 50-line function needs no layers.

```
entry (handler / controller / component)  — parse input, wire deps, map errors to responses
  └─ service                              — orchestrates one use case; no framework types
       ├─ domain (pure functions/types)    — rules, calculations, validation
       └─ ports → adapters/repositories    — I/O behind interfaces
```

**Seen in:** feature-sliced frontends (app → features → shared), backend handler/service/repository splits.

## Composition root + dependency injection

**Problem:** units construct their own clients, read env vars, or call `new Date()`, so they can't be
tested without real infrastructure and their dependencies are invisible.

**When to use:** always for anything that does I/O. One place — the entry point — builds the object graph
and passes it down. Everything else declares what it needs in its constructor or parameters.

**When not to:** a DI container is optional; manual wiring is clearer until the graph is large. Pure
functions don't need injection.

```ts
// handler.ts — the only file that calls `new` on infrastructure or reads env
const db = createDbClient();            // module scope: reused across warm invocations
const logger = createLogger('close-invoice');

export const handler = async (event: unknown) => {
  const input = CloseInvoiceInput.parse(event);   // validate at the edge
  const service = new CloseInvoiceService(
    new InvoiceRepository(db, requireEnv('INVOICE_TABLE')),
    new EmailNotifier(createMailer()),
    systemClock,
    logger,
  );
  return service.run(input);
};
```

**Seen in:** serverless handlers and `main()` are composition roots; frameworks with DI (NestJS, Spring,
Angular) do the wiring in modules; React uses context providers at the app root.

## Service layer

**Problem:** use-case logic lives in controllers, handlers or UI components and gets duplicated between them.

**When to use:** one service method per use case, orchestrating repositories/adapters and pure domain
functions. It owns the transaction boundary and the order of side effects.

**When not to:** CRUD with no rules — the entry point can call the repository directly. A service that
only forwards to one repository method is an anemic layer.

```ts
export class CloseInvoiceService {
  constructor(private readonly invoices: InvoiceStore, private readonly notifier: Notifier,
              private readonly clock: Clock, private readonly logger: Logger) {}
  async run({ invoiceId }: { invoiceId: string }) {
    const invoice = await this.invoices.get(invoiceId);
    if (!invoice) throw new NotFoundError('invoice', invoiceId);
    const closed = closeInvoice(invoice, this.clock.now()); // pure
    await this.invoices.save(closed);
    await this.notifier.invoiceClosed(closed).catch((error) =>
      this.logger.warn('notification failed', { invoiceId, error })); // best-effort
    return closed;
  }
}
```

**Seen in:** backend use-case classes; frontend hooks that orchestrate API calls play the same role.

## Repository

**Problem:** queries, key formats and persistence details are scattered across services; changing a table
or index means hunting through business code.

**When to use:** all persistence for an aggregate goes through one repository that speaks domain types and
hides keys, indexes, pagination and batching.

**When not to:** don't build a generic `Repository<T>` with every possible query — expose the queries the
use cases actually need. Don't wrap an ORM's repository in an identical repository.

```ts
export interface InvoiceStore {
  get(id: string): Promise<Invoice | null>;
  listOpenByCustomer(customerId: string, cursor?: string): Promise<Page<Invoice>>;
  save(invoice: Invoice): Promise<void>;
}
export class InvoiceRepository implements InvoiceStore {
  constructor(private readonly db: DbClient, private readonly table: string) {}
  async get(id: string) {
    const row = await this.db.get({ table: this.table, key: { pk: `INVOICE#${id}` } });
    return row ? toInvoice(row) : null; // row type never leaves the repository
  }
  /* ... */
}
```

**Seen in:** data-access modules for key-value and SQL stores; frontend `services.ts` modules wrapping an API client.

## Ports & adapters (hexagonal)

**Problem:** domain code imports framework, SDK or database types, so it can't be reused, tested in
isolation, or moved to a different runtime.

**When to use:** the core defines ports (interfaces in domain terms); adapters implement them for each
technology. Repositories and API wrappers are adapters. Apply the dependency rule: the core imports nothing from adapters.

**When not to:** full hexagonal folder structures for a small service are ceremony. The essential part is
the import direction, not the folder names.

```ts
// core/ports.ts
export interface PaymentGateway { charge(customerId: string, cents: number): Promise<ChargeResult> }
// adapters/card-processor-gateway.ts — the only file importing the vendor SDK
export class CardProcessorGateway implements PaymentGateway { /* translate to/from vendor types */ }
// tests use an in-memory fake implementing PaymentGateway
```

**Seen in:** LLM, payment and email integrations; swapping a real client for a fake in tests or local dev.

## Unit of work / transactions

**Problem:** a multi-step write (debit + credit, create order + reserve stock) can partially fail and leave
inconsistent data.

**When to use:** collect the writes for one use case and commit them atomically — a database transaction,
a transactional batch write, or an outbox record written in the same transaction as the state change.

**When not to:** independent writes where partial success is acceptable and each write is idempotent.
Across services, use idempotent steps plus compensation (saga) — distributed transactions rarely fit.

```ts
export interface UnitOfWork {
  run<T>(work: (tx: { orders: OrderStore; stock: StockStore }) => Promise<T>): Promise<T>;
}
await uow.run(async ({ orders, stock }) => {
  await stock.reserve(order.items);   // all writes commit together,
  await orders.save(order);           // or none do
});
```

**Seen in:** SQL transactions; key-value stores' transactional write APIs (with item-count limits);
the outbox pattern for publishing events reliably.

## CQRS-lite

**Problem:** read screens need joined, denormalised, paginated views while writes need validation and
invariants; one model serves both badly.

**When to use:** separate read functions/models (projections, views, precomputed summaries) from command
handlers, within the same codebase and database. Keep writes going through services and repositories.

**When not to:** simple CRUD where read and write shapes match. Full CQRS with separate stores and event
sourcing is a large commitment — only with a proven scale or audit need.

```ts
// Write side: validated use case
await placeOrderService.run(input);
// Read side: query shaped for the screen, no domain logic
export const listOrderSummaries = (db: DbClient, customerId: string, cursor?: string) =>
  db.query<OrderSummaryRow>({ index: 'byCustomer', key: customerId, cursor, limit: 50 });
```

**Seen in:** dashboard and report endpoints reading precomputed aggregates; search indexes fed by write events.

## Sizing the architecture to the codebase

- Script or one-off job: functions in one file; inject only what tests need to fake.
- Single service: entry → service → repository/adapters, pure domain functions.
- Many services/teams: add explicit ports, module boundaries with public `index` files, events between modules.
- Move up a level when the current one is causing real pain, not in anticipation.
