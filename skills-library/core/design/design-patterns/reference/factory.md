# Factory

**Use when:** construction needs a decision (which implementation) or non-trivial wiring of deps and config.
**Don't when:** it would just wrap `new X()` with no decision or wiring.
**Lighter first:** a plain `makeX(deps, config)` function returning the object.
**Often over-applied** — Abstract Factory hierarchies outside the composition root; families of products rarely vary together in app code.

## Shape

```ts
type PaymentGateway = { charge(p: Payment): Promise<ChargeResult> };

export function makePaymentGateway(
  deps: { http: HttpClient; logger: Logger },
  config: { provider: 'card' | 'bank'; apiKey: string },
): PaymentGateway {
  return config.provider === 'card'
    ? makeCardGateway(deps.http, config.apiKey)
    : makeBankGateway(deps.http, deps.logger);
}
```

## Rules

- Name it `makeX` / `createX`; return the port type, not the concrete class.
- Call factories from the composition root; services receive the built object, not the factory.
- Inject a factory function only when construction needs per-call data: `createMapper(cfg)` per request/tenant.
- Factories take config as arguments; they never read `process.env` themselves.
- No static `Factory.getInstance()` registries; they hide dependencies and break test isolation.

## Test it

- Test the decision: given each config, assert the returned implementation's behaviour (not `instanceof`).
- Unit-test consumers with a fake port; they should never see the factory.

**Related:** `dependency-injection`, `strategy`, `builder`
