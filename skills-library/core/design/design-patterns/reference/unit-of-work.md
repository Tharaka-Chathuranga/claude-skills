# Unit of work

**Use when:** several writes (often across repositories) must commit atomically or not at all.
**Don't when:** single-item writes, or writes that can be made idempotent and retried independently.
**Lighter first:** one repository method that issues the transaction itself (`saveWithInvoice(order, invoice)`).

## Shape

```ts
export interface UnitOfWork {
  add(op: WriteOp): void;
  commit(): Promise<Result<void, 'conflict'>>;
}

export const makeDynamoUnitOfWork = (db: DynamoDBDocumentClient): UnitOfWork => {
  const ops: WriteOp[] = [];
  return {
    add: (op) => void ops.push(op),
    commit: () => transactWrite(db, ops.splice(0)), // TransactWrite, max 100 items
  };
};
```

## Rules

- Scope one instance per request/use-case; create it in the handler, never at module scope.
- Holding it at module scope is a captive dependency: ops leak between invocations on warm containers.
- Repositories add operations; only the use-case calls `commit()`, exactly once.
- Respect store limits (item count, size, no two ops on the same item); fail fast before sending.
- Conditional-check failures are an expected outcome; return them as a value.

## Test it

- Fake UoW records ops; assert the use-case adds the expected ops and commits once.
- Integration test: one failing condition rolls back every write.

**Related:** `repository`, `result-type`, `dynamodb-access-patterns`
