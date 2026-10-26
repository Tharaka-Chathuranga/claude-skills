# Feature structure

Builds on `code-quality` (reference/architecture-boundaries.md: layers and import direction) and the
single-component rules in SKILL.md. The project's actual folder names are in CLAUDE.md; follow them if they differ.

## Anatomy

```
app/<route>/page.tsx                 thin: metadata + <InvoicesView />, nothing else
features/invoices/                   (or sections/, modules/ — whatever the project uses)
├── index.ts                         the feature's public surface: the view + types other features need
├── view/invoices-view.tsx           composes regions; reads state from the context
├── context/
│   ├── invoices-provider.tsx        owns loading / error / data state and actions
│   ├── use-invoices-context.ts
│   ├── services.ts                  every backend call for this feature
│   └── types.ts                     selection sets, result types
├── header/invoices-header/          parts grouped by UI REGION, one folder per component
├── filters/invoice-filters/
├── table/invoice-table/  table/invoice-row/
├── hooks/use-x/                     feature-only hooks
└── utils/<fn>.ts                    pure helpers, one per file, unit-tested
```

- **Route files stay thin**: no fetching logic, no layout beyond what the route needs.
- **Group parts by where they sit on screen** (header, filters, table, sidebar), not in one flat
  `components/` folder — a 40-file `components/` folder tells a reader nothing.
- Other features import only from `index.ts`. Code two features need moves down to the shared layer.
- When a services file passes ~10 calls, split into `services/<verb-noun>.ts`, one call per file.

## Data flow

```
services.ts  →  provider (or a feature hook)  →  view  →  parts (props)
```

- Services are plain async functions: one backend call each, typed results, throw a descriptive error
  on failure. They take ids as parameters and never read React context.
- The provider runs independent fetches in parallel, guards against stale responses when ids change,
  exposes actions (`refresh`, `remove`, `loadMore`), and resets when the route id changes.
- Parts get data and callbacks through props or the feature context — they never call services.
- Large editable state (editors, builders) uses a store (e.g. zustand slices) behind the context
  instead of many `useState`s.

## The four UI states

Every view that shows backend data renders all four, using the design system's components:

1. **Loading**: skeletons shaped like the content (not a full-page spinner after first load).
2. **Empty**: a translated empty state, with an action when there is an obvious next step.
3. **Error**: a translated toast or inline message; keep the last good data visible.
4. **Data**.

Pagination appends with a "load more" or infinite list; keep earlier items while loading the next page.

## Before you finish

- [ ] Page file only renders the view
- [ ] No backend call outside `services`
- [ ] Parts grouped by region, each with `index.ts`
- [ ] All four UI states handled; strings translated
- [ ] Pure helpers have unit tests; interactive parts have stories or component tests
