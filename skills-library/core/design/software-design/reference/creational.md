## Contents

- Factory (function or method)
- Builder
- Singleton (and what to do instead)
- Prototype / copy-with

Creation is mostly a non-problem: a constructor or object literal is the default. Reach for these only
when construction itself has become the source of bugs or duplication.

## Factory (function or method)

**Problem:** the implementation to use is chosen at runtime (config, input, environment), and that
choice is duplicated wherever an instance is needed.

**When to use:** two or more real implementations, selected in more than one place, or selection logic
that has rules worth testing.

**When not to:** one implementation; or selection happens once in the composition root (just write the
`if` there). Don't create `XFactory` classes holding one static method — a function is enough.

```ts
interface Storage { put(key: string, body: Uint8Array): Promise<void> }

export function createStorage(config: StorageConfig): Storage {
  switch (config.kind) {
    case 's3': return new S3Storage(config.bucket);
    case 'local': return new LocalStorage(config.dir);
    default: {
      const unreachable: never = config;
      throw new Error(`Unknown storage: ${JSON.stringify(unreachable)}`);
    }
  }
}
```

**Seen in:** composition roots picking a real vs fake client; model-provider selection for LLM calls.

## Builder

**Problem:** an object needs many optional parts, assembled over several steps, and partially built
objects must never escape.

**When to use:** complex value assembly (queries, prompts, documents, test fixtures) where the order of
steps or defaults matter and the final `build()` can validate the whole.

**When not to:** an options object with defaults covers most cases (`{ ...defaults, ...overrides }`).
Don't write a builder for an object with three fields.

```ts
export class QueryBuilder {
  private readonly filters: string[] = [];
  private limitValue = 50;
  where(clause: string) { this.filters.push(clause); return this; }
  limit(n: number) { this.limitValue = n; return this; }
  build(): Query {
    if (this.limitValue > 1000) throw new Error('limit too large');
    return { filters: [...this.filters], limit: this.limitValue };
  }
}
const q = new QueryBuilder().where('status = open').limit(20).build();
```

**Seen in:** test-data builders (`aUser().withRole('admin').build()`), prompt builders assembling LLM input
from segments, HTTP request builders.

## Singleton (and what to do instead)

**Problem it claims to solve:** exactly one instance of an expensive resource (connection pool, SDK client).

**When to use:** create the single instance in the composition root (or module scope of the entry point,
to reuse across warm invocations) and **inject it**. One instance is a wiring decision, not a class property.

**When not to:** never use a globally reachable `getInstance()` for something with state or I/O. It hides
dependencies, makes tests share state, and leaks user/request data across calls.

```ts
// Entry point: one client, reused across invocations, passed down explicitly
const db = createDbClient();
export const handler = async (event: Event) => {
  const service = new ReportService(new ReportRepo(db), systemClock);
  return service.run(parse(event));
};
```

**Seen in:** serverless functions keep clients at module scope for warm reuse but never request data;
React apps provide shared clients via context, not imported singletons.

## Prototype / copy-with

**Problem:** creating variants of an existing immutable value without mutating it.

**When to use:** immutable models where most fields stay the same — spread (`{ ...user, name }`), or a
`copyWith` method in languages without spread.

**When not to:** deep structures updated in many places — consider a dedicated update function or an
immutable-update helper instead of nested spreads everywhere.

```ts
const renamed: User = { ...user, name: 'New name' };
const withTag: Doc = { ...doc, meta: { ...doc.meta, tags: [...doc.meta.tags, 'x'] } };
```

**Seen in:** reducers and state stores; Dart `copyWith` on immutable model classes.
