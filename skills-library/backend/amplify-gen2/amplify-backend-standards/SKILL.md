---
name: amplify-backend-standards
description: Non-negotiable rules for all code under amplify/ in an Amplify Gen 2 project — folder-per-unit with interfaces and colocated tests, interface-typed DI, repository-owned data access, zod-validated input, registration, CloudFormation cycles, tenant scoping and secrets. Use when writing or reviewing any file under amplify/.
user-invocable: false
paths: ["amplify/**"]
---

# Amplify backend standards

These hold for every change under `amplify/`. Task skills (`amplify-lambda`, `amplify-data-model`,
`appsync-js-resolver`, `amplify-deploy`) assume them. General design rules are in `software-design`;
Lambda runtime rules in `lambda-standards`; table access in `dynamodb-access-patterns`.
Project-specific conventions (path aliases, client factories, shared repositories) are in CLAUDE.md
and override the defaults here.

## Structure

1. **Every unit is a folder**: implementation + `index.ts` + `interfaces/` + colocated `.test.ts`.
   Units are services, repositories, builders, model-call units and non-trivial utils.
2. **Imports cross folder boundaries through `index.ts` only.** Named exports, no default exports.
3. **Match the existing function** when extending one; new functions follow `amplify-lambda`.
4. **Files stay small** — split a file well before it reaches the project's line cap.

## Dependencies

5. **`handler.ts` is the only composition root.** `new`, `process.env`, `new Date()` and
   `context.getRemainingTimeInMillis()` appear only there; everything below receives them.
6. **Consumers depend on `I<Name>` interfaces**, injected through the constructor as
   `private readonly`. Narrow with `Pick<>` when a unit uses one or two methods.
7. **Tests construct units directly with plain-object fakes.** Needing `jest.mock` or SDK client mocks
   for a service test means the wiring is wrong.

## Data and input

8. **A repository owns all DynamoDB and S3 access.** No AWS SDK import in a service, builder or util.
   Check for an existing repository before writing one; add methods rather than forking.
9. **Validate every external input with zod at the boundary**: event payloads, GraphQL arguments that
   carry JSON, third-party API responses, and every LLM response (`schema.parse(JSON.parse(raw))`).
   Derive types with `z.infer`, never hand-write a duplicate.
10. **Use generated types** — alias `Schema['Model']['type']` in the function's `types/`; do not
    redeclare model shapes.

## Tenant scoping

11. If the project is multi-tenant, the tenant key and its rules are in CLAUDE.md. **Always derive the
    tenant from the auth context** (`event.identity`, resolver context, authorizer claims, or a
    trusted event detail written by the backend), **never from client arguments.** Pass it explicitly
    into every repository call and make it part of every key or key condition. A query that can return
    another tenant's rows is a security defect, even if the service filters afterwards.
12. Nothing tenant- or user-scoped is cached at module scope.

## Registration and infrastructure

13. **A function is not deployed until registered**: imported into `defineBackend({...})` in
    `amplify/backend.ts`; if it backs GraphQL, referenced by `a.handler.function(fn)` in
    `amplify/data/resource.ts`; if it calls the Data API, granted via `allow.resource(fn)` in the
    schema authorization. Use `.js` extensions in `backend.ts` imports if the project does.
14. **Grant least privilege**: table grants (`grantReadData`, `grantReadWriteData`) or policies scoped
    to specific ARNs. Never `*` resources for data actions. Broad `resources: ['*']` grants already in
    the code are debt to narrow, not a pattern to copy.
15. **No circular CloudFormation dependencies.** A function used as a GraphQL resolver, or one that the
    data stack references, sets `resourceGroupName: 'data'` in `defineFunction`. Before wiring a
    resource from stack A into stack B, check B is not already referenced by A. Validate with a synth
    or sandbox deploy before reporting backend infra changes done (`amplify-deploy`).
16. **Secrets only via `secret('NAME')`** in `defineFunction({ environment })`. Never a literal, never
    in `.env` committed to git, never logged.
17. **Physical names are never hardcoded.** Table, bucket and queue names reach code through env vars.
    In a small backend, set them from the construct (`backend.data.resources.tables['Model'].tableName`
    with `addEnvironment` and a table grant). At scale, each such reference ties a function stack to the
    data stack and eventually creates cycles; large backends use deploy-time injection instead (a custom
    resource that runs after the data stack settles and writes `<MODEL>_TABLE_NAME` env vars into the
    functions) or a naming convention. Follow whichever the project uses. An empty table env var at
    runtime can mean the injection hasn't run yet.

## Before reporting done

- Typecheck the backend project and run the function's tests.
- Run the project quality gate if one is defined (see CLAUDE.md / `package.json` scripts).
- Infra touched (`resource.ts`, `backend.ts`, `data/resource.ts`)? Say whether a synth/deploy check ran.
