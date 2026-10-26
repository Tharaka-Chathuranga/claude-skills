---
name: react-component
description: Builds React components and feature folders and fixes render performance. Use when creating a .tsx component, page or feature, "extract this into a component", "too many re-renders", "why is this slow".
---

# React component

Follow the project's layout in CLAUDE.md where it differs from the defaults below. Names and general code rules
follow `code-quality`; types follow `typescript`.

## Rules

1. **One component, one job.** If it fetches data *and* renders a detailed UI, split it into a container
   (data, state, callbacks) and a presentational component (props in, JSX out).
2. **Stay under the file line cap from `quality.config.json`.** When nearing it, extract child components
   into `components/` and logic into a hook (see `react-hook`). Never compress code or strip comments to fit.
3. **Outsiders import only through `index.ts`.** Never reach into another component's internals.
4. **Private until reused.** A component used in one place lives under its parent's `components/`. Promote
   it to the shared folder when a second consumer appears.
5. **No hardcoded user-facing strings** if the project uses an i18n library (see its i18n skill).
6. **Test by kind, following the project's setup.** Logic (utils, hooks' pure parts, reducers) gets unit
   tests. Rendering and interaction are covered by component tests where the test runner has a DOM (jsdom),
   or by Storybook stories with play functions where it doesn't. Add a story if the project uses Storybook.

## Where it goes

| Kind | Location (default) |
| --- | --- |
| Reusable, feature-agnostic | `src/components/<name>/` |
| Belongs to one feature or page | the feature's folder, e.g. `src/features/<feature>/components/<name>/` |
| Private child of one component | `<parent>/components/<name>.tsx` |

A single-file component stays a single file. Turn it into a folder when it needs a second file:

```
<name>/
  index.ts              # public surface only
  <name>.tsx            # the component
  types.ts              # props/types shared by more than one file
  constants.ts          # extracted magic values
  components/           # private children
  hooks/use-x/          # see react-hook
  utils/<fn>.ts         # pure helpers, one per file
  <name>.test.tsx       # or __tests__/ — follow the neighbouring files
  <name>.stories.tsx    # or stories/ — follow the neighbouring files
```

```ts
// index.ts
export { InvoiceTable } from './invoice-table';
export type { InvoiceTableProps } from './types';
```

## Component shape

- Named function export; no default export unless the framework requires one (e.g. route files).
- `interface <Component>Props` directly above the component (or in `types.ts` if shared). Destructure in the
  signature with inline defaults.
- Accept narrow props: the fields the component renders, not the whole domain object, unless it renders most of it.
- Callbacks are `on<Event>` props (`onSelect`, `onSubmit`); the parent decides what happens.
- Use a discriminated union when props are mutually exclusive (`{ mode: 'view' } | { mode: 'edit'; onSave }`)
  instead of several optional booleans.
- Compute derived values as named consts above `return`; keep JSX free of nested ternaries.
- Every async UI handles loading, empty and error states explicitly.
- `children` / slot props over configuration props once a component grows more than a few render flags.

```tsx
interface InvoiceRowProps {
  number: string;
  total: number;
  isOverdue?: boolean;
  onOpen: (number: string) => void;
}

/** One invoice line with an overdue marker. */
export function InvoiceRow({ number, total, isOverdue = false, onOpen }: InvoiceRowProps) {
  const label = formatCurrency(total);
  return (
    <li>
      <button type="button" onClick={() => onOpen(number)}>{number}</button>
      <span>{label}</span>
      {isOverdue && <OverdueBadge />}
    </li>
  );
}
```

## Splitting an oversized component

1. Move state + effects + callbacks that only touch that state into a hook.
2. Move each visually distinct region into a child in `components/`, passing only what it needs.
3. Move pure formatting/calculation into `utils/` with unit tests.
4. Done when the parent reads as composition: hook call, derived values, child components.

Behaviour must not change; run the existing tests before and after.

## Verify

Run type-check, lint and the new/affected tests, then the project's quality gate if it has one. Report real results.

## Where to look

- **Choosing how to structure a component** (container/presentational, compound components, render props vs
  hooks, controlled vs uncontrolled, context vs prop drilling) → read [reference/patterns.md](reference/patterns.md)
- **Creating a page, feature or section, or a feature folder is messy** (thin route, view, provider, services,
  parts by region, the four UI states) → read [reference/feature-structure.md](reference/feature-structure.md)
- **"Why is this slow", too many re-renders, the list lags, bundle size, or before adding memo** → read
  [reference/performance.md](reference/performance.md)
- **Building a form or create/edit dialog** → the `react-forms` skill
