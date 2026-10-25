---
name: react-performance
description: Diagnoses and fixes React rendering and loading performance — measuring with the Profiler first, memo/useMemo/useCallback only with evidence, list virtualisation, code splitting with lazy, context re-render cascades and bundle size. Use when asked "why is this slow", "too many re-renders", "optimise this component", "the list lags", "reduce bundle size", or before adding memoisation.
---

# React performance

## Rules

1. **Measure before changing anything.** Record the slow interaction in the React DevTools Profiler (or the
   browser Performance panel) and name the component and cause. No evidence, no optimisation.
2. **Fix the cause, not the symptom.** Most slowness is state placed too high, unstable context values, or
   rendering thousands of rows — not a missing `memo`.
3. **Memoisation needs a reason you can state.** `React.memo`, `useMemo`, `useCallback` each add cost and
   complexity. If the project uses the React Compiler, don't add manual memoisation at all unless the
   Profiler shows the compiler missed a case.
4. **Measure again after the change** and report before/after numbers (render count, commit ms, bundle kB).

## Finding the cause

- Profiler → "Why did this render?" (enable *Record why each component rendered*).
- Look for: a parent re-rendering a large subtree on every keystroke; a context provider whose `value` is a
  new object each render; expensive work in render; a list rendering every row.

## Fixes, in the order to try them

1. **Move state down.** Put state in the smallest component that needs it, so typing in an input re-renders
   the input, not the page.
2. **Lift content up.** Pass expensive subtrees as `children` to a stateful wrapper; children created by the
   parent don't re-render when the wrapper's state changes.
3. **Stabilise context.** Memoise the provider `value`; split state and actions into separate contexts; split
   contexts by update frequency; use a selector-based store for high-frequency shared state.
4. **Virtualise long lists** (e.g. over ~100 complex rows) with the project's virtualisation library or the UI
   library's virtualised component. Paginate or infinite-load when the data is server-side.
5. **Defer non-urgent updates.** `useDeferredValue` for a filtered list driven by an input; `useTransition`
   for expensive state changes; debounce network-bound inputs.
6. **Memoise with evidence**:
   - `React.memo` on a component that re-renders often with equal props and is costly to render.
   - `useMemo` for an expensive computation, or for an object/array passed to a memoised child or used as a
     hook dependency.
   - `useCallback` only for a function passed to a memoised child or used as a dependency.
   - A memoised child receiving a new inline object/function each render gains nothing — fix the props too.
7. **Keys**: stable IDs, never array index for lists that reorder, insert or delete.

## Loading performance

- **Code split by route** (the framework usually does this) and **lazy-load heavy, non-initial UI**: modals,
  editors, charts, maps — `React.lazy` + `Suspense`, or the framework's dynamic import.
- **Check bundle impact** before adding a dependency (bundle analyser or the package's published size). Prefer
  per-module imports when the library doesn't tree-shake well.
- Don't import a large library for one helper.
- Images: sized, lazy below the fold, modern formats via the framework's image component.

## Verify

Profile the same interaction again, confirm the improvement, run tests and the quality gate. Report numbers.
