---
name: e2e-tests
description: Writes Playwright end-to-end tests for real user journeys with role-based locators, web-first assertions instead of fixed sleeps, isolated test data via fixtures, reused auth state and a fast suite. Use when asked to "write an e2e test", "add a Playwright test", "test this flow end to end", "this e2e test is flaky", or when editing *.spec.ts files under the e2e folder.
---

# Playwright e2e tests

Read `playwright.config.*` first for `baseURL`, projects, test directory and `webServer`.

## Rules

1. **Test user journeys, not units.** One test = one goal a user has (sign up, create and send an invoice,
   change a setting). Logic edge cases belong in unit tests (`jest-tests`), not here.
2. **Locate by role and accessible name**: `getByRole('button', { name: 'Save' })`, then `getByLabel`,
   `getByText`. `getByTestId` only when nothing accessible exists. Never CSS/XPath chains.
3. **No fixed sleeps.** No `waitForTimeout`. Use web-first assertions (`await expect(locator).toBeVisible()`),
   which retry; wait for a specific response or URL when needed.
4. **Every test is independent**: it creates its own data, runs in any order and in parallel, and never relies
   on another test's leftovers. Use unique values per test (e.g. suffix with `testInfo.workerIndex` + time).
5. **Log in once, reuse the state.** A setup project authenticates and saves `storageState`; tests start
   already signed in. Only the login test itself goes through the login UI.
6. **Keep it fast**: create preconditions through the API/fixtures, not by clicking through the UI; use the UI
   only for the behaviour under test.

## Template

```ts
import { test, expect } from './fixtures';

test('owner sends an invoice to a customer', async ({ page, customer }) => {
  await page.goto('/invoices/new');

  await page.getByRole('combobox', { name: 'Customer' }).fill(customer.name);
  await page.getByRole('option', { name: customer.name }).click();
  await page.getByRole('button', { name: 'Send invoice' }).click();

  await expect(page.getByRole('status')).toHaveText(/invoice sent/i);
  await expect(page).toHaveURL(/\/invoices\/[\w-]+$/);
});
```

## Fixtures

```ts
export const test = base.extend<{ customer: Customer }>({
  customer: async ({ request }, use) => {
    const customer = await createCustomer(request, { name: `Customer ${crypto.randomUUID()}` });
    await use(customer);
    await deleteCustomer(request, customer.id);
  },
});
```

- Fixtures own setup and teardown of test data via the API; tests read like the journey.
- Page objects only for screens used by many tests, and they expose user actions (`sendInvoice()`), not
  locators for every element.
- Multi-tenant apps: a fixture per tenant/role, and at least one test that a user can't see another tenant's data.

## Flakiness

- Fix the cause: missing await, assertion on a stale value, shared data, animation, or a race with a network
  call. Retries in CI are a safety net, not a fix.
- Mock third-party services (payments, email, maps) with `page.route`; never call real external services.
- Use the trace viewer (`--trace on`) to debug a failure before changing code.

## Running

Run the single spec first (`npx playwright test path/to/file.spec.ts --project=<one>`), then the suite. Report
real results, including retries and skips.
