# resource.ts and registration

## Contents

1. defineFunction
2. Registering in backend.ts
3. Granting access and passing names
4. GraphQL operations
5. SQS, EventBridge and schedules
6. Calling the Data API from a function
7. Secrets and environment
8. Avoiding circular dependencies
9. Registration at scale (dozens of functions)

## 1. defineFunction

```ts
import { defineFunction, secret } from '@aws-amplify/backend';

export const sendReceipt = defineFunction({
  name: 'send-receipt',               // matches the folder name
  entry: './handler.ts',
  runtime: 22,
  architecture: 'arm64',
  memoryMB: 512,
  timeoutSeconds: 60,
  environment: { MAIL_API_KEY: secret('MAIL_API_KEY') },
  resourceGroupName: 'data',          // only for resolver functions or ones the data stack references
});
```

- Timeout: AppSync Lambda resolvers are capped at 30 s; queue consumers 30–300 s; pipelines up to 900 s.
  Long work behind GraphQL returns a job id and runs asynchronously (queue or event).
- `schedule: 'every 1h'` or `schedule: 'cron(0 2 * * ? *)'` makes it a scheduled function.
- Typed env: `import { env } from '$amplify/env/send-receipt'` gives the variables declared in
  `defineFunction` and resource access grants. Variables added later with `addEnvironment` may not be
  typed; read those from `process.env` and validate them with zod in the handler.

## 2. Registering in backend.ts

```ts
import { defineBackend } from '@aws-amplify/backend';
import { sendReceipt } from './functions/send-receipt/resource';

const backend = defineBackend({ auth, data, sendReceipt });
```

Functions referenced only from `data/resource.ts` (`a.handler.function`) or `defineAuth` triggers are
deployed via those resources, but listing them in `defineBackend` is still needed to reach
`backend.sendReceipt.resources` for grants and env vars.

## 3. Granting access and passing names

```ts
const orders = backend.data.resources.tables['Order'];
orders.grantReadWriteData(backend.sendReceipt.resources.lambda);
backend.sendReceipt.addEnvironment('ORDER_TABLE_NAME', orders.tableName);
```

This is the right default for a small backend. At scale, every `tableName` reference and table grant makes
the function's stack depend on the data stack, and these references are the usual source of data ↔ function
circular dependencies. Large backends instead:

- **Inject at deploy time**: a custom resource (CDK `Provider` + Lambda) that runs after the data stack
  settles, looks up the physical table names (e.g. `ListStackResources` on the data stack) and writes
  `<MODEL>_TABLE_NAME` env vars into the registered functions with `UpdateFunctionConfiguration`. IAM is
  granted by name pattern rather than by construct reference. Register new functions in the project's
  injection registry.
- **Or use a naming convention** the code can compute (API id + env name), as JS resolvers do.

An empty `*_TABLE_NAME` at runtime with this setup usually means the injection hasn't run for that function
(new function, failed custom resource) — check the registry and the custom resource's logs.

- `grantReadData` for read-only use. GSI queries need the index ARN — the table grants include it.
- Other resources: `bucket.grantRead(...)`, `queue.grantSendMessages(...)`,
  `eventBus.grantPutEventsTo(...)`. For anything else, `addToRolePolicy(new PolicyStatement({ actions,
  resources }))` scoped to concrete ARNs.
- If the project wraps this in a helper (a function schema listing tables), use the helper.

## 4. GraphQL operations

```ts
// amplify/data/resource.ts
import { sendReceipt } from '../functions/send-receipt/resource';

sendReceipt: a
  .mutation()
  .arguments({ orderId: a.id().required() })
  .returns(a.ref('ReceiptResult'))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(sendReceipt)),
```

Then type the handler with the generated signature:

```ts
import type { Schema } from '../../data/resource';
export const handler: Schema['sendReceipt']['functionHandler'] = async (event, context) => { … };
```

- Use `a.query()` for reads, `a.mutation()` for writes. Return a custom type (`a.customType` / `a.ref`),
  not a bare JSON blob.
- Identity is `event.identity` (Cognito: `sub`, `claims`; custom authorizer: `resolverContext`).
  The tenant comes from there, never from `event.arguments`.
- `a.handler.function(fn).async()` runs it as fire-and-forget (returns `EventInvocationResponse`).
- Resolver functions set `resourceGroupName: 'data'`.

## 5. SQS, EventBridge and schedules

Put the queue or rule in the function's own stack (`Stack.of(backend.fn.resources.lambda)`) or a
dedicated stack created with `backend.createStack('name')`; never in the data stack.

```ts
const stack = Stack.of(backend.sendReceipt.resources.lambda);
const dlq = new Queue(stack, 'SendReceiptDlq', { retentionPeriod: Duration.days(14) });
const queue = new Queue(stack, 'SendReceiptQueue', {
  visibilityTimeout: Duration.seconds(6 * 60),         // >= 6x function timeout
  deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
});
backend.sendReceipt.resources.lambda.addEventSource(
  new SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }),
);
```

EventBridge: `new Rule(stack, 'Id', { eventPattern: { source, detailType }, targets: [new LambdaFunction(fn,
{ retryAttempts, maxEventAge, deadLetterQueue })] })`. Producers get `grantPutEventsTo` and the bus name
via `addEnvironment`. DynamoDB streams: enable the stream on the table, then `DynamoEventSource` with
`bisectBatchOnError`, `retryAttempts` and `reportBatchItemFailures`.

## 6. Calling the Data API from a function

Prefer a repository on DynamoDB directly for backend work. Use the Data API client when you need
resolver-side logic (authorization, subscriptions firing, custom resolvers):

```ts
// data/resource.ts schema authorization
.authorization((allow) => [allow.resource(sendReceipt)]);
```

```ts
// shared clients module: memoised async factory, no top-level await
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';

let client: Promise<DataClient> | undefined;

export function getDataClient(): Promise<DataClient> {
  client ??= getAmplifyDataClientConfig(process.env as DataClientEnv).then(({ resourceConfig, libraryOptions }) => {
    Amplify.configure(resourceConfig, libraryOptions);
    return generateClient<Schema>();
  });
  return client;
}

// handler.ts
export const handler = async (event) => {
  const dataClient = await getDataClient();   // inside the handler; reused across warm invocations
  …
};
```

- Call the factory inside the handler, not with top-level await at module scope: init failures then surface
  as a normal handler error, and modules importing the client stay cheap to load in tests.
- The Data API client adds several hundred KB to the bundle and a GraphQL hop per call. Prefer direct
  DynamoDB repositories in hot paths and high-volume consumers.
- `allow.resource(fn)` makes the data stack depend on the function: set `resourceGroupName: 'data'`.

## 7. Secrets and environment

- `secret('NAME')` in `environment`; set per sandbox with `npx ampx sandbox secret set NAME`, per branch
  in the Amplify console. Never a literal, never logged.
- Non-secret config: `environment: { STAGE: 'x' }` or `addEnvironment` for construct-derived values.
- Never hardcode physical table, bucket or queue names.

## 8. Avoiding circular dependencies

A cycle appears when stack A references a value from stack B while B references A. Common cases:

| Situation | Fix |
|---|---|
| Function is a GraphQL handler or has `allow.resource` and also reads data tables | `resourceGroupName: 'data'` |
| Function in the function stack triggered by a table stream, and the data stack references the function | Move the function to the data group, or drop the data stack's reference |
| Queue/rule created in the data stack targeting a function stack Lambda | Create it in the function's stack |
| Storage trigger function also reading data tables, while data references storage | Put the function in a dedicated group; avoid data → storage references |

Validate after any wiring change (see `amplify-deploy`); a cycle surfaces only at synth/deploy time.

## 9. Registration at scale (dozens of functions)

Past ~20 functions, hand-wiring each one in `backend.ts` gets error-prone. Patterns that keep it
manageable (add them deliberately; small backends don't need them):

- **A `defineFunction` wrapper** in the repo (e.g. `amplify/functions/lib/define-function.ts`) that
  defaults `entry` to the caller's `handler.ts`, sets shared defaults (runtime, architecture, SDK
  layer) and assigns `resourceGroupName` by rule (e.g. by name prefix) so functions spread over nested
  stacks. Remember that a rule change that moves a function **replaces** it (see `amplify-deploy` →
  scaling-limits).
- **A declarative function schema** next to each `resource.ts` (`schema.ts`): the tables, queues,
  buckets and event patterns the function needs, plus extra env and policy statements. One helper
  (`registerFunction(schema, backendResources)`) turns it into grants and env wiring, so `backend.ts`
  holds one line per function. Make the helper grant **only** the listed resources — a helper that
  grants `*` per service hides over-permission.
- **Deploy-time environment injection** for physical names (section 3) so the schema lists names and
  no synth-time token crosses stacks.
- **A client factories module** (`amplify/services/clients/`): `createLogger`, `createDynamoDbClient`,
  `createEventBridgePublisher`, `tableNames`… Handlers import only the factories they use, so each
  bundle stays small and every function configures clients the same way.
- **Typed event contracts in one place** (`services/events/<domain>.events.ts`): source + detail type
  constants and a detail interface per event, used by publishers, rules and consumers alike.
- **`backend.ts` in banner sections** (bus → rules → queues → event-source mappings → per-function
  registration → outputs) so additions land in a predictable place; move large groups into helper
  modules once the file passes a few hundred lines.
