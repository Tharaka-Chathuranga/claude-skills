# Writes

## Contents

1. Conditional writes and optimistic locking
2. Atomic counters and updates
3. TransactWrite
4. BatchWrite with retry
5. Never write in a loop
6. Client setup

## 1. Conditional writes and optimistic locking

```ts
// Create only if absent
await this.db.send(new PutCommand({
  TableName: this.tables.order,
  Item: order,
  ConditionExpression: 'attribute_not_exists(id)',
}));

// Update only if unchanged since read (version check)
await this.db.send(new UpdateCommand({
  TableName: this.tables.order,
  Key: { id },
  UpdateExpression: 'SET #status = :next, #version = :newVersion, updatedAt = :now',
  ConditionExpression: '#version = :expected',
  ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
  ExpressionAttributeValues: { ':next': next, ':expected': version, ':newVersion': version + 1, ':now': now },
}));
```

- Catch `ConditionalCheckFailedException` (check `error.name`) and translate it into a domain outcome
  (`AlreadyExists`, `StaleVersion`) in the repository; do not leak SDK errors into services.
- Pass `ReturnValuesOnConditionCheckFailure: 'ALL_OLD'` when the caller needs the current item to decide.
- A write that assumes the item exists says so: `ConditionExpression: 'attribute_exists(id)'`, otherwise
  `UpdateItem` silently creates a partial item.

## 2. Atomic counters and updates

- Counters: `UpdateExpression: 'ADD #count :inc'`. Never get, increment in code, then put.
- Append to a list: `SET #items = list_append(if_not_exists(#items, :empty), :new)`.
- Set if missing: `SET createdAt = if_not_exists(createdAt, :now)`.
- `ADD` is not idempotent: a retried event counts twice. Pair counters on retried paths with a
  conditional marker item or a version guard.

## 3. TransactWrite

```ts
await this.db.send(new TransactWriteCommand({
  TransactItems: [
    { Put: { TableName: this.tables.order, Item: order, ConditionExpression: 'attribute_not_exists(id)' } },
    ...lines.map((line) => ({ Put: { TableName: this.tables.orderLine, Item: line } })),
    { Update: {
        TableName: this.tables.customer,
        Key: { id: order.customerId },
        UpdateExpression: 'ADD orderCount :one SET updatedAt = :now',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: { ':one': 1, ':now': order.createdAt },
    } },
  ],
}));
```

- Use it when items must succeed or fail together (parent + children + aggregate).
- Max 100 actions and 4 MB; no two actions on the same item; costs 2x capacity.
- On `TransactionCanceledException`, read `CancellationReasons` (index-aligned with `TransactItems`) to
  report which condition failed.
- Pass a `ClientRequestToken` derived from the business operation to make the whole transaction
  idempotent for 10 minutes.
- If the item set can exceed 100, it is not a transaction: use chunked BatchWrite and make the
  operation idempotent (deterministic ids, full-item overwrite) so a partial failure can be retried.

## 4. BatchWrite with retry

```ts
const MAX_BATCH_WRITE_ITEMS = 25; // DynamoDB hard limit per BatchWriteItem request

for (const chunk of chunkArray(items, MAX_BATCH_WRITE_ITEMS)) {
  let requests = chunk.map((Item) => ({ PutRequest: { Item } }));
  for (let attempt = 0; requests.length > 0; attempt += 1) {
    if (attempt > MAX_RETRIES) throw new Error(`BatchWrite left ${requests.length} items unprocessed`);
    if (attempt > 0) await sleep(backoffWithJitter(RETRY_BASE_DELAY_MS, attempt));
    const res = await this.db.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
    requests = (res.UnprocessedItems?.[table] ?? []) as typeof requests;
  }
}
```

Put and Delete only — no `Update`, no conditions, no two requests for the same key in one call.

## 5. Never write in a loop

```ts
// Wrong: N round trips, times out as data grows, leaves half-written state
for (const line of lines) await this.db.send(new PutCommand({ TableName, Item: line }));
```

Use one `TransactWriteCommand` (atomic, ≤ 100) or chunked `BatchWriteCommand` (throughput). Same for
reads: a loop of `GetCommand` is a `BatchGetCommand` not yet written.

## 6. Client setup

```ts
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
```

Create it once at module scope in the handler and inject it into every repository. Without
`removeUndefinedValues`, writing an item with an `undefined` field throws. If the project has a client
factory, use it instead of building another.
