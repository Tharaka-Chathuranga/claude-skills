---
name: nextjs-routing
description: Builds Next.js App Router routes — server vs client components with the "use client" boundary pushed down, layouts, loading and error boundaries, route handlers, metadata, dynamic params and caching/revalidation choices. Use when asked to "add a page", "add a route", "add an API route", "why is this page not updating", "fix hydration error", or when editing page.tsx, layout.tsx or route.ts.
---

# Next.js routing (App Router)

Check the installed Next.js version in `package.json` before relying on version-specific APIs (async `params`,
caching defaults, `use cache`). Follow the project's folder layout in CLAUDE.md.

## Rules

1. **Server components by default.** Add `'use client'` only to the smallest leaf that needs state, effects,
   event handlers or browser APIs. Never put it on a page or layout to fix one interactive widget.
2. **Route files stay thin.** `page.tsx` fetches (or calls a service) and composes feature components; no
   business logic, no large JSX trees. Default export is required here only.
3. **Server-only code never reaches the client**: services, secrets and SDK clients live in modules marked
   `import 'server-only'`. Only `NEXT_PUBLIC_*` env vars may be read in client components.
4. **Pass serialisable props** across the server → client boundary (no functions except server actions, no
   class instances, no Dates unless the version supports them).
5. **Every data-driven segment has a `loading.tsx` or `<Suspense>` and an `error.tsx`.** Call `notFound()` for
   missing resources instead of rendering an empty page.
6. **Decide caching explicitly** for each fetch/route: static, revalidated on a timer, revalidated on demand
   by tag, or dynamic per request. Don't leave it to defaults you haven't checked.

## Segment files

| File | Purpose |
| --- | --- |
| `layout.tsx` | Shared shell; persists across navigation; don't fetch per-page data here |
| `page.tsx` | The route's UI |
| `loading.tsx` | Suspense fallback for the segment |
| `error.tsx` | Client error boundary (`'use client'`, receives `error`, `reset`) |
| `not-found.tsx` | Rendered by `notFound()` |
| `route.ts` | Route handler (GET/POST…) — no `page.tsx` in the same segment |
| `(group)/` | Organise without affecting the URL |
| `[id]/`, `[...slug]/` | Dynamic segments |
| `_private/` | Colocated non-route files |

## Pages and params

```tsx
interface InvoicePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: InvoicePageProps): Promise<Metadata> {
  const { id } = await params;
  const invoice = await invoiceService.findForMetadata(id);
  return { title: invoice?.number ?? 'Invoice' };
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params;
  const invoice = await invoiceService.get(id);
  if (!invoice) notFound();
  return <InvoiceDetail invoice={invoice} />;
}
```

- Validate dynamic params and `searchParams` like any external input.
- Fetch in parallel (`Promise.all`) or stream slow parts behind `<Suspense>`; avoid request waterfalls
  across nested layouts.
- Deduplicate a fetch shared by `generateMetadata` and the page with React `cache()`.
- `generateStaticParams` for known, finite param sets.

## Route handlers

Use for webhooks, third-party callbacks, file downloads and non-React clients. For mutations from your own
UI, prefer a server action (see `nextjs-server-action`). Route handlers need the same validation, auth and
tenant scoping; return proper status codes and a typed JSON body.

## Caching and revalidation

| Data | Choice |
| --- | --- |
| Same for everyone, rarely changes | Static / long revalidate |
| Changes on writes you control | Tag the fetch, `revalidateTag` in the action |
| Per user or per request (cookies, headers) | Dynamic; never cache under a shared key |
| Changes on a schedule | Time-based revalidate |

Never cache user- or tenant-specific data under a key that omits the user or tenant.

## Client boundary pitfalls

- Hydration mismatch: no `Date.now()`, random values, `window` or locale-dependent formatting during render
  in code that renders on both sides; move it to an effect or render on the server only.
- A client component can render server components only when they are passed as `children`/props.
- Context providers are client components; wrap them in one `providers.tsx` used by the root layout.

## Navigation

`<Link>` for internal navigation; `useRouter` only for imperative navigation after an event; `redirect()` in
server code. Read URL state with `useSearchParams` inside a `<Suspense>` boundary.

## Client-fetching apps behind a client auth guard

Common when data comes from a client SDK (e.g. AppSync/GraphQL) that needs the signed-in user's token. The
server-fetching advice above then doesn't apply; instead:

- **Pages stay thin**: read params, render one view component (`<InvoicesView />`). No fetching, no state.
- **The auth/tenant guard lives in a layout** (a client component that redirects when signed out or when the
  user has no access to the tenant), so every page under it is protected once.
- **Locale segment**: with next-intl, routes sit under `[locale]/`; import `Link`, `useRouter`, `usePathname`
  and `redirect` from the project's next-intl navigation wrappers, not `next/navigation`, so links keep the
  locale.
- **Paths come from a helper object** (`paths.invoices.detail(id)`), never string literals in components.
- **Multi-tenant apps put the tenant in the URL** (`[locale]/app/[tenantId]/…`). The URL is the source of
  truth; a provider validates it and exposes the current tenant, and components read it from there.
