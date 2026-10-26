---
name: nextjs-server-action
description: Writes Next.js server actions with schema-validated input, auth and permission checks inside the action, a typed discriminated result, revalidatePath/revalidateTag, and data access delegated to a service module. Use when asked to "add a server action", "handle this form submit on the server", "add a mutation", or when creating a file with "use server".
---

# Next.js server action

Doesn't apply when the app's mutations go through a client SDK to AppSync/GraphQL (or another API) instead
of Next.js server code; follow the project's data-access skill (e.g. `amplify-client-data`) there.

A server action is a public HTTP endpoint. Treat every argument as untrusted, even if only your own form calls it.
Validation types follow `type-safety`; data access layering follows `dependency-injection`.

## Rules

1. **Validate input with a schema** (the project's validation library, e.g. zod) as the first step. Never trust
   the TypeScript type of the parameters.
2. **Authenticate and authorise inside the action**, every time. Middleware or a hidden button is not
   protection — the action can be called directly.
3. **Take the caller's identity from the session**, never from client input. Pass the user ID to the
   service; the service checks the caller may access the record.
4. **Return a typed discriminated result** for expected failures (validation, not found, forbidden, conflict);
   throw only for unexpected errors. Never return raw error messages or stack traces.
5. **Keep the action thin**: validate → auth → call a service → revalidate → return. Data access and business
   rules live in a service/repository module that doesn't import Next.js.
6. **Revalidate what changed** with `revalidateTag` (preferred when fetches are tagged) or `revalidatePath`.
   Call `redirect()` last and outside `try/catch` — it works by throwing.

## Layout

```
src/features/<feature>/
  actions/update-invoice.ts       # 'use server' — one action per file, or one file per feature
  schemas/update-invoice.ts       # input schema, shared with the client form
  services/invoice-service.ts     # data access + rules, no Next.js imports
```

Follow the project's layout in CLAUDE.md if it differs. Put `import 'server-only'` in service modules.

## Template

```ts
'use server';

import { revalidateTag } from 'next/cache';
import { getSession } from '@/lib/auth';
import { updateInvoiceSchema } from '../schemas/update-invoice';
import { invoiceService } from '../services/invoice-service';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'invalid'; fieldErrors: Record<string, string[]> }
  | { ok: false; error: 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' };

export async function updateInvoice(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = updateInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const session = await getSession();
  if (!session) return { ok: false, error: 'unauthorized' };
  if (!session.permissions.includes('invoice:write')) return { ok: false, error: 'forbidden' };

  const result = await invoiceService.update({ userId: session.userId, ...parsed.data });
  if (!result) return { ok: false, error: 'not_found' };

  revalidateTag(`invoices:${session.userId}`);
  return { ok: true, data: { id: result.id } };
}
```

Put the shared `ActionResult` type in one module, not per action.

## Calling it

- Forms: `useActionState(action, initialState)` for pending/result state; the action signature becomes
  `(prevState, formData)` — parse `Object.fromEntries(formData)` through the schema.
- Reuse the same schema on the client for instant feedback; the server check is still mandatory.
- Map `error` codes to translated messages in the UI; don't send user-facing text from the action.
- Optimistic UI with `useOptimistic`; reconcile on the returned result.

## Checklist

- [ ] Schema validation first, `unknown` input type
- [ ] Session checked; permission checked for this specific operation
- [ ] User comes from the session; the service checks the caller may access the record
- [ ] Service module holds data access; action has no direct DB/SDK calls
- [ ] Discriminated result; no leaked internals
- [ ] Correct tag/path revalidated; `redirect` outside `try/catch`
- [ ] Test the service directly, and the action's auth/validation branches (see `jest-tests`)
