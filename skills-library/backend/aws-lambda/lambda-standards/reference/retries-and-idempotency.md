# Retries, batches and idempotency

## Contents

1. Delivery semantics per event source
2. SQS: partial batch failures
3. EventBridge and async invokes
4. EventBridge → SQS → Lambda
5. Async job pattern
6. Making a handler idempotent
7. Checklist

## 1. Delivery semantics per event source

| Source | Delivery | On handler error | Must configure |
|---|---|---|---|
| SQS standard | At least once, unordered | Failed records reappear after the visibility timeout | `reportBatchItemFailures`, DLQ (`maxReceiveCount`), visibility timeout ≥ 6x function timeout |
| SQS FIFO | At least once per group, ordered | The group blocks until the failed record succeeds or moves to the DLQ | Same as standard; return failures from the first failed record onward |
| EventBridge → Lambda | At least once (async invoke) | Retried up to 2 times by default, then dropped | `retryAttempts`, `maxEventAge`, a DLQ or on-failure destination on the target |
| Async invoke | At least once | 2 retries | On-failure destination |
| DynamoDB / Kinesis stream | At least once, ordered per shard | The shard blocks and retries until the record expires | `bisectBatchOnFunctionError`, `maximumRetryAttempts`, `reportBatchItemFailures`, on-failure destination |
| Synchronous (API, AppSync) | Exactly as called | The caller gets the error | Nothing; clients may still retry, so mutations that create things accept an idempotency key |

## 2. SQS: partial batch failures

```ts
import type { SQSBatchResponse, SQSHandler } from 'aws-lambda';

export const handler: SQSHandler = async (event, context): Promise<SQSBatchResponse> => {
  const service = buildService(); // composition root
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const message = messageSchema.parse(JSON.parse(record.body));
      await service.process(message);
    } catch (error) {
      logger.error('Record failed', { messageId: record.messageId, error });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
```

- The event source mapping needs `reportBatchItemFailures: true`, or the return value is ignored and a
  single throw retries the whole batch.
- A record that can never succeed (fails schema validation) is still reported as failed so it lands in
  the DLQ rather than vanishing. Never `return` early from the loop on a bad record.
- Process records concurrently only when ordering does not matter and with a bound
  (`mapWithConcurrency`). For FIFO, process sequentially and, after the first failure, report that
  record and every later one.
- Keep `batchSize` × per-record time well under the function timeout.

## 3. EventBridge and async invokes

- Parse `event.detail` with a schema in the handler; `detail-type` and `source` choose the schema.
- Configure the target's retry policy and DLQ in infrastructure code. The default drops the event after
  retries, silently.
- Publishing: put events in batches of up to 10 entries and check `FailedEntryCount`; retry failed
  entries. A publish after a write is not atomic with it — if the event must not be lost, write an
  outbox row in the same transaction or use a DynamoDB stream.

## 4. EventBridge → SQS → Lambda

When a rule targets a queue, each `record.body` is the **EventBridge envelope** (`{ version, id,
'detail-type', source, time, detail }`), not the bare message. Unwrap per record, and process **every**
record — never just `event.Records[0]`, which silently drops the rest of the batch.

```ts
const envelopeSchema = z.object({ 'detail-type': z.string(), detail: orderPaidSchema });

for (const record of event.Records) {
  try {
    const { detail } = envelopeSchema.parse(JSON.parse(record.body));
    await service.process(detail);
  } catch (error) {
    batchItemFailures.push({ itemIdentifier: record.messageId });
  }
}
```

## 5. Async job pattern

For work longer than a synchronous caller can wait (AppSync caps at 30 s):

1. **Start** mutation: validates input and authorization, writes a job row `{ jobId, userId, status:
   'PENDING', expiresAt }`, publishes an event (or enqueues), returns `{ jobId }`.
2. **Worker** (event/queue consumer) does the work and records `COMPLETED` with the result, or `FAILED`
   with a client-safe reason, on the job row. Give the row a TTL.
3. For **business failures** (invalid content, model refused, quota) the worker records `FAILED` and
   returns normally — rethrowing would make the platform retry an outcome that will not change. Throw only
   for transient failures a retry can fix, and make sure the final attempt still records `FAILED` (or a DLQ
   consumer does).
4. **Client** polls a status query or subscribes to job updates; it can read only its own jobs.

## 6. Making a handler idempotent

Choose the cheapest technique that fits:

1. **Naturally idempotent writes.** Deterministic ids derived from the event (`${orderId}#receipt`)
   plus a full `Put` overwrite: running twice yields the same item.
2. **Conditional create.** `ConditionExpression: 'attribute_not_exists(pk)'`; treat
   `ConditionalCheckFailedException` as "already done" and return success.
3. **Version / state guard.** `ConditionExpression: 'version = :expected'` or
   `#status = :pending` on the update that advances state, so a replay of an old event is rejected.
4. **Idempotency record.** For side effects outside DynamoDB (email, payment, third-party API): before
   the side effect, conditionally put `{ pk: idempotencyKey, status: 'IN_PROGRESS', expiresAt }`; on
   success update it to `COMPLETED` with the result; on replay return the stored result. Give the
   record a TTL. Powertools for AWS Lambda (`@aws-lambda-powertools/idempotency`) implements this.

The idempotency key comes from the event's business identity (order id + action), not from the
transport id: SQS `messageId` changes if the producer re-sends the same business event.

Counters and aggregates are the usual trap: `ADD count :one` replayed twice counts twice. Guard them with
technique 2 or 3, or recompute from source.

## 7. Checklist

- [ ] Every retried source has a DLQ or on-failure destination.
- [ ] SQS and stream consumers return `batchItemFailures`, with `reportBatchItemFailures` enabled.
- [ ] Visibility timeout ≥ 6x function timeout.
- [ ] Replaying any event twice produces the same end state (test it).
- [ ] Idempotency keys come from business identity, not transport ids.
- [ ] Unparseable records are reported as failures and logged with their id, never dropped.
- [ ] EventBridge-via-SQS consumers unwrap `detail` per record and loop over all records.
- [ ] Job workers record `COMPLETED`/`FAILED` and don't rethrow business failures.
