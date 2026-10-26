# Split an oversized file

The cap is `maxFileLines` in `quality.config.json`, counted as non-blank, non-comment lines. The
ratchet fails a new file over it and any growth of a file already over it.

A split is a **refactor**: behaviour, public exports and tests stay exactly the same. Split
first, in its own commit (or PR for large files), then make the behaviour change.

## 1. Before moving anything

```
- [ ] List responsibilities, one line each (each line is a candidate unit)
- [ ] Find covering tests; add a characterisation test if the moved logic has none
- [ ] List importers: grep -rn "<module path or name>" <source roots>
- [ ] Record the current line count
```

A responsibility you can't describe without "and" is two units. A characterisation test pins
what the code does now, not what it should do.

## 2. Where each piece goes

| File kind | Extract | Into |
| --- | --- | --- |
| UI component | A visually distinct block | A private child component in the component's folder |
| UI component | State plus the effects and callbacks touching only that state | A hook / view-model / controller next to it |
| UI component | Derived values, formatting, option lists, style fragments | Pure helpers or a constants file |
| Entry point (handler, controller, route) | Business steps | A service; the entry point only parses, calls, maps |
| Service | Storage or external API calls | A repository/adapter behind an interface |
| Service | Independent steps of a long workflow | One unit per step, composed by the service |
| Any module | Pure transformations and validation | Helper files, one cohesive group each |
| Types-heavy module | Shared types | A `types` file in the same folder |
| Static data table / registry | The data | A data file (JSON/YAML) plus a typed loader, or one module per domain |
| Central schema / config file | Definitions for one domain | One fragment per domain, combined in the original file |
| Test file | Fixtures, builders, fakes | A test-support file beside the test |

Stack modules may add their own rows; prefer them when installed.

The split is right when each new file can be described in one sentence and the original no
longer mentions the state, helpers or types it gave away.

## 3. Rules while splitting

- **Move, don't rewrite.** Cut and paste as is. Renames and cleanup go in a later commit so the
  diff reviews as a move.
- **One direction of imports.** The original imports its new children; children never import
  the original. Shared types go to a separate `types` file to avoid cycles.
- **Keep the public surface.** Everything importers used is still exported from the same path
  (the original file or the folder's entry file). Don't make new internals public.
- **Name files after their main export**, following `code-quality` (reference/naming.md).
- **Don't compress to fit.** Deleting comments, joining lines or shortening names is not a split.
- **Debt moves with the code.** A forbidden pattern moved into a new file shows as a ratchet
  regression for that file. Fix it while there, or record the move (see the ratchet reference of `quality-gate`).
- **Respect boundaries.** Extracted code stays in the same layer unless it is genuinely shared;
  then move it down per `code-quality` (reference/architecture-boundaries.md).

## 4. Central files touched by everyone

Splitting a file that most PRs edit (a root schema, a route table, a service registry) is
cross-cutting:

- Propose the split (which fragments, which files) to the user before starting.
- Split by domain into fragments combined in the original file, so importers don't change.
- Run the stack's build/synth/validate step, not just tests.
- Land it in a small PR on its own and tell the team; open branches will conflict.

## 5. Verify

Run the tests related to every file you created or changed, then `npm run quality`. Tests that
passed before must pass unchanged. Report the original file's line count before and after and
each new file's size.
