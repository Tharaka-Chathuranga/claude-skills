## Contents

- Adapter
- Decorator
- Facade
- Proxy
- Composite

Structural patterns change how components connect without changing what they do. Each adds a layer;
make sure that layer removes more coupling than it costs.

## Adapter

**Problem:** a third-party API (SDK, HTTP service, LLM provider, payment gateway) has a shape your code
shouldn't know. Its types and quirks leak into business logic, and switching providers means a rewrite.

**When to use:** at every boundary with an external system that business logic calls. Define the
interface in your terms; the adapter translates.

**When not to:** stable, ubiquitous libraries with no realistic replacement and no I/O (collection
utilities, date math). Don't mirror the vendor API one-to-one — that's a pass-through, not an adapter.

```ts
// Port in domain terms
interface TextGenerator {
  generate(prompt: string, opts: { maxTokens: number }): Promise<string>;
}
// Adapter owns the vendor SDK and its error/response shape
export class VendorTextGenerator implements TextGenerator {
  constructor(private readonly client: VendorClient, private readonly model: string) {}
  async generate(prompt: string, { maxTokens }: { maxTokens: number }) {
    const res = await this.client.messages.create({
      model: this.model, max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.find((c) => c.type === 'text');
    if (!text) throw new Error('Model returned no text');
    return text.text;
  }
}
```

**Seen in:** LLM client wrappers with schema-validated output; storage, email and payment providers.

## Decorator

**Problem:** the same cross-cutting code (logging, retry, caching, timing, metrics, auth checks) is
copy-pasted around many calls.

**When to use:** wrap an interface with another implementation of the same interface that adds the
concern and delegates. Callers and the wrapped unit stay unchanged.

**When not to:** one call site — inline the try/retry. Deep stacks of decorators make stack traces and
ordering hard to reason about; keep it to two or three, assembled in the composition root.

```ts
export const withRetry = <A extends unknown[], R>(
  fn: (...args: A) => Promise<R>, attempts = 3,
) => async (...args: A): Promise<R> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(...args); }
    catch (err) { lastError = err; await sleep(2 ** i * 100); }
  }
  throw new Error('Retries exhausted', { cause: lastError });
};
const fetchUser = withRetry(api.fetchUser.bind(api));
```

**Seen in:** middleware stacks (HTTP, serverless), higher-order functions, React higher-order components
(now mostly replaced by hooks).

## Facade

**Problem:** callers must orchestrate several subsystem calls in the right order to do one simple job,
and that sequence is duplicated.

**When to use:** a small, task-shaped API in front of a complex subsystem (`publishDocument(doc)` instead
of render → upload → index → notify).

**When not to:** if the facade grows every subsystem method, it's a god object. If it only forwards one
call, remove it.

```ts
export class DocumentPublisher {
  constructor(private renderer: Renderer, private storage: Storage, private search: SearchIndex) {}
  async publish(doc: Doc): Promise<string> {
    const html = this.renderer.render(doc);
    const url = await this.storage.put(`docs/${doc.id}.html`, html);
    await this.search.index({ id: doc.id, title: doc.title, url });
    return url;
  }
}
```

**Seen in:** a service layer method is often a facade over repositories and adapters; frontend `services.ts`
modules hide the API client.

## Proxy

**Problem:** control access to an object — lazy creation, caching, access checks, remote calls — while
keeping its interface.

**When to use:** expensive initialisation that may not be needed, or a remote resource behind a local interface.

**When not to:** if it adds behaviour unrelated to access control, it's a decorator; name it as one.

```ts
export const lazy = <T>(create: () => T) => {
  let instance: T | undefined;
  return () => (instance ??= create());
};
const getPdfRenderer = lazy(() => new HeavyPdfRenderer());
```

**Seen in:** lazy-loaded modules and components, memoised selectors, RPC client stubs.

## Composite

**Problem:** tree structures where callers should treat a leaf and a group the same way.

**When to use:** genuinely recursive data — UI trees, menus, file systems, rule expressions.

**When not to:** flat lists. Don't force a tree onto data that's one level deep.

```ts
type Rule =
  | { kind: 'match'; field: string; value: string }
  | { kind: 'all'; rules: Rule[] }
  | { kind: 'any'; rules: Rule[] };
export function evaluate(rule: Rule, record: Record<string, string>): boolean {
  switch (rule.kind) {
    case 'match': return record[rule.field] === rule.value;
    case 'all': return rule.rules.every((r) => evaluate(r, record));
    case 'any': return rule.rules.some((r) => evaluate(r, record));
  }
}
```

**Seen in:** component trees in every UI framework; filter/query expression builders.
