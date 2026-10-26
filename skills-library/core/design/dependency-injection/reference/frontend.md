# Dependency injection in React and the frontend

## Where things are built

- **Clients** (API/GraphQL client, analytics, feature flags) are created once in the app root or a
  root provider, never inside components.
- **Services** are plain async functions that take what they call as a parameter, defaulting to the
  real client only at the edge:

```ts
type OrderMutations = Pick<ApiClient['mutations'], 'cancelOrder'>;

export async function cancelOrder(id: string, mutations: OrderMutations = getClient().mutations) {
  const { data, errors } = await mutations.cancelOrder({ id });
  if (errors || !data) throw new Error(errors?.[0]?.message ?? 'Failed to cancel order');
  return data;
}
// test: await cancelOrder('o1', { cancelOrder: jest.fn().mockResolvedValue({ data: {} }) });
```

  A module-level `const client = getClient()` in every services file is a service locator: tests must
  `jest.mock` the client module.

## Props, then context

- Pass dependencies as **props** when the consumer is one or two levels down.
- Use **context** for values far apart in the tree (current user, API client, theme, store). Throw a
  clear error when the hook is used outside its provider.
- Providers are composition roots for their subtree; tests render the component inside the provider
  with fake values.

## Stores

Create stores **per provider instance**, not as module globals, so tests and multiple instances
don't share state:

```ts
export function OrderEditorProvider({ initial, children }: Props) {
  const store = useRef(createOrderEditorStore(initial)).current; // zustand createStore + slices
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
```

## Hooks

- A hook that fetches takes its service (or reads it from context) instead of importing a singleton
  client, so stories and tests can supply a fake.
- Keep decisions in pure functions (`applyFilters(items, filters)`) that hooks call; test those
  directly.

## Registries

Plugin/strategy registries held in a module singleton force `jest.mock`. Pass the registry in (prop,
context or parameter), or expose a factory that builds it from a list.
