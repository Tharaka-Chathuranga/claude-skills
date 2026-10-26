# Middleware chain (Chain of Responsibility)

**Use when:** ordered, optional pre/post steps wrap a handler and some may short-circuit (auth → validate → handle).
**Don't when:** steps always run in a fixed order with no short-circuit; write a plain sequence of calls.
**Lighter first:** the framework's middleware (Express, middy, Next.js) before a custom chain.

## Shape

```ts
type Next<R> = () => Promise<R>;
type Middleware<C, R> = (ctx: C, next: Next<R>) => Promise<R>;

export const compose = <C, R>(mws: Middleware<C, R>[], handler: (ctx: C) => Promise<R>) =>
  (ctx: C): Promise<R> =>
    mws.reduceRight<Next<R>>((next, mw) => () => mw(ctx, next), () => handler(ctx))();

const requireUser: Middleware<Ctx, Res> = (ctx, next) =>
  ctx.user ? next() : Promise.resolve({ status: 401 });
```

## Rules

- Order is behaviour: declare the chain in one place (composition root / route setup), not scattered.
- Each middleware does one thing; call `next()` at most once; return its result unchanged unless deliberately mapping.
- Type what each middleware adds to `ctx` (e.g. `Ctx & { user: User }`) instead of mutating `any`.
- Business logic stays in the handler; middleware is for cross-cutting policy.

## Test it

- Test each middleware with a stub `next` (assert called / not called and the returned result).
- One test of the composed chain order.

**Related:** `decorator`, `command`, `pipeline`
