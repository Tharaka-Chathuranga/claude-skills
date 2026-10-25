---
name: amplify-data-model
description: Changes the Amplify Gen 2 data schema in amplify/data/resource.ts — models, identifiers, relationships, secondary indexes, authorization rules, custom queries/mutations/subscriptions, and splitting a large schema into domain fragments. Use when asked to "add a model", "add a field", "add an index", "change auth rules" or "add a custom query/mutation" in an Amplify project.
---

# Amplify data model

Follow `amplify-backend-standards`. Design keys and indexes from access patterns
(`dynamodb-access-patterns`) before editing the schema.

## Rules

1. **Every list the app shows has a key path.** If a screen filters or sorts by a field, there is an
   identifier or secondary index for it. Never rely on `list()` with a `filter` over a growing table:
   it is a Scan.
2. **Some changes replace the table and lose data**: changing a model's `identifier`, renaming a model,
   changing an index's partition or sort key. Treat them as migrations: new model or index, backfill,
   switch readers, then remove the old one. Say so before making the change.
3. **Additive, optional first.** New fields are optional. Making a field `.required()` breaks reads of
   existing items without it — backfill first.
4. **Authorization on every model and operation**, least privilege. No model is public by accident.
   Multi-tenant projects scope every model by the tenant key from CLAUDE.md, enforced by auth rules or
   a custom authorizer — never by trusting a tenant argument.
5. **Custom operations return typed custom types**, not `a.json()`, unless the payload is genuinely
   schemaless.
6. **One model or operation per concept**; when the file gets large, split it into domain fragments.

## Models

```ts
Order: a
  .model({
    tenantId: a.id().required(),
    id: a.id().required(),
    customerId: a.id().required(),
    status: a.enum(['PENDING', 'PAID', 'CANCELLED']),
    total: a.float().required(),
    createdAt: a.datetime(),
    customer: a.belongsTo('Customer', 'customerId'),
    lines: a.hasMany('OrderLine', 'orderId'),
  })
  .identifier(['tenantId', 'id'])
  .secondaryIndexes((index) => [
    index('customerId').sortKeys(['createdAt']).name('ordersByCustomer').queryField('listOrdersByCustomer'),
    index('status').sortKeys(['createdAt']).name('ordersByStatus').queryField('listOrdersByStatus'),
  ])
  .authorization((allow) => [allow.groupDefinedIn('tenantId').to(['read', 'create', 'update'])]),
```

- Relationships need the reference field declared on the child (`customerId: a.id()`), and both sides
  defined (`hasMany` ↔ `belongsTo`, `hasOne` ↔ `belongsTo`). Many-to-many is a join model with two
  `belongsTo`.
- Composite identifiers must match the related model's reference fields in order.
- Name indexes and query fields explicitly; backend code uses the index name, the client the query field.
- Each GSI adds write cost; add one per real access pattern only.
- Reusable shapes: `a.customType({...})`; enums: `a.enum([...])` declared once and referenced with
  `a.ref('Status')`.

## Custom operations

```ts
sendReceipt: a
  .mutation()
  .arguments({ orderId: a.id().required() })
  .returns(a.ref('ReceiptResult'))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(sendReceipt)),
```

- Handler choices: `a.handler.function(fn)` for logic (see `amplify-lambda`);
  `a.handler.custom({ dataSource: a.ref('Order'), entry: './resolvers/x.js' })` for thin DynamoDB
  mapping (see `appsync-js-resolver`); an array of handlers for a pipeline.
- Functions that call the Data API need `allow.resource(fn)` in the schema-level authorization.
- Subscriptions for custom events: `a.subscription().for(a.ref('publishEvent')).handler(...)`.

## Splitting a large schema

Keep `amplify/data/resource.ts` as the assembly point; move each domain into
`amplify/data/schema/<domain>.ts` exporting a plain object of models, types and operations:

```ts
// amplify/data/schema/orders.ts
import { a } from '@aws-amplify/backend';
export const ordersSchema = { Order: a.model({ … }), OrderLine: a.model({ … }) };

// amplify/data/resource.ts
const schema = a.schema({ ...ordersSchema, ...billingSchema, ...customOperations })
  .authorization((allow) => [allow.resource(sendReceipt)]);
export type Schema = ClientSchema<typeof schema>;
```

Relationships across fragments work because everything lands in one `a.schema`. Move code without
changing it; verify the generated `Schema` type is unchanged by typechecking frontend and backend.

## Verify

- Typecheck both the backend and the frontend (the generated `Schema` type flows into both).
- Sandbox deploy for any schema change (`amplify-deploy`); watch for table replacement in the change set.
- Every new list path has a test or manual check that it uses the index query field, not `list` + filter.

## Where to look

- **Choosing or reviewing authorization rules, multi-tenant scoping, auth modes** → read
  [reference/authorization.md](reference/authorization.md)
