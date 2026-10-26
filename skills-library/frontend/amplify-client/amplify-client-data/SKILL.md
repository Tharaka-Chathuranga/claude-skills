---
name: amplify-client-data
description: Reads and writes Amplify Data from the frontend with generateClient and the generated Schema type — services module, nextToken pagination, secondary-index queries instead of filters, selection sets, errors and loading. Use when a component needs backend data, or when asked to "fetch this from the backend", "add pagination" or "filter this list".
---

# Amplify client data

## Rules

1. **Calls live in a services module, never in components.** Component → hook → service → client. The
   project's CLAUDE.md says where services go; default to a `services.ts` beside the feature.
2. **Typed clients from one helper module.** `generateClient<Schema>()` once per client kind (or the
   project's client helpers): one for signed-in users, one for guest/anonymous pages that call only public
   operations, and the server client for SSR. Types come from `Schema`; the only cast allowed is the TS2590
   escape hatch below.
3. **Filter with keys, not `filter`.** Lists that filter or sort by a field use the secondary-index query
   field (`client.models.Order.listOrdersByCustomer`). `list({ filter })` scans the table and pages can
   come back empty while more data exists. Never fetch everything and filter in the browser.
4. **Paginate with `nextToken`.** Any list that can exceed one page passes `limit` and `nextToken`.
5. **Check `errors` as well as `data`.** A response can resolve with `errors` set and `data` null:
   `if (errors?.length || !data) throw new Error(errors?.[0]?.message ?? '<operation> failed')` — a
   descriptive error, never a silent `null`.
6. **Select only what you render** with `selectionSet`, declared as an `as const` array next to the service,
   with the result type built from it (`SelectionSet<…>` or `Pick<Schema['Order']['type'], 'id' | 'status'>`).
7. **Long-running operations return a job id.** A mutation that starts AI generation, an export or other
   slow work returns `{ jobId }`; the client polls a status query or subscribes, rather than awaiting a
   request that can hit the 30 s AppSync timeout.

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

Inside a Lambda, the Data API client follows `amplify-lambda` (memoised async factory, called in the
handler; prefer direct DynamoDB repositories in hot paths).

Server-side rendering (Next.js): use `generateServerClientUsingCookies` /
`generateServerClientUsingReqRes` from `@aws-amplify/adapter-nextjs/data`, never the browser client.

Guest/anonymous pages: a separate client (e.g. `authMode: 'lambda'` with a public/guest token, or
`'identityPool'`) that only calls operations the backend marks public. Keep the clients in one helper module
and export getters (`getAuthClient()`, `getGuestClient()`); services pick one.

## TS2590: "Expression produces a union type that is too complex to represent"

The generated client's types can exceed the compiler's limit on large schemas (often on `client.models.X.list`
with a selection set). The sanctioned escape hatch: **one** typed wrapper or proxy in the client helper module
that loosens the problematic call signatures, used by every service. Re-type the result immediately in the
service (`as Order[]` / a `SelectionSet` type) so nothing untyped leaves it. Never scatter `as any` or
`@ts-ignore` across services or components.

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

Keep `nextToken` in hook state; "load more" appends the next page; a new filter or parent id resets
items and token. With server-side filters a page can be short or empty while `nextToken` is set — continue on
the token, not on item count.

## Loading and errors in the hook

- Expose `loading`, `error`, `data` (and `loadMore`, `hasMore` for lists). Render loading, empty and
  error states distinctly.
- On a failed refetch keep the last good data on screen and surface the error (toast or inline).
- Guard against stale responses: a request id or abort flag so a slow earlier call cannot overwrite a
  newer one; skip calls while required ids (such as the user id) are still null.

## Realtime

`client.models.X.observeQuery(...)` or `onCreate/onUpdate/onDelete(...).subscribe(...)`. Always
unsubscribe in the effect cleanup. Subscriptions follow model authorization; scope them with the same
key fields as the list.

## Done when

- [ ] No `client.` call outside the services module.
- [ ] Lists use index query fields and `nextToken`; no client-side filtering of full tables.
- [ ] `errors` checked on every call; loading, empty and error states render.
- [ ] No `any` casts on results outside the single TS2590 wrapper; results re-typed in the service.
