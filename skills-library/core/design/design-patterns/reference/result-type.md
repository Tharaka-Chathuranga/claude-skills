# Result type

**Use when:** failures are expected and recoverable and the caller must handle them (validation, not found, conflict).
**Don't when:** bugs or unexpected infra failures; keep `throw` for those.
**Lighter first:** a discriminated outcome union specific to the call; a generic `Result` only once several call sites need it.

## Shape

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T) => ({ ok: true, value }) as const;
export const err = <E>(error: E) => ({ ok: false, error }) as const;

type PayError = { kind: 'cardDeclined' } | { kind: 'orderNotFound'; orderId: string };
declare function payOrder(id: string): Promise<Result<Receipt, PayError>>;

// same idea, domain-specific:
type NextStep = { outcome: 'proceed' } | { outcome: 'waiting'; ids: string[] } | { outcome: 'blocked'; reason: string };
```

## Rules

- Type the error as a union with a `kind` discriminant; switch exhaustively at the caller.
- Don't wrap every call or nest `Result<Result<...>>`; convert at one boundary and unwrap early.
- Map to transport at the edge (HTTP status, GraphQL error) in one place.
- Don't catch-and-convert unknown exceptions into a vague `{ kind: 'error' }`; let them throw.

## Test it

- Assert on the returned value: `expect(r).toEqual({ ok: false, error: { kind: 'cardDeclined' } })`.
- One test per error kind the caller is expected to handle.

**Related:** `code-quality` (reference/error-handling.md), `state`, `typescript`
