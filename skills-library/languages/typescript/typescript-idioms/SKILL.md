---
name: typescript-idioms
description: Applies software design idiomatically in TypeScript — functions and interfaces first, classes only for services with injected dependencies, discriminated unions over hierarchies, readonly data, exhaustive switches, index.ts boundaries, union literals over enums. Use when asked "class or function", "OOP in TypeScript", "should this be a class", or "how do I model this type".
---

# TypeScript idioms

How the principles in `design-principles` translate into TypeScript. For removing `any` and validating I/O,
use `type-safety`.

## Rules, in priority order

1. **Functions and types first.** Pure logic is exported functions over plain data. Reach for a class
   only for a unit that holds injected dependencies or real internal state (services, repositories,
   adapters, builders).
2. **Classes get dependencies through the constructor, typed by interface.** `private readonly` on every
   dependency; no `new` of collaborators inside the class; no static mutable state.
3. **Model variants as discriminated unions**, not class hierarchies. One `kind`/`type`/`status` literal
   field, then narrow with `switch`.
4. **Every `switch` over a union is exhaustive** with a `never` default, so a new variant is a compile error
   at each place that must handle it.
5. **Data is immutable by default.** `readonly` fields, `ReadonlyArray<T>`/`readonly T[]`, `as const` for
   literal tables. Return new objects; don't mutate inputs.
6. **Union literals or `as const` objects over `enum`.** They erase cleanly, narrow well and serialise as-is.
7. **Module boundaries via `index.ts`.** Each folder exports its public surface from `index.ts`; other
   folders import only from there, never deep paths into internals. Keep barrels per-feature, not one
   giant root barrel (hurts tree-shaking and creates cycles).
8. **No inheritance for reuse.** At most one level of `extends`, for framework requirements (e.g. `Error`
   subclasses). Share behaviour with functions or injected collaborators.
9. **Interfaces describe consumers' needs.** Small, defined near the consumer; structural typing means
   providers satisfy them without `implements` (add `implements` on classes anyway, for early errors).
10. **Options objects** for three or more parameters or any optional flag; no positional booleans.

## Examples

```ts
// Union + exhaustive switch instead of a Shape class hierarchy
type Shape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect'; readonly width: number; readonly height: number };

export function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.radius ** 2;
    case 'rect': return shape.width * shape.height;
    default: {
      const unreachable: never = shape;
      throw new Error(`Unhandled shape: ${JSON.stringify(unreachable)}`);
    }
  }
}
```

```ts
// Class only where there are injected dependencies
export interface Clock { now(): Date }
export class SessionService implements SessionStarter {
  constructor(
    private readonly sessions: SessionStore,
    private readonly clock: Clock,
  ) {}
  start(userId: string): Promise<Session> {
    return this.sessions.create({ userId, startedAt: this.clock.now() });
  }
}
```

```ts
// Literal table instead of enum
export const ROLES = ['viewer', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];
const LABELS = { viewer: 'Viewer', editor: 'Editor', admin: 'Admin' } satisfies Record<Role, string>;
```

## Smaller idioms

- `type` for unions and computed types; `interface` for object contracts that classes implement. Pick one
  per kind and stay consistent with the codebase.
- Utility types (`Pick`, `Omit`, `Partial`, `Readonly`) to derive, not copy, related shapes. Derive types
  from a single source (`z.infer`, `typeof CONST`, generated client types).
- Branded types for ids that must not be mixed: `type UserId = string & { readonly __brand: 'UserId' }`.
- `Result`-style unions (`{ ok: true; value } | { ok: false; error }`) for expected failures in pure code;
  throw for unexpected ones.
- Errors: `throw new Error('context', { cause })`; custom `Error` subclasses only when callers branch on them.
- `async` functions return `Promise<T>` explicitly at module boundaries; never leave a promise unawaited
  unless deliberately fire-and-forget with its own `.catch`.
- In React code, hooks are the composition unit instead of classes: a hook owns state and effects,
  components render, services do I/O.
