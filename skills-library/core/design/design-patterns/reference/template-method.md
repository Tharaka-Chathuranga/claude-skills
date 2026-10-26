# Template method

**Use when:** several flows share a fixed skeleton and differ only in a few steps (load → transform → export Report).
**Don't when:** the variants share less than the skeleton; just write separate functions.
**Lighter first:** a function that takes the varying steps as function arguments.
**Often over-applied** — `abstract class` bases with protected hooks, used where higher-order functions suffice.

## Shape

```ts
type ReportSteps<T> = {
  load: (req: ReportRequest) => Promise<T[]>;
  toRow: (item: T) => ReportRow;
};

export const runReport = async <T>(req: ReportRequest, steps: ReportSteps<T>, out: ReportSink) => {
  const items = await steps.load(req);
  const rows = items.map(steps.toRow);
  await out.write(req.format, rows);
  return rows.length;
};
```

## Rules

- Inheritance couples steps to a base class with protected mutable state; an `abstract class` with protected constructor params is the smell.
- Pass steps explicitly; the skeleton depends on the step types, not on subclasses.
- Steps that need deps get them by closure (`makeLoad(repo)`), built in the composition root.
- Keep optional steps as optional with a no-op default, not `if (this.hook)` checks.

## Test it

- Test the skeleton once with stub steps (ordering, error paths).
- Test each step function on its own.

**Related:** `strategy`, `pipeline`, `null-object`
