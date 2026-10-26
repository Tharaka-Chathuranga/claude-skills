---
name: llm-functions
description: Structure backend functions that call LLMs — one unit per model call with a port, schema, prompt and test; versioned prompt ids with fallbacks; multi-stage pipelines with a time budget and bounded concurrency; required vs optional stages; async jobs for slow work; token tracking and privacy. Use when adding or changing a Lambda or service that calls an LLM, writing a prompt, building an AI generation pipeline, or when AI output is malformed or a generation times out.
---

# LLM functions

Builds on `lambda-standards` (its "LLM calls" section: timeouts, retries, schema validation, logging,
token attribution) and `software-design`. This skill is about how to **structure** AI code so it stays
testable and changeable.

## One unit per model call

```
llm/<unit-name>/
├── <unit-name>.ts          class implementing the port; builds messages, calls the client, parses
├── <unit-name>.schema.ts   zod schema of the expected output; every field has .describe()
├── <unit-name>.prompt.ts   prompt id + text (see Prompts)
├── <unit-name>.test.ts     fake client, fixture responses, one invalid response
├── interfaces/             the port the service depends on, e.g. IBriefBuilder
└── index.ts
```

- The service depends on the **port** (`IBriefBuilder`), never on the model SDK, so business logic is
  tested without a model.
- One model client abstraction for the project (e.g. `IStructuredClient.prompt(system, user, format)`),
  built once at module scope and injected. Provider switches (direct API vs proxy) live inside it.
- Model ids and temperature are named constants, not inline strings. Default temperature 0 unless the
  task needs variety.
- Structured output: convert the zod schema to the provider's JSON-schema response format, then
  `schema.parse(JSON.parse(raw))`. A parse failure is an error you handle, not something to cast away.

## Prompts

- Each prompt has a stable, dotted, **versioned id** (`report.summary.system.v2`) and its text. Bump the
  version when the meaning changes, so logs and evaluations can tell versions apart.
- If prompts can be overridden at runtime (e.g. from a table, for tuning without a deploy), load
  overrides once per invocation and fall back to the text in code when none exists.
- Prompts assembled from data go through a small builder function or class with its own tests.
- Keep instructions in the prompt and the output contract in the schema descriptions — not both.

## Pipelines

For generation in several steps:

- One class per stage (`stage-1-outline/`, `stage-2-draft/`…), each with one model call, so token use
  and failures are attributable per stage.
- A **time budget** from the platform's remaining time (`context.getRemainingTimeInMillis()`) minus a
  reserve for saving results (~20 s). A stage checks the budget before starting and stops cleanly.
- Fan out with **bounded concurrency** (`mapWithConcurrency(items, 4, fn)`), never `Promise.all` over
  unbounded input — rate limits and memory.
- **Required stages** fail the job. **Optional enrichment** catches, logs a warning and continues.
- Persist intermediate results when a later stage is expensive, so a retry doesn't redo everything.

## Slow work runs async

Anything that can exceed the API gateway's timeout (AppSync and API Gateway: ~30 s) uses the async job
pattern (`lambda-standards` → reference/retries-and-idempotency.md): start request → job id → worker →
job row with status and TTL → client polls or subscribes. Size the worker for the whole pipeline.

## Cost and privacy

- Collect token usage per call (model, input/output tokens, stage, user, operation) and publish it
  once the job succeeds.
- Never log prompts or outputs containing user content; log ids, prompt id/version, model, sizes,
  timings and token counts.
- Send the model only the fields it needs — strip ids, emails and other personal data first.

## Testing

- Unit-test each LLM unit with a fake client returning fixture JSON: a valid response, an invalid one
  (schema failure) and an empty one.
- Test the service with fake ports, including an optional stage failing.
- Keep a hand-run script (e.g. `manual/run-real.ts`) to try real models; it never runs in CI.
