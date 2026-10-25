---
name: amplify-client-data
description: Reads and writes Amplify Data from the frontend with generateClient and the generated Schema type — services module, nextToken pagination, secondary-index queries instead of filters, selection sets, errors, loading and tenant scoping. Use when a component needs backend data, or when asked to "fetch this from the backend", "add pagination" or "filter this list".
---

# Amplify client data

## Rules

1. **Calls live in a services module, never in components.** Component → hook → service → client. The
   project's CLAUDE.md says where services go; default to a `services.ts` beside the feature.
2. **One typed client.** `generateClient<Schema>()` once at module scope (or the project's client
   helper). Never cast results to `any`; types come from `Schema`.
3. **Filter with keys, not `filter`.** Lists that filter or sort by a field use the secondary-index query
   field (`client.models.Order.listOrdersByCustomer`). `list({ filter })` scans the table and pages can
   come back empty while more data exists. Never fetch everything and filter in the browser.
4. **Paginate with `nextToken`.** Any list that can exceed one page passes `limit` and `nextToken`.
5. **Check `errors` as well as `data`.** A response can resolve with `errors` set and `data` null.
6. **Tenant scoping.** If the project is multi-tenant (tenant key in CLAUDE.md), take the tenant from the
   app's auth/tenant context, pass it to every scoped call, and reset feature state when it changes. The
   backend derives the tenant from the token; a mismatched argument is a bug, not a fallback.
7. **Select only what you render** with `selectionSet`.

## Setup

```ts
// once, at app start
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
Amplify.configure(outputs);

// services module
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
const client = generateClient<Schema>();
```

Server-side rendering (Next.js): use `generateServerClientUsingCookies` /
`generateServerClientUsingReqRes` from `@aws-amplify/adapter-nextjs/data`, never the browser client.

## Service functions

```ts
type Order = Schema['Order']['type'];
const ORDER_FIELDS = ['id', 'status', 'total', 'createdAt'] as const;

export async function listCustomerOrders(customerId: string, nextToken?: string | null) {
  const { data, errors, nextToken: next } = await client.models.Order.listOrdersByCustomer(
    { customerId },
    { sortDirection: 'DESC', limit: PAGE_SIZE, nextToken, selectionSet: ORDER_FIELDS },
  );
  if (errors?.length) throw new Error(errors[0].message);
  return { items: data, nextToken: next ?? null };
}

export async function sendReceipt(orderId: string) {
  const { data, errors } = await client.mutations.sendReceipt({ orderId });
  if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? 'sendReceipt failed');
  return data;
}
```

- Model CRUD: `client.models.X.get/list/create/update/delete`. Custom operations:
  `client.queries.x(...)`, `client.mutations.x(...)`. If the operation you need does not exist, it is a
  backend change (`amplify-data-model`, `amplify-lambda`).
- The selection-set result type is narrower than `Order`; type props with
  `SelectionSet<Order, typeof ORDER_FIELDS>` from `aws-amplify/data`.
- Pass `authMode` only when the call differs from the default (`'apiKey'`, `'identityPool'` for guests).
- Counts and totals come from backend aggregates, not from listing every row.

## Pagination

Keep `nextToken` in hook state; "load more" appends the next page; a new filter or tenant resets items
and token. With server-side filters a page can be short or empty while `nextToken` is set — continue on
the token, not on item count.

## Loading and errors in the hook

- Expose `loading`, `error`, `data` (and `loadMore`, `hasMore` for lists). Render loading, empty and
  error states distinctly.
- On a failed refetch keep the last good data on screen and surface the error (toast or inline).
- Guard against stale responses: a request id or abort flag so a slow earlier call cannot overwrite a
  newer one; skip calls while required ids (user, tenant) are still null.

## Realtime

`client.models.X.observeQuery(...)` or `onCreate/onUpdate/onDelete(...).subscribe(...)`. Always
unsubscribe in the effect cleanup. Subscriptions follow model authorization; scope them with the same
key fields as the list.

## Done when

- [ ] No `client.` call outside the services module.
- [ ] Lists use index query fields and `nextToken`; no client-side filtering of full tables.
- [ ] `errors` checked on every call; loading, empty and error states render.
- [ ] Tenant-scoped calls take the tenant from context and reset on change.
- [ ] No `any` casts on results.
