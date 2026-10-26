# Handler, services and units

## Contents

1. Folder layout
2. The handler
3. Dependency injection specifics
4. Service
5. Repository
6. Builder and util
7. Model-call (LLM) units
8. Multi-step pipelines
9. Types

General design rules (single responsibility, ports, composition root) are in `software-design`.
This file covers how they map onto an Amplify function.

## 1. Folder layout

```
amplify/functions/<function-name>/
  resource.ts
  handler.ts                       # composition root
  constants.ts                     # tunables, model ids, index names
  types/index.ts                   # Schema aliases + types this function owns
  services/<name>-service/         # <name>.service.ts, .test.ts, index.ts, interfaces/
  repositories/<name>-repository/  # same shape
  builders/<name>-builder/         # same shape; pure record construction
  llm/<unit>/                      # one folder per model call: class, .schema.ts, .prompt.ts, test
  utils/<fn-name>/                 # <fn-name>.ts + .test.ts + index.ts
  manual/run-real.ts               # optional hand-run harness
```

Add folders only when needed. Files are kebab-case with a role suffix (`.service.ts`, `.repository.ts`,
`.builder.ts`, `.schema.ts`, `.prompt.ts`).

## 2. The handler

Order: bind request context to the logger → parse the event (zod) → load config → build the graph →
call one service method → shape the response.

```ts
export const handler: Schema['sendReceipt']['functionHandler'] = async (event, context) => {
  logger.addContext(context);
  const userId = userIdFromIdentity(event.identity);         // never from event.arguments
  const { orderId } = argumentsSchema.parse(event.arguments);
  const { ORDER_TABLE_NAME, MAIL_API_KEY } = loadConfig();

  const service = new SendReceiptService({
    orders: new OrderRepository(dynamo, { order: ORDER_TABLE_NAME }),
    mailer: new HttpMailer(MAIL_API_KEY, logger),
    builder: new ReceiptBuilder(),
    logger,
    clock: systemClock,
  });
  return service.sendReceipt({ userId, orderId });
};
```

Job-backed flows (long work started by a mutation that returns a job id): the handler owns the job
lifecycle — mark running, call the service, record `COMPLETED` with the result or `FAILED` with the
message in a `catch`, and log the error with the job id.

## 3. Dependency injection specifics

- Constructor parameters are `private readonly` and typed by interface (`IOrderRepository`), narrowed
  with `Pick<>` when only one or two methods are used.
- Past about six dependencies, take one `Deps` object; optional dependencies get a neutral default in
  the constructor (`timeBudget ?? unlimitedBudget`) instead of `if (this.x)` checks in logic.
- Ports for ambient capabilities: `Clock { now(): string }`, `TimeBudget { remainingMs(); hasRemaining(ms) }`
  built from `context.getRemainingTimeInMillis()` minus a reserve.
- SDK clients built at module scope are still passed down through constructors; no unit imports a client.

## 4. Service

- One public method named for the use case; private helpers per step.
- Shape: load (repository, once) → decide (pure logic, builders) → act (external calls) → persist
  (repository, once).
- An entity missing because an event raced is a logged skip that returns, not a throw.
- Optional enrichment never fails the main path: `.catch()` → warn → continue with a fallback.
- Guard clauses throw with the offending id in the message.

## 5. Repository

Covered by `dynamodb-access-patterns`. Amplify specifics:

- Table names arrive from env vars set in `backend.ts` (`addEnvironment`) or the project's table-name
  helper; the handler maps them into a named `TableNames` object.
- Generic single-table repositories may be shared across functions (check the project's shared folder
  first); use-case repositories spanning several tables live in the function.
- Return records typed with `Schema['Model']['type']` aliases. Amplify models carry `createdAt`,
  `updatedAt` and `__typename`; set them on direct writes so the Data API reads them back correctly.

## 6. Builder and util

- Builder: pure record construction from inputs — defaults, fallbacks, id derivation. No I/O, no async.
- Util: one exported pure function per folder, named after it. Utils needing a contract get
  `interfaces/` like any unit.

## 7. Model-call (LLM) units

One folder per call: `<unit>.ts` (class implementing `I<Unit>`), `<unit>.schema.ts` (zod),
`<unit>.prompt.ts` (prompt text), test, `index.ts`, `interfaces/`.

```ts
const raw = await this.model.complete(SYSTEM_PROMPT, JSON.stringify(input), toResponseFormat(summarySchema));
const parsed = summarySchema.parse(JSON.parse(raw));
return { ...parsed, title: parsed.title.trim() || input.fallbackTitle };
```

- Depend on a one-method model-client interface, never a vendor SDK directly.
- `JSON.parse` is always followed by `schema.parse`. Well-formed JSON with wrong fields is common.
- Every schema field has `.describe()` written as an instruction, including the empty case
  ("return an empty array if none apply"). Export `z.infer` types; never hand-write duplicates.
- Structured input goes as `JSON.stringify` of a named object, not string concatenation.
- Prompt text lives in `.prompt.ts` with a versioned id (`summary.v2`); a contract change gets a new id.
- Model ids are constants. Tag calls with a stage label if the project records token usage.
- Parallel model calls go through bounded concurrency; optional passes check the `TimeBudget` first.
- Anything calling a model gets `manual/run-real.ts` (see testing.md).

## 8. Multi-step pipelines

When the work has three or more sequential steps, make each a stage:

```ts
export interface Stage<In, Out> {
  readonly name: string;
  execute(input: In, context: StageContext): Promise<Out>; // context: clock, timeBudget, logger
}
```

Stages live in numbered folders (`stage-1-<verb>/`, `stage-2-<verb>/`) owning their types, model units
and utils; nothing is shared sideways — shared shapes move up to `types/`. The service composes stages
and enforces cross-stage invariants. Stages log a summary (counts), not payloads.

## 9. Types

`types/index.ts` aliases generated models and declares what the function owns:

```ts
import type { Schema } from '../../../data/resource';
export type Order = Schema['Order']['type'];
export interface SendReceiptInput { userId: string; orderId: string }
```

Logic files import types from `types`, never directly from `data/resource`.
