---
name: dynamodb-access-patterns
description: Designs DynamoDB access: keys and GSIs, Query pagination, BatchGet/BatchWrite limits, conditional and TransactWrite writes, hot partitions. Use when writing @aws-sdk/lib-dynamodb code, adding a GSI, or "fix a Scan".
---

# DynamoDB access patterns

## Rules

1. **Design from access patterns.** List every read and write (who asks, by which key, how many items,
   how often) before choosing keys or writing code. The key schema answers that list.
2. **A repository owns all table access.** Nothing else imports `@aws-sdk/lib-dynamodb`. The repository
   receives the document client and table names through its constructor and returns typed domain
   records, never `AttributeValue` maps. No `process.env.X ?? …` defaults and no module-level client inside
   a repository file — the handler reads env and builds the client, then injects both.
3. **Never `Scan` in a request path.** Every read is `GetItem`, `BatchGetItem` or `Query` on the table key
   or a GSI. If a pattern needs a Scan, it needs an index. Scans are for one-off migrations only.
4. **Every `Query` drains `LastEvaluatedKey`** (or returns it as a page token). A page can be empty while
   more data remains, especially with a `FilterExpression`.
5. **Never read or write in a loop of single calls.** Many known keys → `BatchGetItem`. Many writes →
   `TransactWriteItems` (atomic) or chunked `BatchWriteItem` (throughput). The only loops allowed are
   chunking, pagination and bounded retry loops.
6. **Chunk batches and retry unprocessed items.** `BatchGetItem` takes at most 100 keys and
   `BatchWriteItem` 25 requests — chunk every batch. Under throttling they return `UnprocessedKeys` /
   `UnprocessedItems` with HTTP 200; retry those with capped, jittered backoff. Ignoring them silently
   loses data.
7. **Concurrency is enforced by conditions, not by reading first.** Use `ConditionExpression`
   (`attribute_not_exists`, version checks) and atomic `ADD`/`SET` expressions; never read-modify-write.

## Limits to design around

| Operation | Limit |
|---|---|
| `GetItem` / item size | 400 KB per item |
| `Query` / `Scan` page | 1 MB read before filtering |
| `BatchGetItem` | 100 keys, 16 MB; no duplicate keys in one request; arbitrary result order |
| `BatchWriteItem` | 25 put/delete requests, 16 MB; no `Update`, no conditions |
| `TransactWriteItems` | 100 actions, 4 MB, 2x write cost; one action per item per transaction |
| `TransactGetItems` | 100 items, 4 MB |
| Partition throughput | ~3,000 RCU and ~1,000 WCU per partition key per second |
| GSI | Eventually consistent only; max 20 per table; key attributes must exist on the item to be indexed |

## Read and write choice

| Need | Use |
|---|---|
| One item, full key known | `GetCommand` |
| Many items, keys known | `BatchGetCommand` — dedupe, chunk at 100, retry, index results in a `Map` |
| Items under a partition / key range | `QueryCommand` with `KeyConditionExpression` |
| Few attributes from wide items | `ProjectionExpression` |
| Single item create or update | `PutCommand` / `UpdateCommand` with a condition |
| Several items, all-or-nothing | `TransactWriteCommand` |
| Many independent items | `BatchWriteCommand` in chunks of 25, with retry |
| Counter | `UpdateExpression: 'ADD #count :inc'` |

## Plan reads in waves

One `Promise.all` for every read whose key is known from the input; at most one dependent wave for keys
only known after the first returns. A third wave signals a missing GSI or denormalized attribute. The
service gets one populated context object and never calls the repository mid-logic for "one more thing".

## Where to look

- **Choosing keys, adding a GSI, single-table design, hot partitions** → read
  [reference/key-design.md](reference/key-design.md)
- **Writing Query pagination or BatchGet code** → read [reference/reads.md](reference/reads.md)
- **Writing BatchWrite, TransactWrite, conditional or counter updates** → read
  [reference/writes.md](reference/writes.md)
