---
name: architecture-boundaries
description: Decides where new code goes and what it may import — layers with one-way dependencies, feature boundaries, public entry files, shared vs feature code, and migrating legacy structure incrementally. Use before creating a folder, feature, module or package, when asking "where should this live", when one feature needs code from another, or when asked about "project structure", "layering" or "separation of concerns".
---

# Architecture boundaries

The project's own layer map is in CLAUDE.md or in `quality.config.json` → `layers` (ordered top
to bottom). Stack modules add concrete folder maps. This skill holds the rules that apply to any
map. Fixing a reported violation: `fix-import-boundary`.

## The dependency rule

1. **Imports flow one way: down.** A layer may import from layers below it, never above. Shared
   code never imports feature code; domain logic never imports frameworks, transport or storage.
2. **Features don't reach into each other.** A feature imports another only through that
   feature's public entry file (`index.*`), and only for a real public API (a view to embed, a
   type, a use-case function). Needing its internals means the code is shared: move it down.
3. **No cycles**, between files or between folders. A cycle means two units are one unit or a
   third unit is missing.
4. **Dependencies point at stable things.** Volatile details (frameworks, vendors, I/O) depend
   on the core's interfaces, not the reverse. Patterns for inverting a dependency:
   `dependency-injection` and `design-principles`.

## A typical map (adapt to the project's)

```
entry/       routes, handlers, CLI commands, jobs: parse input → call one use case → map output
features/    one folder per user-facing capability: UI, use cases, feature-local helpers
domain/      pure business rules and types shared by features
shared/      feature-agnostic infrastructure: UI kit, utilities, clients, adapters
```

Backend units inside a feature usually split as: entry adapter → service (decides, depends on
interfaces) → repository/adapter (talks to storage or external APIs) + pure helpers.

## Where does this go?

| You are adding | Put it in |
| --- | --- |
| Code used by one unit | Beside that unit, private to its folder |
| Code used by one feature | That feature's folder |
| Code used by a second feature | Move down to shared/domain **on the second use**, not before |
| A pure business rule used on more than one side (client and server, two services) | The shared domain package |
| Storage or external API access | A repository/adapter behind an interface, in the lowest layer that needs it |
| A new entry point | The entry layer; keep it thin and delegate |
| A decision that shapes structure | An ADR, if the project keeps them |

Before creating a helper or folder, search for an existing one; the cheapest boundary is the
one already there.

## Feature boundaries

A feature is something a user would name. Split one when it has two independent entry points
or changes for two unrelated reasons. Merge two when they import each other's internals in both
directions. Overlapping folders for one concept are a merge candidate, not a pattern to copy.

## Public surface

- One public entry file per feature or package boundary. Export only what other features use.
- Inside a folder, import siblings directly; don't add nested barrels to shorten paths (they
  cause cycles and slow builds and tests).
- Use the project's path aliases for anything outside the current folder; no long `../../../`.

## Migrating legacy structure

Don't rewrite for its own sake. **Leave each file you touch closer to the standard.**

- New code follows the target structure fully.
- A file you change substantially gets the change and the move toward the standard, in separate
  commits.
- A large restructure (merging features, moving a layer, splitting a central file) is its own
  PR, proposed to the user first.
- Lock progress in with the boundary check so moved code can't drift back.

## Verify

Run `npm run quality`; its `boundaries` step (or the project's dependency-cruiser /
eslint-plugin-boundaries step) enforces `layers`. If the project has no boundary check, read
every import you added against the layer map yourself.
