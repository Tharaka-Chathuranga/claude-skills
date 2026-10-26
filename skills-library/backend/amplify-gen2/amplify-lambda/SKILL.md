---
name: amplify-lambda
description: Adds or changes an Amplify Gen 2 Lambda function in amplify/functions — scaffolds resource.ts, a composition-root handler, service and repository with interfaces and tests, then registers it in backend.ts and the data schema. Use when asked to "add a lambda", "add a backend function", "add an API endpoint", "add an SQS/EventBridge consumer" or "add a scheduled job".
argument-hint: <function-name> [--trigger graphql|sqs|eventbridge|schedule]
---

# Amplify Lambda

Follow `amplify-backend-standards` for every file you touch; `lambda-standards` for runtime behaviour;
`dynamodb-access-patterns` for the repository. This skill is the procedure.

## New function

Copy this checklist and tick it off:

```
- [ ] 1. Check nothing existing already does this (grep amplify/functions, amplify/data/resource.ts)
- [ ] 2. Scaffold
- [ ] 3. Register (backend.ts, schema, triggers) — the scaffolder prints the exact snippets
- [ ] 4. Fill in types, repository, service; add builders/model-call units as needed
- [ ] 5. Tests for every unit; typecheck; run tests
- [ ] 6. Validate the stack (amplify-deploy) — infra changed
```

**2. Scaffold.** From the project root:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/scaffold-lambda.mjs <function-name> --trigger graphql|sqs|eventbridge|schedule
```

It creates `amplify/functions/<function-name>/` and refuses to overwrite an existing folder:

```
resource.ts                     defineFunction: runtime 22, arm64, timeout per trigger
handler.ts                      composition root: zod-parsed event + config, module-scope clients
types/index.ts                  input/result/record types, Clock, Logger
services/<name>-service/        <name>.service.ts + .test.ts + index.ts + interfaces/
repositories/<name>-repository/ <name>.repository.ts + .test.ts + index.ts + interfaces/
```

If the project has its own client factories, logger, path aliases or shared repositories (see CLAUDE.md),
switch the generated handler to them right after scaffolding and delete what they replace.

**3. Register.** Do every step the scaffolder printed. A function missing from `defineBackend`, from
`a.handler.function(...)`, or from `allow.resource(...)` (when it calls the Data API) deploys nothing
or fails with 401/null at runtime.

**4. Fill in the logic.**
- Rename the generated input, result and record types; alias `Schema['Model']['type']` where the table
  is an Amplify model.
- Repository first: write the access plan (tables, keys, waves, atomic writes), reuse or extend an
  existing repository before adding methods to the new one.
- Service: one public method named for the use case, orchestration only. Record shaping goes into a
  builder unit; each model call into its own unit.
- Add a folder only when needed. Keep each unit's `index.ts` the only import path into it.

**5. Verify.** Typecheck the backend project, run `<test runner> amplify/functions/<function-name>`,
then the project's quality gate if it has one.

## Changing an existing function

Match its existing structure. Code-only changes need no re-registration; anything in `resource.ts`,
`backend.ts` or `data/resource.ts` is an infra change and needs a full sandbox deploy (`amplify-deploy`).
Before changing a shared repository's method signature, find and update every caller.

## Where to look

- **Writing `resource.ts`, granting access, wiring GraphQL/SQS/EventBridge/schedule, secrets, cycles** →
  read [reference/resource-and-registration.md](reference/resource-and-registration.md)
- **Shaping the handler, service, repository, builders, model calls, Data API client** → read
  [reference/handler-and-services.md](reference/handler-and-services.md)
- **Writing the unit tests or a manual harness** → read [reference/testing.md](reference/testing.md)

## Done when

- [ ] Handler holds only validation, wiring and the response; `new`, `process.env`, `new Date()` only there.
- [ ] Every unit has `index.ts`, `interfaces/` and a colocated test using plain-object fakes.
- [ ] No AWS SDK import outside a repository; no Scan; no write inside a loop.
- [ ] External and model input parsed with zod; caller derived from auth context.
- [ ] Registered everywhere the scaffolder listed; least-privilege grants; secrets via `secret()`.
- [ ] Typecheck, tests and stack validation ran — report which ones.

Deploy only when asked — use `/amplify-deploy`.
