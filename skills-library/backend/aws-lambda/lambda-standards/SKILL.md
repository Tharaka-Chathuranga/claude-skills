---
name: lambda-standards
description: Runtime rules for Node.js/TypeScript AWS Lambda functions — handler as composition root, module-scope SDK clients, env validation, idempotency for retried SQS/EventBridge events, partial batch failures, timeouts, memory and structured logging. Use when writing or reviewing a Lambda handler or event consumer, or when asked about "cold starts", "lambda timeout", "retries" or "duplicate events".
---

# Lambda standards

How a Lambda function behaves at runtime. Code structure inside the function (services, repositories,
interfaces, DI) follows the `software-design` skill; this skill covers what is specific to Lambda.

## Rules

1. **The handler is the composition root.** It parses the event, loads config, builds the dependency
   graph, calls one service method and shapes the response. No business logic, no data access, no
   branching on domain state.
2. **SDK clients are created once, at module scope**, and injected downward. Never construct a client
   inside the handler (it discards warm keep-alive connections) and never import a client singleton
   from inside a service or repository (it can no longer be replaced in tests).
3. **Nothing request- or tenant-scoped lives at module scope.** One warm container serves many callers
   in sequence. Module-level caches hold only values identical for every caller.
4. **Every event source that retries is handled idempotently.** SQS, EventBridge, DynamoDB/Kinesis
   streams and async invokes deliver at least once. Processing the same event twice must be harmless.
5. **Batch consumers report partial failures.** Return `batchItemFailures`; never throw for the whole
   batch because one record failed, and never swallow a failure so the record is lost.
6. **Validate the event and config at the boundary.** Parse the event with a schema (zod) in the
   handler; read and validate env vars once per container.
7. **Log structured JSON with the request id.** Every log line carries `awsRequestId` and the
   correlating ids of the work item; never log secrets, tokens or full payloads.
8. **Size the timeout to the real worst case and check the remaining budget** before optional work.

## Module scope vs handler scope

```ts
// Module scope: once per container (cold start)
const logger = createLogger({ service: 'send-receipt' });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

let config: Config | undefined;
const loadConfig = (): Config => (config ??= configSchema.parse(process.env));

// Handler scope: every invocation
export const handler: Handler<unknown, Result> = async (event, context) => {
  logger.appendKeys({ requestId: context.awsRequestId });
  const input = inputSchema.parse(event);
  const { TABLE_NAME } = loadConfig();

  const service = new SendReceiptService(new ReceiptRepository(dynamo, TABLE_NAME), logger, systemClock);
  return service.send(input);
};
```

| Module scope | Handler scope |
|---|---|
| SDK clients, logger, stateless helpers, zod schemas, constants | Anything derived from the event or identity |
| Memoized config *after* successful validation | `context` use: request id, remaining time |
| Caches of global, caller-independent data | Services and repositories (cheap objects; build per call) |

Config validation goes in a memoized function called from the handler, not as a throw at import time:
a module-scope throw surfaces as an opaque init failure and poisons every invocation of that container.

Ambient values become injected ports: time is a `Clock`, `context.getRemainingTimeInMillis()` becomes a
`TimeBudget`. Nothing below the handler calls `new Date()` or reads `process.env`.

## Timeouts, memory, cold starts

- Timeout = worst-case work + a reserve to persist results. A single external API call: 30–120 s;
  a multi-step pipeline: up to 900 s. Queue consumers: the queue's visibility timeout must be at least
  6x the function timeout.
- Pass a `TimeBudget` (`remainingMs() - reserve`) into long pipelines; optional passes check it and skip
  with a warning rather than running into the timeout.
- Memory also scales CPU. Start at 512 MB for SDK-heavy or JSON-heavy work; measure before raising.
- Prefer arm64. Keep the bundle small: import modular SDK v3 clients, never the whole SDK; avoid heavy
  top-level work. Lazy-load rarely used heavy modules inside the branch that needs them.
- Bound concurrency for fan-out (`mapWithConcurrency(items, limit, fn)`), never `Promise.all` over an
  unbounded, user-driven list of network calls.

## Errors

- Throw for failures the platform should retry; return a result for expected outcomes.
- A missing entity referenced by an event that can legitimately race is a logged skip, not a throw.
- Optional enrichment never fails the main path: catch, log a warning, continue.
- For job-tracked work, the handler records the failure on the job before returning or rethrowing.

## Where to look

- **Writing an SQS, EventBridge or stream consumer, or making a handler idempotent** → read
  [reference/retries-and-idempotency.md](reference/retries-and-idempotency.md)
- **Data access from the function** → the `dynamodb-access-patterns` skill
