---
name: storybook-stories
description: Writes Storybook stories in CSF with one story per meaningful component state, args and controls, decorators for providers, play-function interaction tests and no real data fetching. Use when asked to "add a story", "add stories for this component", "test this interaction in Storybook", or when creating a .stories.tsx file.
---

# Storybook stories

Check `.storybook/main.*` for the framework package (e.g. `@storybook/react-vite`, `@storybook/nextjs`) and
import `Meta`/`StoryObj` from it. Check the installed version for where test utilities come from
(`storybook/test` or `@storybook/test`).

## Rules

1. **One story per meaningful state**: default, loading, empty, error, long content, disabled, each variant
   that looks or behaves differently. Not one story per prop.
2. **Stories never fetch real data.** Pass data via `args` to a presentational component; mock the network
   (e.g. MSW addon handlers) or inject fake services when a container must be shown. Stories must run offline
   and deterministically.
3. **Providers come from decorators**, set globally in `.storybook/preview.*` (theme, i18n, router) or per
   story when the state differs. Don't wrap the component manually inside `render`.
4. **Interactions are tested with play functions**, querying by role and name.
5. **Callbacks are spies** (`fn()`) in `args`, so the actions panel shows them and play functions can assert.

## Template

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { InviteForm } from './invite-form';

const meta = {
  title: 'Components/InviteForm',
  component: InviteForm,
  tags: ['autodocs'],
  args: { onSubmit: fn(), isSubmitting: false },
} satisfies Meta<typeof InviteForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = { args: { isSubmitting: true } };

export const SubmitsEmail: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: /email/i }), 'a@b.co');
    await userEvent.click(canvas.getByRole('button', { name: /send invite/i }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ email: 'a@b.co' });
  },
};
```

- `title` follows the existing hierarchy in the project; omit it if the project relies on auto-titles.
- Story file location follows neighbouring components (next to the component or in `stories/`).
- `argTypes` only to improve controls (select options, hiding non-serialisable props); infer the rest.
- Use `findBy*` in play functions for async UI; never use fixed waits.
- Freeze time, randomness and animations in stories that render them, so visual tests don't flake.
- Story data comes from shared factories/fixtures, not giant inline objects.
- Strings shown in stories go through the project's i18n decorator, not hardcoded duplicates.

## Running

Run play functions headless with the project's Storybook test runner or the Vitest addon if configured, and
report the result. Build Storybook if the project's CI does.
