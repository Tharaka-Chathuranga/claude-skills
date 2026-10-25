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
// handler.ts, module scope
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/send-receipt';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const dataClient = generateClient<Schema>();
```

`allow.resource(fn)` makes the data stack depend on the function: set `resourceGroupName: 'data'`.

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
