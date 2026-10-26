# Repository

**Use when:** domain code needs collection-like persistence and must not see keys, pagination tokens or marshalling.
**Don't when:** a one-off script or a read-only projection served straight from a query.
**Lighter first:** a small module of named data-access functions taking the client as an argument.
**Often over-applied** — generic `Repository<T>` with `find(where)`; it leaks the query model and ignores index design.

## Shape

```ts
export interface OrderRepository {
  getById(id: string): Promise<Order | undefined>;
  listByCustomer(customerId: string, page?: PageToken): Promise<Page<Order>>;
  save(order: Order, expectedVersion: number): Promise<Result<void, 'versionConflict'>>;
}

export class DynamoOrderRepository implements OrderRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly tableName: string) {}
  // ...maps items <-> Order, hides keys and LastEvaluatedKey
}
```

## Rules

- Name methods after access patterns (`getById`, `listByCustomer`, `save`), not CRUD on arbitrary filters.
- One adapter per store; client + table names via constructor. No env reads, no module-level client inside.
- Return domain types, never `any` or raw items; map at the boundary.
- Expected outcomes (failed condition, not found) are values; only infra failures throw.
- Need a new query? Add a method to the shared repository instead of forking a near-copy.

## Test it

- Services: in-memory fake implementing the interface.
- Adapter: integration test against a local emulator/real table, including pagination and the conflict path.

**Related:** `unit-of-work`, `adapter`, `dynamodb-access-patterns`
