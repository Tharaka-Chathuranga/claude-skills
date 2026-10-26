---
name: add-i18n-strings
description: Adds user-facing text with next-intl, keeping locale messages files in key parity with ICU plurals and RTL. Use when UI shows text, "add a label/button/error message", "translate this", or a string is hardcoded.
---

# Add i18n strings (next-intl)

## Rules

1. **Every user-facing string goes through next-intl** — JSX text, toasts, error messages, `aria-label`,
   `title`, `alt`, placeholders, email/notification copy. No literal text.
2. **Every locale file holds the identical key set.** Read the locale list from the project's next-intl
   config (the routing/request config or a `locales` constant) — never assume it. A missing key renders the
   raw key at runtime.
3. **The default locale's file is the source of truth.** Add the key there first, then to every other locale.
4. **Can't translate well? Still add the key** in every locale with the default-locale text as a placeholder,
   and tell the user which keys need real translation.
5. **Never concatenate strings or add plural suffixes in code.** Use ICU `plural`/`select` — many languages
   have more plural categories and different word order.

## Procedure

1. Find the messages directory and locale list from the next-intl config.
2. Add the key to the default locale in the right namespace.
3. Add the same key, same nesting, to every other locale file.
4. Use it via `useTranslations` (client/shared) or `getTranslations` (async server components, metadata,
   server actions).
5. Run the project's parity check if it has one; otherwise compare key sets (e.g. a short script over the
   JSON files). Then type-check and lint.
6. Report keys added and which still carry placeholder text.

## Key naming

- Namespace per feature or page (`InvoicesPage.emptyState`); match the casing of neighbouring namespaces.
- Name by meaning, not appearance: `deleteConfirmation`, not `redButtonText`.
- Reuse a key only when the meaning is identical. Words that coincide in one language ("Open" verb vs "Open"
  status) get separate keys.
- Naming conventions beyond this follow `code-quality` (reference/naming.md).

## Usage

```tsx
const t = useTranslations('InvoicesPage');
t('title');
t('dueIn', { days });
t.rich('terms', { link: (chunks) => <Link href="/terms">{chunks}</Link> });
```

```json
{
  "InvoicesPage": {
    "title": "Invoices",
    "dueIn": "{days, plural, =0 {Due today} one {Due in # day} other {Due in # days}}",
    "status": "{status, select, paid {Paid} overdue {Overdue} other {Open}}",
    "terms": "I accept the <link>terms</link>"
  }
}
```

- Dates, numbers and currency: `useFormatter()` (`format.dateTime`, `format.number`), never hand-formatted.
- Use `t.rich` for markup inside a message; don't split one sentence across several keys.
- Keep the message as a full sentence so translators get context; no leading/trailing spaces for layout.
- If the project types messages (global `Messages` type from the default locale), a missing or misspelt key is
  a type error — keep that setup working.

## RTL locales

Check which locales are RTL in the project config (Arabic, Hebrew, Persian, Urdu are common). When adding UI:

- Plain CSS: logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`,
  `text-align: start`), not left/right.
- MUI: there are no `ms`/`me`/`ps`/`pe` shorthands (they silently do nothing). With the standard RTL setup
  (`stylis-plugin-rtl`), physical props (`ml`, `pr`, `left`) are mirrored automatically, so use them as usual;
  otherwise use full logical keys (`marginInlineStart`). Don't mix the two.
- `flex-start`/`flex-end`, not `left`/`right`.
- Mirror directional icons (arrows, chevrons, back buttons); don't mirror logos or media controls.
- Set `dir` on `<html>` from the active locale.
