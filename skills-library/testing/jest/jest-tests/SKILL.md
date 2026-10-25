---
name: jest-tests
description: Writes behaviour-first Jest unit and component tests — React Testing Library queries by role, user-event, mocking only at boundaries, a failing regression test before a bug fix, and running the changed tests first. Use when asked to "write tests", "add coverage", "test this", "add a regression test", when a bug fix needs a test, or when creating a .test.ts/.test.tsx file.
---

# Jest tests

## Rules

1. **Bug fix → failing test first.** Write a test that reproduces the bug, watch it fail for the right reason,
   then fix. A regression test that passes before the fix tests the wrong thing.
2. **Test behaviour through the public contract**: inputs → outputs, rendered UI → user actions → visible
   result. Never assert on private functions, internal state or implementation calls.
3. **Mock at boundaries only**: network, database/SDK clients, time, randomness, browser APIs. Don't mock the
   module under test or its pure collaborators. Prefer passing a fake dependency over `jest.mock` when the code
   accepts injected dependencies.
4. **Run only the changed tests first** (`<test command> -- path/to/file.test.ts`, or `--findRelatedTests` on
   changed files), then the wider suite / quality gate before reporting done.
5. **Report what you observed.** Never claim a green run you didn't see; say if anything is skipped or flaky.

## Where tests go

Follow the neighbouring files: colocated `<subject>.test.ts` or `__tests__/<subject>.test.ts`. Use the
project's path aliases (they are mapped in the Jest config); add a mapping there rather than writing deep
relative imports. ESM-only dependencies that fail to parse need adding to `transformIgnorePatterns`.

## Shape

```ts
describe('calculateLateFee', () => {
  it('charges nothing within the grace period', () => {
    expect(calculateLateFee({ daysLate: 3, amount: 100 })).toBe(0);
  });

  it('caps the fee at the configured maximum', () => {
    expect(calculateLateFee({ daysLate: 400, amount: 100 })).toBe(MAX_LATE_FEE);
  });
});
```

- `describe` names the unit; `it` states a fact about its behaviour — not "should work" or "test 2".
- One behaviour per `it`; several `expect`s are fine for the same behaviour at different inputs.
- Cover edges: empty, zero, negative, null/undefined, boundaries, duplicates, error paths.
- Arrange data with small factory helpers (`buildInvoice({ status: 'paid' })`) instead of large literals.
- No logic snapshots; snapshot only small, stable serialised output when the exact shape is the contract.
- Data access code: include a test that one tenant/owner cannot read another's records.

## Components (React Testing Library)

```tsx
it('submits the entered email', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<InviteForm onSubmit={onSubmit} />);

  await user.type(screen.getByRole('textbox', { name: /email/i }), 'a@b.co');
  await user.click(screen.getByRole('button', { name: /send invite/i }));

  expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.co' });
});
```

- Query priority: `getByRole` (with `name`) → `getByLabelText` → `getByText`. `getByTestId` only when nothing
  accessible exists.
- `userEvent` (with `setup()`), not `fireEvent`, for user interactions.
- `findBy*` / `waitFor` for async UI; `queryBy*` only to assert absence. Never wrap in `act` manually unless a
  warning proves it's needed.
- Render through a shared `renderWithProviders` helper (theme, i18n, router, data-library client — a fresh
  query client per test with retries off).
- Mock HTTP at the network layer (e.g. MSW) or mock the project's service module — not `fetch` internals.
- Hooks: `renderHook` from Testing Library, with the same provider wrapper.

## Mocks and time

- `jest.useFakeTimers()` for debounce/intervals; advance with `jest.advanceTimersByTime`; restore after.
- Reset mocks between tests (`clearMocks`/`restoreMocks` in config or `afterEach`).
- Type mocks: `jest.mocked(fn)`, not `as any` (see `type-safety`).
- AWS SDK v3 clients: `aws-sdk-client-mock` if the project uses it. Never hit real cloud services or networks.

## Coverage

Coverage finds untested branches; it isn't a target. A test written to raise the number without a meaningful
assertion is worse than none.
