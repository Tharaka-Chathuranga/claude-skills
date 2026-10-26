# Testing a function

## Rules

- Tests are colocated: `<unit>.test.ts` beside `<unit>.ts`. Test units, not the handler wiring.
- Construct the unit directly and pass plain-object fakes typed by its interfaces. No `jest.mock` of
  modules, no network, no AWS. If a service test needs module mocking, fix the wiring.
- One behaviour per `it`. Assert on recorded call arguments and on the returned value.
- Always cover the skip path and the failure path, not only the happy path.
- Object factories take `Partial<T>` overrides: `const order = (o: Partial<Order> = {}): Order => ({ id: 'o-1', …o })`.
- Time comes from an injected clock with a fixed value.

## Service

```ts
function makeService(order: Order | null = makeOrder()) {
  const orders = { getById: jest.fn().mockResolvedValue(order), save: jest.fn() } satisfies Pick<IOrderRepository, 'getById' | 'save'>;
  const mailer = { send: jest.fn().mockResolvedValue(undefined) } satisfies IMailer;
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new SendReceiptService({ orders, mailer, builder: new ReceiptBuilder(), logger, clock: { now: () => NOW } });
  return { service, orders, mailer, logger };
}

it('does not send when the order does not exist', async () => {
  const { service, mailer } = makeService(null);
  await service.sendReceipt({ userId: 'u-1', orderId: 'missing' });
  expect(mailer.send).not.toHaveBeenCalled();
});
```

Pure builders and utils are used for real inside service tests and get their own direct tests.

## Repository

Fake the document client's `send` and assert on the command input; that pins keys, index names,
and conditions:

```ts
const send = jest.fn().mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });
const repo = new OrderRepository({ send } as unknown as DynamoDBDocumentClient, { order: 'orders' });
await repo.listByCustomer('c-1');
expect(send.mock.calls[0][0].input).toMatchObject({ IndexName: 'ordersByCustomer', ExpressionAttributeValues: { ':c': 'c-1' } });
```

Cover: pagination loops until `LastEvaluatedKey` is absent; `UnprocessedKeys`/`UnprocessedItems` are
retried; condition failures map to domain outcomes. If the project uses `aws-sdk-client-mock`, use it
for repository tests only.

## Model-call units

```ts
const model = { complete: jest.fn().mockResolvedValue(JSON.stringify(RESULT)) } satisfies IModelClient;
```

Assert that the parsed result maps into the domain shape, that fallbacks fire on empty fields, that a
malformed response rejects (zod throws), and that the prompt built from a known input contains the
constraints that must reach the model.

## Retried event handlers

For SQS/EventBridge consumers, add a test that runs the service twice with the same input and asserts
the end state is unchanged (idempotency), and one that a failing record is reported, not thrown.

## Manual harness

`manual/run-real.ts` for functions calling a model or third-party API: a hardcoded sample input,
in-memory fakes for repositories, and the real client, so the real call runs without a deploy. Read
keys from the local environment; never commit them.
