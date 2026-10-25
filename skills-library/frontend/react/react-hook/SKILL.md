---
name: react-hook
description: Creates or fixes a custom React hook in a folder-per-hook layout with correct effect cleanup, ref vs state choices, stable callbacks, derived state and data fetching through the project's data library. Use when asked to "make a hook", "extract this into a hook", "fetch data in a component", when fixing a useEffect bug, infinite re-render or stale closure, or when exhaustive-deps complains.
---

# React hook

Follow the project's layout in CLAUDE.md where it differs. Names follow `naming`; types follow `type-safety`.
Backend data calls follow the project's data-access skill (e.g. `amplify-client-data`) where one exists.

## Rules

1. **Server data goes through the project's data library** (React Query, SWR, or the framework's loader) —
   never `useEffect` + `fetch` + `useState`. The query key includes every variable the request depends on.
   Return the library's `data/error/isLoading` instead of copying them into local state.
2. **Never silence `react-hooks/exhaustive-deps`.** Fix the cause: move the function inside the effect, read
   the latest value from a ref, or stabilise the dependency upstream.
3. **Every subscription, timer, listener, observer, socket and in-flight request is cleaned up** in the
   effect's return.
4. **Derive, don't sync.** A value computable from props/state is computed during render (`useMemo` only if
   expensive). An effect that only calls `setState` from other state is a bug.
5. **`useRef` for values the UI doesn't render** (instances, timers, latest callback, previous value);
   `useState` only for what affects output.
6. **Hooks are called unconditionally**, at the top level, in the same order. Pass an `enabled` option
   instead of calling a hook conditionally.
7. `useCallback`/`useMemo` only when identity matters: the value is a dependency of another hook or a prop
   of a memoised child. See `react-performance`.

## Layout

```
hooks/
  use-order-search.ts            # single file when it has no companions
  use-order-sync/
    index.ts                     # export { useOrderSync } from './use-order-sync'
    use-order-sync.ts
    constants.ts                 # debounce ms, page sizes, retry counts
    types.ts                     # options/return types consumers need to name
    use-order-sync.test.ts
```

File name is the hook name in kebab-case. Hooks used by one component live in that component's `hooks/`.

## Signature

- Positional args for one or two parameters; an options object for three or more.
- Return an object with named fields; a tuple only when mirroring `useState`.
- Include `enabled?: boolean` when callers may need to defer the work.

## Effects that are right

```ts
useEffect(() => {
  const controller = new AbortController();
  void loadPreview(url, { signal: controller.signal })
    .then(setPreview)
    .catch((error) => { if (!controller.signal.aborted) setError(error); });
  return () => controller.abort();
}, [url]);
```

- Use an effect only to sync with something outside React (DOM, browser API, socket, third-party widget).
  Event-driven work (submit, click) belongs in the handler, not an effect watching a flag.
- Latest-callback pattern for subscriptions that must not resubscribe when the handler changes:
  ```ts
  const onMessageRef = useRef(onMessage);
  useLayoutEffect(() => { onMessageRef.current = onMessage; });
  useEffect(() => socket.subscribe((m) => onMessageRef.current(m)), [socket]);
  ```
  Use the framework's `useEffectEvent` instead if the project's React version provides it.
- Reset state when an identity prop changes by giving the component a `key`, not with an effect.
- Mutations: use the data library's mutation hook and invalidate the affected keys; don't refetch manually.

## Pitfalls to check

- Object/array literals or inline functions in a dependency list → effect runs every render.
- Stale closure: a callback in `setInterval`/listener reads old state → use the functional updater
  (`setCount((c) => c + 1)`) or a ref.
- Race: two requests resolve out of order → abort the previous one or ignore stale results.
- Strict Mode double-invokes effects in development; a correct cleanup makes this harmless.
- Reading `ref.current` during render for output → it won't trigger an update; that value needs state.

## Extracting from a component

Move the state, plus effects and callbacks that only touch that state, into the hook. It's correct when the
component no longer references the state the hook now owns.

## Tests

Extract pure logic into `utils/` and unit test it. Test the hook itself with `renderHook` (wrapped in the data
library's provider with a fresh client per test) when lifecycle or cleanup is the behaviour. See `jest-tests`.

## Verify

Type-check, lint (exhaustive-deps clean), affected tests, then the project's quality gate. Report real results.
