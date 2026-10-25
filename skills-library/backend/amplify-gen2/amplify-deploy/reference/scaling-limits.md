# Scaling limits for large Amplify backends

## Contents

1. The limits
2. The data construct's FunctionDirectiveStack
3. Splitting directive stacks with stack mappings
4. Lambda-backed fields through a generic JS resolver
5. Trimming JS resolver DependsOn
6. Spreading functions over nested stacks
7. Template size
8. Checking limits in CI

## 1. The limits

CloudFormation caps every stack, nested ones included, at **500 resources** and a **1 MB template**
(deployed via S3). Amplify puts each category into nested stacks, so a growing backend hits these per
nested stack, not for the app as a whole. The error appears at deploy time
(`Template format error: Number of resources, N, is greater than maximum allowed, 500` or a template-size
error), never in a typecheck.

## 2. The data construct's FunctionDirectiveStack

Every `a.handler.function(fn)` field adds roughly six resources (Lambda data source, its role and policy,
an invoke function configuration, the resolver…) to one generated nested stack, `FunctionDirectiveStack`.
Around 80 Lambda-backed fields fill it. Models fill their own per-model stacks the same way with many
indexes and custom resolvers.

## 3. Splitting directive stacks with stack mappings

`defineData` accepts `stackMappings: Record<logicalResourceId, stackName>`, which moves generated
resources into named nested stacks. Map each Lambda-backed field's resource ids (data source, invoke data
source, `<Type><field>Resolver`) to a stack chosen by a deterministic rule (operation-name prefix, then
first letter), computed from the schema in one module with tests — never hand-maintained lists.

Moving resources between stacks deletes and recreates them. Changing the mapping of existing fields can
need a two-step deploy (remove the fields from one deploy, add them back in the next) to avoid duplicate
resources; keep that as an explicit, env-flagged path in the mapping module.

## 4. Lambda-backed fields through a generic JS resolver

New Lambda-backed fields can skip the directive stack entirely:

```ts
// data/resource.ts
startExport: a.mutation()
  .arguments({ … })
  .returns(a.ref('JobStarted'))
  .handler(a.handler.custom({
    dataSource: 'StartExportLambdaDataSource',
    entry: './resolvers/invoke-lambda/invoke-lambda-resolver.js',
  })),

// backend.ts
backend.data.addLambdaDataSource('StartExportLambdaDataSource', backend.startExport.resources.lambda);
```

The generic resolver sends `{ operation: 'Invoke', payload: { typeName, fieldName, arguments, identity,
source, request, prev } }` — the same event shape `a.handler.function` produces, so handlers typed as
`Schema['x']['functionHandler']` keep working — and its `response` re-raises `ctx.error` with
`util.error`. These resources land in the main data stack.

## 5. Trimming JS resolver DependsOn

Generated JS resolver and function-configuration resources depend on far more than they need, which bloats
the template and serialises the deploy. A post-processing step in `backend.ts` can override `DependsOn`
on `CfnResolver` / `CfnFunctionConfiguration` resources to just the GraphQL schema and the stack that owns
their data source. Keep it in one module and fail loudly when a data source owner can't be found.

## 6. Spreading functions over nested stacks

`defineFunction` defaults `resourceGroupName` to `'function'`, so every Lambda lands in one nested stack.
With dozens of functions, assign groups by rule (often a thin `defineFunction` wrapper that derives the
group from the function name) so no stack nears the limit.

**Moving a function between groups replaces it**: CloudFormation deletes the Lambda in the old stack and
creates a new one (new ARN, new log group). Resources with fixed physical names anchored on its stack
(SQS queues with an explicit `queueName`, named roles) collide during the move — rename them or drop the
physical name in the same change. Renaming a function so its derived group changes counts as a move.

More nested stacks mean more cross-stack references; validate for cycles after any regrouping.

## 7. Template size

Set `"@aws-cdk/core:suppressTemplateIndentation": true` in `cdk.context.json` to drop whitespace from
synthesised templates; it often buys back a large share of the 1 MB limit at no cost.

## 8. Checking limits in CI

Add a script that reads the synth output (`cdk.out` `manifest.json` and asset manifests for nested
templates), counts resources and bytes per stack, and fails above the limit (warn at ~90%). Run it after a
synth in CI and before merging schema or wiring changes, so a full stack shows up in review
instead of in a failed deploy.
