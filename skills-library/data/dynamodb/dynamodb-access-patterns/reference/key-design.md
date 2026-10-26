# Key design

## Contents

1. Write the access-pattern table first
2. Partition and sort keys
3. Global secondary indexes
4. Hot partitions
5. Cost: projections, item size, filters

## 1. Write the access-pattern table first

| # | Pattern | Caller | Key used | Items | Frequency |
|---|---|---|---|---|---|
| 1 | Get order by id | API | `pk = ORDER#<id>` | 1 | high |
| 2 | List a customer's orders, newest first | API | GSI `byCustomer`: `customerId`, sort `createdAt` desc | ≤ 50 / page | high |
| 3 | Orders pending > 1 h | scheduled job | GSI `byStatus`: `status`, sort `createdAt` | many | hourly |

Every row must map to a `Get`, `BatchGet` or `Query`. A row with no key is a missing index, not a Scan.

## 2. Partition and sort keys

- Partition key: high cardinality, evenly accessed.
- Sort key: encodes the range you query and the order you need. Composite sort keys
  (`status#createdAt`, `2026-10#<id>`) let one key serve "begins_with" and range queries.
- Use ISO-8601 timestamps or zero-padded numbers in sort keys so string order equals logical order.
- Keep keys immutable. Changing a key attribute means delete + put; changing a GSI key attribute
  re-indexes the item.

## 3. Global secondary indexes

- Add a GSI when a pattern needs a different partition, or a different sort order, than the table key.
- Name indexes after the pattern (`ordersByCustomer`) and keep the name in a module constant.
- GSIs are eventually consistent. Read-after-write through a GSI can miss the item just written; read
  the base table by key when the caller needs its own write.
- Sparse indexes: items without the GSI key attribute are not indexed. Use this for "only pending items"
  views instead of filtering.
- Each GSI multiplies write cost. Project only what the pattern reads (`KEYS_ONLY` or `INCLUDE`) unless it
  needs the whole item.
- Adding a GSI to a large table backfills asynchronously; code that depends on it must tolerate the
  backfill window.

## 4. Hot partitions

Symptoms: `ProvisionedThroughputExceededException` or throttling on one key while table metrics look
fine; `UnprocessedItems` in batches against one partition.

Causes and fixes:

| Cause | Fix |
|---|---|
| Many writes to one item (global counter) | Shard the counter: `counter#<0..N-1>`, sum on read; or aggregate asynchronously |
| Low-cardinality partition key (`status`, `date`) | Add a suffix: `status#<shard>`; query shards in parallel |
| One large parent with many children written at once | Spread children across partition keys (parent id + child group) |
| Batch writes all targeting one partition key | Spread keys, or throttle the producer with bounded concurrency |

Retry throttled batches with capped exponential backoff plus jitter; retries without jitter synchronize
and re-collide.

## 5. Cost: projections, item size, filters

- Read cost is per 4 KB read (1 KB for writes). Large items make every read expensive; move large,
  rarely read attributes to a separate item or to S3 with a pointer.
- `ProjectionExpression` reduces network transfer, not read capacity — the full item is still read.
  Use a narrower GSI projection or split the item to reduce capacity.
- `FilterExpression` runs after the read: you pay for discarded items. A filter discarding most items
  means the key design is wrong for that pattern.
- Use `Limit` for bounded lookups (`Limit: 1` for "latest") with `ScanIndexForward: false`.
- Set a TTL attribute on transient items (idempotency records, sessions, jobs) instead of cleanup jobs.
