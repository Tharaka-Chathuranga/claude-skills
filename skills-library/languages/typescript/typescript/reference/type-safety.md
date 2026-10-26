# Type safety

`any` turns the checker off for every value it touches, and it spreads through return types to callers.
The quality ratchet's baseline (`quality-gate`, reference/ratchet.md) counts type escapes per file and
fails when a count goes up.

## Pick the type by where the data comes from

| Source | Type it with |
|---|---|
| Your own API/data models | generated client types (OpenAPI, GraphQL codegen, ORM/schema-generated types) |
| Request body, event payload, queue message, webhook | a schema (zod, valibot, etc.) → inferred type; parse at the entry point |
| `JSON.parse`, `fetch().json()`, storage, env vars | `unknown`, then schema `safeParse` or a type guard |
| LLM / model output | a schema, always parsed; treat failure as an expected error |
| `catch (err)` | `unknown`: `err instanceof Error ? err.message : String(err)` |
| Database rows | the data-access layer's row type, converted to the domain type there |
| Values only passed through | a generic `<T>`, not `any` |
| Literal config and lookup tables | `satisfies Type`, not `as Type` |

## Patterns

**Schema at the boundary** — one definition gives the runtime check and the static type:

```ts
const CreateUserInput = z.object({ email: z.string().email(), name: z.string().min(1) });
type CreateUserInput = z.infer<typeof CreateUserInput>;

const parsed = CreateUserInput.safeParse(body);
if (!parsed.success) return badRequest(parsed.error.flatten());
await createUser(parsed.data); // fully typed from here inward
```

**`unknown` plus a guard** when a schema library is overkill:

```ts
function hasId(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}
```

**Narrowing instead of asserting** — `in`, `typeof`, `instanceof`, discriminant checks, and early returns
on `null`/`undefined` rather than `!`.

**`satisfies`** checks shape without widening: `const ROUTES = { home: '/', user: '/u/:id' } satisfies Record<string, string>;`

**Exhaustive `switch`** with `const unreachable: never = value;` in `default`.

## Generated client types too complex for the compiler

Some generated clients produce types tsc can't compute ("type instantiation is excessively deep",
"union type too complex"). If you hit this:

1. Confine the escape to that single call expression, inside the data-access/service layer.
2. Re-type the result immediately with the generated model type, so nothing downstream sees `any`.
3. Leave a one-line comment naming the compiler error.

That narrow, commented cast restores a type the compiler lost; it is not permission for `as any` elsewhere.

## Not fixes

- `Record<string, any>`, `object`, `Function`, `{}` in place of `any` — the hole is the same size.
- `as unknown as T` — `any` with extra steps.
- `@ts-expect-error` without a reason and a link to the library bug it works around.
- Non-null `!` on network or user data — handle the `null`.
- Loosening `tsconfig` (`strict`, `noImplicitAny`) or disabling lint rules.

## Fixing existing debt

Fix `any`s on the lines you change. Clean a whole file only if the change stays reviewable. Shared
modules and libraries give the most value per fix, because every consumer inherits their types. After a
cleanup, lower the recorded baseline (see `quality-gate`, reference/ratchet.md).
