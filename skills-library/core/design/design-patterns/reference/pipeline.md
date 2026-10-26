# Pipeline

**Use when:** sequential transformations with clear intermediate types (ETL, multi-stage LLM generation, Report build).
**Don't when:** only 2 steps; call them in sequence.
**Lighter first:** a function that awaits each stage in order with typed intermediate variables.

## Shape

```ts
type StageContext = { clock: Clock; budget: TimeBudget; logger: Logger };
type Stage<I, O> = (input: I, ctx: StageContext) => Promise<O>;

export const runReportPipeline = async (req: ReportRequest, ctx: StageContext) => {
  const raw = await loadOrders(req, ctx);
  const enriched = ctx.budget.remainingMs() > 5_000 ? await enrichOrders(raw, ctx) : raw;
  const summary = await summarize(enriched, ctx);
  return renderReport(summary, ctx);
};
```

## Rules

- One function/class per stage, each with one collaborator (e.g. one model client or one repository).
- Each stage has explicit input/output types; no shared mutable bag between stages.
- Shared context carries cross-cutting concerns only: clock, time budget, logger.
- Mark stages required vs optional; skip optional ones when the budget is low and log the skip.
- Inject stage deps by closure (`makeSummarize(llm)`), built in the composition root.

## Test it

- Test each stage alone with a fake collaborator and a fixed clock.
- One end-to-end test of the pipeline with all fakes, including a low-budget run that skips optional stages.

**Related:** `middleware-chain`, `null-object`, `llm-functions`
