---
name: mui-components
description: Builds UI with Material UI (@mui/material): theme tokens, sx vs styled, responsive props, accessible form controls. Use when asked to "style this", "make it responsive", "match the theme", or colours are hardcoded.
---

# MUI components

Component structure follows `react-component`. Check the installed `@mui/material` major version before using
version-specific APIs.

## Rules

1. **Theme tokens, never raw values.** Colours from the palette (`'primary.main'`, `'text.secondary'`,
   `'divider'`), spacing from the spacing scale (`p: 2`, `gap: 1.5`), typography from variants
   (`variant="body2"`), radius from `theme.shape`, breakpoints from `theme.breakpoints`. A hex code, `px`
   margin or font size in a component is a bug unless it is truly one-off and commented.
2. **Missing token → add it to the theme**, don't hardcode. Extend palette/typography in the theme file and
   augment the theme types so the new token is typed.
3. **Use the MUI component that exists** (`Stack`, `Grid`, `Typography`, `Dialog`, `Autocomplete`…) before
   writing a styled `div`.
4. **Styling choice**:
   - `sx` for one-off styles on one element.
   - `styled()` for a styled element reused in several places, or styles that depend on props in complex ways.
   - Theme `components` overrides/variants for a change every instance of a component should get.
   - Shared `sx` fragments as typed constants in `utils/` (`export const cardSurfaceSx: SxProps<Theme> = …`)
     when two components repeat the same styles. Never copy-paste a style block.
5. **Accessible by default**: icon-only buttons get `aria-label`; inputs get a visible `label`; dialogs get
   `aria-labelledby`; never convey state by colour alone; keep the focus ring.
6. **No hardcoded user-facing strings** in labels, helper text, `aria-label` or placeholders when the project
   has i18n.

## Styling examples

```tsx
<Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, md: 2 }} sx={{ p: 2, bgcolor: 'background.paper' }}>
  <Typography variant="subtitle1" color="text.secondary">{title}</Typography>
</Stack>
```

- Responsive values use the object form (`{ xs, sm, md }`); avoid `useMediaQuery` for pure layout changes.
- Use theme callbacks for computed values: `sx={{ width: (theme) => theme.spacing(30) }}`.
- RTL: MUI has no `ms`/`me`/`ps`/`pe` shorthands (`sx={{ ms: 2 }}` silently does nothing). With the standard
  RTL setup (`stylis-plugin-rtl` in the emotion cache), physical props (`ml`, `pr`, `left`…) are mirrored
  automatically, so use them normally. The only logical keys MUI understands are full CSS properties
  (`marginInlineStart`, `paddingInlineEnd`); don't mix both styles in one project.
- Conditional styles: spread fragments (`sx={[baseSx, isActive && activeSx]}`), not nested ternaries.
- Follow the project's import style (path imports like `@mui/material/Button` vs named imports); be consistent
  with neighbouring files.

## Forms

- `TextField` with `label`, `helperText` for errors, `error` boolean, correct `type` and `autoComplete`.
- Integrate with the project's form library through its controller/adapter; don't mirror field values in
  local state.
- `Select`/`Autocomplete`: stable option IDs, `getOptionLabel`, `isOptionEqualToValue` for object options.
- Disable the submit button while submitting and show progress; never disable it to hide validation errors.

## Layout and feedback

- `Stack` for one-dimensional layout, `Grid` for two-dimensional.
- Loading: `Skeleton` matching final layout over spinners for content areas.
- Toasts/snackbars and dialogs use the project's shared wrapper if one exists.

## Old patterns

Recognise these in existing code; don't write them in new code:

- `Grid` with `item` and `xs={6}` props (v5 / legacy `Grid`) → current `Grid` uses `size={{ xs: 6 }}` and no
  `item` prop. In v6 the new API is `Grid2`; in v7 it is `Grid` and the legacy one is `GridLegacy`.
- `makeStyles` / `withStyles` (`@mui/styles`, JSS) → `sx` or `styled()`.
- `theme.spacing` strings concatenated by hand → numeric spacing props.
