# Testing injected code

## Contents
- Pick the right double
- Fakes typed against the port
- Override factories
- Time, budgets and randomness
- What not to mock
- Contract tests for adapters
- Smells

## Pick the right double

| Double | Use for |
|---|---|
| Fake (working in-memory implementation) | Repositories, stores, caches — assert on resulting state |
| Stub (canned answers) | Ports you only read from (model client returning fixture JSON) |
| Spy / mock (records calls) | Only when the interaction **is** the behaviour: an event was published, an email was sent |

Prefer state verification with fakes; interaction-heavy mocks couple tests to implementation.

## Fakes typed against the port

`satisfies` makes the fake stop compiling when the port changes:

```ts
function makeService({ order = anOrder(), saved = true } = {}) {
  const repository = {
    getById: jest.fn().mockResolvedValue(order),
    save: jest.fn().mockResolvedValue(saved),
  } satisfies OrderRepo;
  const events = { publish: jest.fn().mockResolvedValue(undefined) } satisfies EventPublisher;
  const service = new CloseOrderService(repository, events, { now: () => NOW });
  return { service, repository, events };
}
```

Narrow ports (`Pick<…>`) keep these fakes to one or two methods.

## Override factories

```ts
const makeDeps = (over: Partial<ReportDeps> = {}): ReportDeps => ({
  repository: makeRepo(),
  stages: makeStages(),
  clock: { now: () => NOW },
  ...over,
});
// one change per case:
new ReportService(makeDeps({ timeBudget: { remainingMs: () => 1_000 } }));
```

## Time, budgets and randomness

- A constant `NOW` passed as `{ now: () => NOW }` — no fake timers needed.
- Inject `newId` / `random` when output depends on them; fake timers only for code you can't change yet.
- Budget-dependent branches (skip optional steps when time is short) get one test with a low budget.

## What not to mock

- **Don't mock types you don't own** (`@aws-sdk/*`, axios, the model SDK) in service tests. Wrap them
  in an adapter and fake the adapter.
- Test adapters at their edge: `aws-sdk-client-mock`, a local emulator, or a `{ send: jest.fn() }`
  client passed to the repository's constructor.
- Frontend: mock at the network boundary (MSW) or inject the service; don't stub the client per test.
- Pure functions: call them directly — no doubles.

## Contract tests for adapters

Run one shared suite against both the fake and the real adapter so the fake can't drift; run the
real side in integration/nightly jobs.

```ts
export function orderRepoContract(make: () => Promise<OrderRepo>) {
  it('returns what was saved', async () => {
    const repo = await make();
    await repo.save(anOrder({ id: 'o1' }));
    expect(await repo.getById('o1')).toMatchObject({ id: 'o1' });
  });
}
```

## Smells

- `jest.mock('../module')` in a service test → a hidden dependency; inject it.
- A test that passes the **real** class for an injected interface → the interface isn't earning its keep.
- Tests asserting call order of five mocks → test the outcome instead.
