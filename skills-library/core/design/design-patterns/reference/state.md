# State

**Use when:** behaviour depends on a status field and only some transitions are legal (Order: pending → paid → shipped).
**Don't when:** the status is just a label with no transition rules.
**Lighter first:** a union of states + a pure `transition(state, event)` reducer; a state-machine library only for complex nested/parallel states.
**Often over-applied** — class-per-state hierarchies where a reducer fits in one screen.

## Shape

```ts
type OrderState =
  | { status: 'pending' }
  | { status: 'paid'; paidAt: Date }
  | { status: 'shipped'; paidAt: Date; trackingId: string };
type OrderEvent = { type: 'pay'; at: Date } | { type: 'ship'; trackingId: string };

export function transition(s: OrderState, e: OrderEvent): Result<OrderState, IllegalTransition> {
  if (s.status === 'pending' && e.type === 'pay') return ok({ status: 'paid', paidAt: e.at });
  if (s.status === 'paid' && e.type === 'ship') return ok({ ...s, status: 'shipped', trackingId: e.trackingId });
  return err({ kind: 'illegalTransition', from: s.status, event: e.type });
}
```

## Rules

- Reject illegal transitions explicitly; never silently ignore or overwrite status.
- Put state-specific data on the variant (`trackingId` only exists when shipped).
- Keep `transition` pure; pass time in the event. Persist with a conditional write on the previous status.
- Detection: scattered `if (order.status === ...)` checks guarding mutations across services.

## Test it

- Table-test every (state, event) pair: legal → expected next state, illegal → error.

**Related:** `strategy`, `result-type`, `typescript`
