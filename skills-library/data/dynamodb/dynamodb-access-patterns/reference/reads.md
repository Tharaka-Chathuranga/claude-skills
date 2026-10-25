# Reads

## Contents

1. Repository shape
2. Query with pagination
3. Returning a page token to a caller
4. BatchGet: dedupe, chunk, retry, index
5. Bounded fan-out

## 1. Repository shape

```ts
const ORDERS_BY_CUSTOMER_INDEX = 'ordersByCustomer';
const MAX_BATCH_GET_KEYS = 100; // DynamoDB hard limit per BatchGetItem request

export interface OrderTableNames { order: string; customer: string }

export class OrderRepository implements IOrderRepository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly tables: OrderTableNames,
  ) {}
}
```

- Table names arrive as a named object, mapped from env vars by the handler.
- One method per use case (`loadCheckoutContext`), not one per table, when a use case reads several
  tables together.
- A generic single-table repository (get by id, get by ids, query an index) is shared across functions;
  use-case-shaped repositories live with their function. Extend an existing repository before creating a
  new one, and never change a shared method's behaviour without updating every caller.

## 2. Query with pagination

```ts
async listByCustomer(tenantId: string, customerId: string): Promise<Order[]> {
  const items: Order[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await this.db.send(new QueryCommand({
      TableName: this.tables.order,
      IndexName: ORDERS_BY_CUSTOMER_INDEX,
      KeyConditionExpression: 'customerKey = :ck',
      ExpressionAttributeValues: { ':ck': `${tenantId}#${customerId}` },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((page.Items ?? []) as Order[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
```

Drain fully only when the result set is bounded by design. For unbounded sets, return one page.

## 3. Returning a page token to a caller

```ts
const page = await this.db.send(new QueryCommand({ ...params, Limit: limit, ExclusiveStartKey: decode(token) }));
return { items: page.Items as Order[], nextToken: encode(page.LastEvaluatedKey) };
```

- `encode` = base64url of `JSON.stringify(lastEvaluatedKey)`; `decode` validates the shape and rejects a
  token whose partition key does not belong to the caller's tenant (a forged token is a cross-tenant read).
- With a `FilterExpression`, a page can hold fewer than `limit` items (even zero) while `nextToken` is set.
  Clients must keep paging on `nextToken`, not on item count.

## 4. BatchGet: dedupe, chunk, retry, index

```ts
const MAX_BATCH_GET_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 50;

async getByIds(ids: string[]): Promise<Map<string, Order>> {
  const result = new Map<string, Order>();
  const unique = [...new Set(ids)];                        // duplicates are a hard API error
  let pending = unique.map((id) => ({ id }));

  for (let attempt = 0; pending.length > 0; attempt += 1) {
    if (attempt > MAX_BATCH_GET_RETRIES) throw new Error(`BatchGet left ${pending.length} keys unprocessed`);
    if (attempt > 0) await sleep(backoffWithJitter(RETRY_BASE_DELAY_MS, attempt));
    const next: { id: string }[] = [];
    for (const chunk of chunkArray(pending, MAX_BATCH_GET_KEYS)) {
      const res = await this.db.send(new BatchGetCommand({
        RequestItems: { [this.tables.order]: { Keys: chunk } },
      }));
      for (const item of (res.Responses?.[this.tables.order] ?? []) as Order[]) result.set(item.id, item);
      next.push(...((res.UnprocessedKeys?.[this.tables.order]?.Keys ?? []) as { id: string }[]));
    }
    pending = next;
  }
  return result;
}

const backoffWithJitter = (base: number, attempt: number) =>
  Math.random() * Math.min(2_000, base * 2 ** attempt); // full jitter, capped at 2 s
```

- Results come back in arbitrary order and omit missing keys: always index by key into a `Map`, never zip
  the response onto the request array by position.
- Chunks can run in parallel with a concurrency bound when the key set is large.
- Wide items can hit the 16 MB response cap before 100 keys; chunk smaller for them.

## 5. Bounded fan-out

When per-item work cannot be batched (a `Query` per parent), run it concurrently with a bound:

```ts
const results = await mapWithConcurrency(parentIds, 10, (id) => this.queryChildren(id));
```

Unbounded `Promise.all` over user-driven lists causes throttling and connection exhaustion.
