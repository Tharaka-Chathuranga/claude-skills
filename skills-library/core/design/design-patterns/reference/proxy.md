# Proxy

**Use when:** you need a stand-in with the identical interface for lazy init, access control, or a remote object.
**Don't when:** the goal is adding behaviour around calls; that's a decorator, write it explicitly.
**Lighter first:** an explicit decorator, or a lazy getter (`let client: X | undefined; const get = () => (client ??= make())`).

## Shape

```ts
export const lazyReportRenderer = (make: () => ReportRenderer): ReportRenderer => {
  let real: ReportRenderer | undefined;
  return {
    render: (report) => (real ??= make()).render(report),
  };
};

export const guardedInvoices = (inner: InvoiceRepository, user: User): InvoiceRepository => ({
  getById: async (id) => (canRead(user, id) ? inner.getById(id) : forbidden()),
});
```

## Rules

- Rare in app code; reach for it only with a concrete lazy/remote/guard requirement.
- JS `Proxy` returning `any` to silence types is a smell; write the interface methods out.
- Access-control proxies must not be the only check; authorise in the service too, server-side.
- Lazy proxies hide first-call latency and failures; log/measure the init.

## Test it

- Lazy: assert `make` is not called until first use and called once.
- Guard: allowed and denied cases against a fake inner port.

**Related:** `decorator`, `adapter`, `security-basics`
