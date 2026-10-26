---
name: appsync-js-resolver
description: Writes or reviews AppSync APPSYNC_JS resolvers under amplify/data: cross-table names, ctx.identity, ctx.stash pipelines, a.handler.custom. Use when editing a resolver .js file or a resolver returns AccessDenied or null.
---

# AppSync JS resolvers

Resolvers run inside AppSync, not Lambda: cheap and fast, but a restricted JavaScript subset with no
local runtime. Treat every change as untested until evaluated. Follow `amplify-backend-standards`.

## Resolver or Lambda?

Resolver: thin request/response mapping against one data source — key lookup, query, conditional write,
a transaction across a few known tables. Anything with real logic (unbounded loops, other services,
LLMs, retries, non-trivial validation) is a Lambda (`amplify-lambda`).

## Runtime limits (APPSYNC_JS)

| Not available | Use instead |
|---|---|
| `throw`, `try`/`catch`/`finally` | `util.error(message, type)` — stops the resolver and the pipeline |
| `while`, `do-while`, `for(;;)`, `continue`, labels | `for-of`, `for-in`, `.map`, `.filter`, `.reduce` |
| `++`, `--`, `~`, the `in` operator | `x += 1`; `Object.hasOwn(obj, key)` |
| Regex literals | `String.replace` with a Java-style pattern string, or plain string methods |
| Promises, `async`/`await`, network or file I/O | Return a request object; AppSync performs the I/O |
| Recursion, `apply`/`bind`/`call`, functions as values | Plain loops; inline arrow callbacks to array methods are fine |
| `Array.prototype.sort(compareFn)` | `sort()` without arguments, or sort in the client |
| `Date`, `Math.random` for ids or times | `util.time.nowISO8601()`, `util.autoId()` |

`JSON.parse` on invalid input does not throw — guard the result. Size limits apply to request/response
payloads; return only what the client selects.

## Shape

```js
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  if (!ctx.identity || !ctx.identity.sub) util.error('Not authorized', 'UnauthorizedError');
  if (!ctx.args.orderId) util.error('orderId is required', 'ValidationError');

  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ id: ctx.args.orderId }),
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  if (!ctx.result || ctx.result.ownerId !== ctx.identity.sub) util.error('Order not found', 'NotFoundError');
  return ctx.result;
}
```

- **Check `ctx.error` first in every `response`**, or a failed write returns `null` as if it worked.
- Use one fixed set of error types: `ValidationError`, `UnauthorizedError`, `NotFoundError`,
  `BadRequestError`, `ConflictError`. Map `ConditionalCheckFailed` and `TransactionCanceled`
  (`cancellationReasons`) to `ConflictError` with a message the client can act on.
- Items written by a custom resolver set `__typename: 'Order'` (plus `createdAt`/`updatedAt` via
  `util.time.nowISO8601()`), so generated types and the Data API resolve them like model-written items.

## Caller identity

Derive the caller from `ctx.identity` only: Cognito `ctx.identity.sub` / `claims` / `groups`, or
`ctx.identity.resolverContext` from a Lambda authorizer. Never trust identity or ownership fields sent in
`ctx.args` (`userId`, `ownerId`). A record loaded by id is returned or changed only after checking the
caller may access it. When you touch an existing resolver that trusts an argument, fix it.

## Table names for cross-table operations

A resolver's own data source (`dataSource: a.ref('Order')`) needs no table name. `TransactWriteItems`
or `BatchGetItem` across tables does. Amplify names model tables `<Model>-<apiId>-<envSuffix>`, so build
the name exactly like this:

```js
const lineTable = `OrderLine-${ctx.stash.awsAppsyncApiId}-${ctx.env.AMPLIFY_TABLE_ENV_NAME}`;
```

`AMPLIFY_TABLE_ENV_NAME` comes from the same context value the data construct uses to name tables. Set it
once in `amplify/backend.ts` if the project doesn't already:

```ts
backend.data.resources.cfnResources.cfnGraphqlApi.environmentVariables = {
  AMPLIFY_TABLE_ENV_NAME: backend.data.node.tryGetContext('amplifyEnvironmentName') ?? 'NONE',
};
```

**Never use `ctx.stash.amplifyApiEnvironmentName`.** On branch deploys it holds the branch name while model
tables keep the `NONE` suffix, so the table doesn't exist and IAM denies the call. The data source's role
must also be allowed to access every other table in the operation, or the call fails with `AccessDenied`.

## Pipelines

```ts
.handler([
  a.handler.custom({ dataSource: a.ref('Order'), entry: './resolvers/cancel-order/check-ownership.js' }),
  a.handler.custom({ dataSource: a.ref('Order'), entry: './resolvers/cancel-order/cancel.js' }),
])
```

- One job per step: authorize/check, fetch, write. Folder per operation (kebab-case), one file per step.
- Pass data forward in `ctx.stash.<name>`; read the previous step's result from `ctx.prev.result`.
- Stop early with `runtime.earlyReturn(value)`; fail with `util.error`.

## Verify

No local runtime exists. Before reporting done:

1. Evaluate each function against the real runtime with a realistic context, including a caller who
   **may not access the record** and a missing argument:
   ```bash
   aws appsync evaluate-code --runtime name=APPSYNC_JS,runtimeVersion=1.0.0 \
     --code file://amplify/data/resolvers/<op>/<step>.js --function request --context file://ctx.json
   ```
2. Typecheck and run the project's quality gate (the schema changed).
3. After a sandbox deploy (`/amplify-deploy`), call the operation once and confirm the item landed in the
   expected table.

Report which of these ran. "Evaluated" is only true if the command ran.
