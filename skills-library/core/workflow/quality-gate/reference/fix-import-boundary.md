# Fix an import boundary violation

The layer map is `quality.config.json` → `layers.order` (top to bottom) or the boundary tool's
config; CLAUDE.md may describe it in words. Rules: `code-quality` (reference/architecture-boundaries.md).

**Never fix a violation by** loosening the boundary config, adding a disable comment, copying the
whole module, or re-exporting the internal through a barrel just to satisfy the checker.

## 1. Classify

Read the message: which file imports what, from which layer to which.

| Violation | Example | Usual fix |
| --- | --- | --- |
| Upward import | shared util imports from a feature | A or B |
| Feature → another feature's internals | `features/a` imports `features/b/internal/x` | C, else A |
| Cycle | `a → b → a` | B or D |
| Domain imports infrastructure | business rule imports a DB client or framework | B |

## 2. Pick the fix

Ask what the imported thing **is**, then choose the first option that fits.

**A. Move it down.** The imported code is generic or used by more than one feature (a type, a
pure helper, a UI primitive). Move it to the lowest layer that all importers can reach (shared or
domain). Update all importers. Leave nothing behind but the moved code's new home; no
re-export shims unless the move is staged across PRs.

**B. Invert the dependency.** Lower-level code needs behaviour that lives higher up. Define an
interface (or callback/prop type) in the lower layer, have the higher layer implement it and pass
it in at the composition root (entry point, provider, factory). The lower layer now depends only
on its own interface. Patterns: `design-patterns` (adapter, ports-and-adapters).

**C. Use the public API.** The other feature does own this and it is a legitimate public
capability. Export it from that feature's entry file (`index.*`) and import from there. Only for
things that are truly that feature's API (a view to embed, a use case, a type), not for helpers.

**D. Merge or split.** Two units that import each other are one unit, or a third unit is
missing. Extract the shared part into a new unit both depend on, or merge them if they always
change together.

## 3. Apply

```
- [ ] Move or extract with no behaviour change (cut and paste; rename later)
- [ ] Update every importer: grep -rn "<old path>" <source roots>
- [ ] No new cycle introduced; the moved code imports only same or lower layers
- [ ] Run related tests
- [ ] npm run quality → boundaries step passes, ratchet unchanged
```

If the moved code carries forbidden patterns, the ratchet flags the new file; fix them or
record the move (see the ratchet reference of `quality-gate`).

## 4. Legacy violations

If the gate flags a violation that already existed in a file you touched, fix it when it is a
small move. If it needs a structural change (merging features, moving a large module), finish
the task without making it worse, report the violation, and propose the restructure as its own
PR.
