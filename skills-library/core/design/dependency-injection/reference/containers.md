# DI containers in TypeScript

**Default: pure DI** — manual wiring in the composition root with constructors and factory functions.
It is fully type-checked, needs no decorators, keeps lifetimes visible, and bundles cleanly with
esbuild/Vite (Lambda, Next.js).

## When a container can pay off

- A very large composition root where convention-based registration saves real effort.
- You need interception (cross-cutting behaviour applied by configuration across many services).

If neither is true, a container adds magic and hides lifetime mistakes.

## Costs in TypeScript

- tsyringe and InversifyJS rely on legacy `experimentalDecorators` + `emitDecoratorMetadata` +
  `reflect-metadata`. TS 5 standard decorators have no parameter decorators or emitted metadata, and
  esbuild/Vite don't emit that metadata — you end up writing manual injection tokens anyway.
- Resolution errors move from compile time to runtime.
- Lifetimes (singleton / scoped / transient) are declared far from use, so captive dependencies slip
  through review.

## If you use one anyway

- Resolve **once**, in the composition root. Never inject or import the container into application
  code (that is a service locator).
- Register per-request things as scoped and verify no singleton depends on them.
- Keep constructors plain (no container types) so units stay testable without it.
