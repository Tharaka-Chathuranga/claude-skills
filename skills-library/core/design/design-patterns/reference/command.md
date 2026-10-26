# Command

**Use when:** an operation must be queued, retried, undone, audited or serialized (sent over a queue, stored, replayed).
**Don't when:** it's a plain synchronous call; just call the function.
**Lighter first:** a `{ type, payload }` discriminated union plus a handler map (reducer actions already are commands).

## Shape

```ts
type Command =
  | { type: 'refundPayment'; payload: { paymentId: string; amount: number } }
  | { type: 'resendInvoice'; payload: { invoiceId: string } };

type Handlers = { [K in Command['type']]: (p: Extract<Command, { type: K }>['payload']) => Promise<void> };

export const dispatch = (handlers: Handlers) => (cmd: Command) =>
  handlers[cmd.type](cmd.payload as never);
```

## Rules

- Commands are data: serializable, no functions or class instances in the payload.
- Name in imperative (`refundPayment`); events are past tense (`paymentRefunded`).
- Retried/queued commands must be idempotent: carry an id and dedupe in the handler.
- Validate the payload (schema) when it arrives from a queue or the network before dispatching.
- Undo needs an explicit inverse command or a stored prior state; don't promise undo you can't honour.

## Test it

- Test each handler with a typed payload and fake ports.
- One test that `dispatch` routes every `type` (the mapped type enforces coverage at compile time).

**Related:** `observer`, `middleware-chain`, `result-type`
