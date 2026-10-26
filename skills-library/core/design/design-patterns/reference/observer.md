# Observer

**Use when:** one event triggers several independent reactions with decoupled lifetimes (e.g. `OrderPaid` → email, analytics, stock).
**Don't when:** there is a single synchronous consumer; call it directly.
**Lighter first:** the platform's event bus/emitter with a typed event map; don't hand-roll one.

## Shape

```ts
type Events = {
  orderPaid: { orderId: string; amount: number };
  userDeleted: { userId: string };
};
type Handler<K extends keyof Events> = (e: Events[K]) => void | Promise<void>;

export interface EventBus {
  emit<K extends keyof Events>(type: K, event: Events[K]): Promise<void>;
  on<K extends keyof Events>(type: K, h: Handler<K>): () => void; // returns unsubscribe
}
```

## Rules

- Type the event map; `Record<string, any>` payloads are a smell. Validate at the consumer edge when events cross a process.
- Every `on` returns an unsubscribe; React effects must return it from cleanup or they leak.
- Hidden control flow: name events in past tense for facts, and keep a list of subscribers discoverable (one registration module).
- One handler's failure must not break the others; decide per handler: log, retry, or dead-letter.
- Inject the bus as a port; register subscribers in the composition root.

## Test it

- Emitter side: fake bus records emitted events; assert type + payload.
- Each handler: call it directly with a typed payload.

**Related:** `command`, `ports-and-adapters`, `react-hook`
