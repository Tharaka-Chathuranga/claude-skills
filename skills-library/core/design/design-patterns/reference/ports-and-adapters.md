# Ports and adapters

**Use when:** core logic must be testable without I/O, or must outlive its current database/SDK/provider.
**Don't when:** CRUD pass-through functions; handler → service → repository is enough.
**Lighter first:** inject the concrete dependency typed as `Pick<Concrete, 'method'>`.
**Often over-applied** — a port + adapter + mapper per table for code with no logic between input and storage.

## Shape

```ts
// core/ — owns the port, no I/O imports
export type InvoiceSender = Pick<EmailClient, 'send'>;
export const makeIssueInvoice = (deps: { invoices: InvoiceRepository; sender: InvoiceSender; now: () => Date }) =>
  async (order: Order) => {
    const invoice = toInvoice(order, deps.now());
    await deps.invoices.save(invoice);
    await deps.sender.send(invoice.userEmail, renderInvoice(invoice));
  };

// handler.ts — composition root
const issueInvoice = makeIssueInvoice({ invoices: new DynamoInvoiceRepository(db, table), sender: emailClient, now: () => new Date() });
```

## Rules

- Ports are owned by the consumer and sized to its needs; often just `Pick<Concrete, 'method'>`.
- Core imports nothing from adapters, SDKs or env; dependency arrows point inward.
- Adapters live at the edge and translate types and errors.
- Wire everything in the composition root (handler/main); nowhere else calls `new` on adapters.
- Inject volatile deps (clock, ids, random) too, so core is deterministic.

## Test it

- Core: fakes for every port, no mocking library needed.
- Adapters: contract/integration tests against the real thing.

**Related:** `adapter`, `repository`, `dependency-injection`
