# React design patterns

## Contents

1. Hooks composition
2. Container / presentational
3. Compound components
4. Render props vs hooks
5. Controlled vs uncontrolled
6. Context vs prop drilling
7. Choosing quickly

General design principles (SOLID, coupling, layering) live in the `software-design` skill. This file covers
only how they apply to React components.

## 1. Hooks composition

Default way to share behaviour. Build small hooks that do one thing and compose them in a feature hook.

```tsx
function useInvoiceFilters() {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const invoices = useInvoices({ query: debounced });
  return { query, setQuery, ...invoices };
}
```

- A component should call one or two feature hooks, not ten primitive ones.
- Hooks return objects, so adding a field later is not a breaking change.
- If a hook needs JSX to be useful, it is a component, not a hook.

## 2. Container / presentational

- **Container**: owns data fetching, state and side effects; renders a presentational component.
- **Presentational**: pure props → JSX. No fetching, no global state. Easy to story and test.

Use it when a component is reused with different data sources, or when the UI needs stories/tests without
mocking the network. Skip it for tiny components where the split adds a file for nothing. In modern React
the "container" is often just a hook plus a thin wrapper.

## 3. Compound components

For components with related parts that share implicit state: tabs, accordions, menus, steppers.

```tsx
<Tabs defaultValue="details">
  <Tabs.List>
    <Tabs.Trigger value="details">…</Tabs.Trigger>
    <Tabs.Trigger value="history">…</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="details">…</Tabs.Panel>
</Tabs>
```

- Share state through a private context created in the component's folder; export a hook that throws a clear
  error when used outside the root.
- Prefer this over a single component with a `items={[{ label, content, icon, disabled, … }]}` config array
  once consumers need custom markup per part.
- Don't build one when a UI library already provides the primitive.

## 4. Render props vs hooks

- **Hooks first.** They compose, don't nest, and type cleanly.
- **Render props / function-as-children** only when the *parent* must control rendering at a position inside
  the child's markup: virtualised list rows, table cells, a `renderEmpty` slot.
- Slot props (`header`, `footer`, `emptyState` as `ReactNode`) beat render props when no data needs to flow
  back from the child.
- Higher-order components: avoid in new code; wrap with a hook instead.

## 5. Controlled vs uncontrolled

- **Controlled** (`value` + `onChange`): parent owns state. Needed when the parent validates, syncs, resets or
  derives other UI from the value.
- **Uncontrolled** (`defaultValue`, internal state, ref): fine for isolated inputs and large forms managed by a
  form library.
- Reusable inputs should support both: use `value` when provided, otherwise internal state seeded from
  `defaultValue`. Never switch between modes during a component's life.
- Resetting an uncontrolled component: change its `key`, don't sync props into state with an effect.

## 6. Context vs prop drilling

- Passing props through two or three levels is fine and explicit. Don't reach for context to save typing.
- Use context for values many distant components read and that change rarely: theme, current user, locale,
  feature flags, a compound component's internal state.
- Split contexts by update frequency: one for state, one for stable actions, so action-only consumers don't
  re-render. Memoise the provider `value`.
- Server data belongs in the data-fetching library's cache, not in a hand-rolled context.
- Before adding context, try composition: pass the already-built element as `children` so intermediate
  components never see the prop.
- Each context gets a `useX()` accessor that throws outside its provider; don't export the raw context.

## 7. Choosing quickly

| Situation | Pattern |
| --- | --- |
| Reuse stateful logic | Custom hook |
| Same UI, different data source | Container + presentational |
| Parts that share hidden state | Compound components |
| Parent must render inside child markup | Render prop / slot |
| Parent needs to read or reset the value | Controlled |
| Value needed far away, changes rarely | Context with split state/actions |
| Value needed two levels down | Props |
