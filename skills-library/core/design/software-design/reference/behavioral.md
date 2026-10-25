## Contents

- Strategy
- Observer / pub-sub
- Command
- Chain of responsibility (pipeline)
- Template method
- State (state machine)
- Iterator / generator

Behavioral patterns are about varying or sequencing behaviour. In languages with first-class functions,
most of them collapse to "pass a function" — prefer that form before writing classes.

## Strategy

**Problem:** a `switch`/`if` chain on a type or mode grows with every variant and is repeated in several places.

**When to use:** variants share a signature, are chosen at runtime, and new ones keep arriving. A map of
functions is the lightweight form; strategy classes when each variant has its own dependencies.

**When not to:** two stable variants in one place — keep the `if`. One switch with an exhaustive `never`
check is fine and easier to read than indirection.

```ts
interface PricingStrategy { price(base: number, qty: number): number }
const strategies: Record<Plan, PricingStrategy> = {
  flat: { price: (base, qty) => base * qty },
  tiered: { price: (base, qty) => base * Math.min(qty, 10) + base * 0.8 * Math.max(qty - 10, 0) },
};
export const quote = (plan: Plan, base: number, qty: number) =>
  strategies[plan].price(base, qty);
```

**Seen in:** per-type handlers, export formats, LLM provider selection, sorting comparators.

## Observer / pub-sub

**Problem:** module A must trigger reactions in B, C, D, but A shouldn't import or know about them.

**When to use:** genuinely independent reactions (notifications, analytics, cache invalidation), especially
across service boundaries (message queues, event buses).

**When not to:** when the caller needs the result, or ordering and failure handling matter — call the
function directly. In-process event emitters make control flow invisible; use sparingly and name events
as past-tense facts.

```ts
type Events = { orderPlaced: { orderId: string; total: number } };
type Listener<K extends keyof Events> = (payload: Events[K]) => void | Promise<void>;
export class EventBus {
  private listeners: { [K in keyof Events]?: Listener<K>[] } = {};
  on<K extends keyof Events>(event: K, fn: Listener<K>) {
    (this.listeners[event] ??= []).push(fn);
  }
  async emit<K extends keyof Events>(event: K, payload: Events[K]) {
    await Promise.allSettled((this.listeners[event] ?? []).map((fn) => fn(payload)));
  }
}
```

**Seen in:** cloud event buses and queues between services; UI state stores and subscriptions; DOM events.

## Command

**Problem:** actions must be queued, retried, logged, scheduled, or undone — so they need to exist as data.

**When to use:** job queues, undo/redo, audit logs, offline sync, batched operations.

**When not to:** an action that runs immediately once — just call the function.

```ts
type Command =
  | { type: 'rename'; id: string; from: string; to: string }
  | { type: 'delete'; id: string; snapshot: Item };
const apply = (s: State, c: Command): State => { /* forward */ return s; };
const revert = (s: State, c: Command): State => { /* inverse */ return s; };
export function undo(history: Command[], state: State) {
  const last = history.at(-1);
  return last ? { state: revert(state, last), history: history.slice(0, -1) } : { state, history };
}
```

**Seen in:** queue messages are serialised commands; reducer actions; editor undo stacks.

## Chain of responsibility (pipeline)

**Problem:** a sequence of validators, transforms or handlers, where each may stop the chain or pass on,
and the sequence varies by context.

**When to use:** request middleware, validation rule lists, multi-stage processing pipelines.

**When not to:** a fixed three-step sequence — call the three functions in order. Don't hide simple linear code behind a generic pipeline engine.

```ts
type Check = (input: Signup) => string | null; // error message or null
const checks: Check[] = [
  (i) => (i.email.includes('@') ? null : 'invalid email'),
  (i) => (i.password.length >= 12 ? null : 'password too short'),
];
export const validate = (input: Signup) =>
  checks.map((c) => c(input)).filter((e): e is string => e !== null);
```

**Seen in:** HTTP and serverless middleware; multi-stage generation pipelines where each stage enriches a context object.

## Template method

**Problem:** several workflows share a skeleton but differ in a few steps.

**When to use:** prefer passing the varying steps as functions to one orchestrator. Use an abstract base
class only when the language or framework requires it.

**When not to:** when the "shared skeleton" is two lines — duplication is cheaper than the coupling.

```ts
export async function runImport<T>(steps: {
  fetch: () => Promise<unknown[]>; parse: (raw: unknown) => T; save: (items: T[]) => Promise<void>;
}) {
  const items = (await steps.fetch()).map(steps.parse);
  await steps.save(items);
  return items.length;
}
```

**Seen in:** framework lifecycle hooks; test fixtures with setup/teardown.

## State (state machine)

**Problem:** behaviour depends on a lifecycle, and boolean flags (`isSubmitted`, `isClosed`) create
impossible combinations.

**When to use:** explicit states with allowed transitions. Model states as a discriminated union and
transitions as a pure function; a state-machine library only when there are many states and events.

**When not to:** two states — a boolean or nullable field is fine.

```ts
type Doc =
  | { status: 'draft'; body: string }
  | { status: 'submitted'; body: string; submittedAt: Date }
  | { status: 'closed'; body: string; closedReason: string };
export function submit(doc: Doc, now: Date): Doc {
  if (doc.status !== 'draft') throw new Error(`Cannot submit a ${doc.status} document`);
  return { status: 'submitted', body: doc.body, submittedAt: now };
}
```

**Seen in:** order and workflow lifecycles; UI request states (`idle | loading | success | error`).

## Iterator / generator

**Problem:** consumers need to walk a large or paginated source without loading it all or knowing the paging mechanics.

**When to use:** paginated APIs, streams, lazily computed sequences.

**When not to:** small in-memory arrays — use array methods.

```ts
export async function* allPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; next?: string }>) {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.next;
  } while (cursor);
}
```

**Seen in:** SDK paginators; Dart `Stream`s; reading large files line by line.
