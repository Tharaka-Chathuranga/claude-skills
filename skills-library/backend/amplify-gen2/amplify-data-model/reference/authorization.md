# Authorization rules

## Contents

1. Authorization modes
2. Rule reference
3. Multi-tenant patterns
4. Field-level rules
5. Common mistakes

## 1. Authorization modes

```ts
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: { expiresInDays: 30 },     // only if a rule uses publicApiKey()
    lambdaAuthorizationMode: { function: authorizer, timeToLiveInSeconds: 300 }, // only for allow.custom()
  },
});
```

A rule only works if its mode is enabled. The client picks the mode per call (`authMode`), defaulting to
`defaultAuthorizationMode`.

## 2. Rule reference

| Rule | Who | Notes |
|---|---|---|
| `allow.owner()` | The user who created the item | Adds an `owner` field; owner can reassign unless restricted with `.to([...])` |
| `allow.ownerDefinedIn('authorId')` / `allow.ownersDefinedIn('editors')` | Users named in a field | Field holds `sub::username` by default |
| `allow.authenticated()` | Any signed-in user | Rarely right alone in multi-tenant apps |
| `allow.guest()` | Unauthenticated identity pool users | Read-only public content |
| `allow.publicApiKey()` | Anyone with the API key | Prototyping or public reads; key expires |
| `allow.group('Admin')` / `allow.groups([...])` | Static Cognito groups | |
| `allow.groupDefinedIn('tenantId')` / `allow.groupsDefinedIn('groups')` | Users in the group named by the field | Dynamic groups: the usual tenant pattern |
| `allow.custom()` | Lambda authorizer decides | For tenant or role logic Cognito groups cannot express |
| `allow.resource(fn)` (schema level) | A backend function | Grants the function's IAM role access to the API |

Restrict operations with `.to(['read'])`, `.to(['create', 'read', 'update', 'delete'])`; for
subscriptions use `'listen'`, for queries split `'get' | 'list'`.

## 3. Multi-tenant patterns

The tenant key and its rules come from the project's CLAUDE.md. Patterns:

- **Dynamic group per tenant**: each tenant is a Cognito group; models carry `tenantId` and use
  `allow.groupDefinedIn('tenantId')`. Simple, but Cognito caps groups per pool and per user's token size.
- **Lambda authorizer**: `allow.custom()`; the authorizer validates the token and returns the caller's
  tenant and role in `resolverContext`. Custom resolvers and functions read the tenant from there.
  Model-level CRUD under `allow.custom()` is allowed or denied per operation by the authorizer
  (`deniedFields`), so pair it with key design that includes the tenant.
- In every pattern: the tenant is part of the identifier or index partition key, and functions and
  resolvers derive it from identity, never from arguments. A client-sent tenant id may only be compared
  against the derived one.

## 4. Field-level rules

```ts
salary: a.float().authorization((allow) => [allow.group('Admin')]),
```

Field rules replace (not extend) model rules for that field. A field readable by fewer callers than the
model breaks list queries for those callers if it is required in the selection set — keep sensitive
fields optional and excluded from default selection sets.

## 5. Common mistakes

- `allow.authenticated()` on tenant data: any user of any tenant can read it.
- `allow.owner()` without `.to([...])`: owners can change the `owner` field and hand items away.
- `allow.publicApiKey()` left on a model after prototyping.
- A function calling the Data API without `allow.resource(fn)` → `Unauthorized` at runtime.
- Relationship traversal requires read access on the related model too; a missing rule returns `null`
  for the related field, not an error.
- Subscriptions inherit model rules; filtered subscriptions do not replace authorization.
