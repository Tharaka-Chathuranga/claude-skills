# Facade

**Use when:** several callers repeat the same multi-step orchestration across subsystems, or a constructor takes 5+ deps that form a natural cluster.
**Don't when:** it would be a pass-through layer that forwards calls and adds no policy.
**Lighter first:** one well-named function that does the orchestration, called from each site.

## Shape

```ts
export class Checkout {
  constructor(private readonly payments: PaymentGateway, private readonly invoices: InvoiceRepository,
              private readonly mailer: Mailer) {}

  async complete(order: Order): Promise<Invoice> {
    const charge = await this.payments.charge(order.payment);
    const invoice = await this.invoices.save(toInvoice(order, charge));
    await this.mailer.sendReceipt(order.userId, invoice);
    return invoice;
  }
}
```

## Rules

- Detection: the same 3+ calls in the same order in several handlers, or over-injected constructors.
- Group deps that change together; a facade over unrelated things is a god object.
- Name it for the task (`Checkout`, `ReportExport`), not `XFacade` or `XManager`.
- Expose task-level methods; never return the inner subsystems to callers.
- Build it in the composition root with its deps injected; callers depend on it, not on the parts.

## Test it

- Test the facade with fakes for each subsystem; assert ordering and failure handling (e.g. no receipt if charge fails).
- Callers stub the facade as a single dependency.

**Related:** `dependency-injection`, `ports-and-adapters`, `design-principles`
