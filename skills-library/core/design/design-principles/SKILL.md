---
name: design-principles
description: Applies SOLID and OOP principles as checks: cohesion, composition over inheritance, YAGNI, functional core. Use when designing classes or modules, "SOLID", "too coupled", "over-engineered", class vs function.
---

# Design principles

Apply each principle as a **test on the code in front of you**, not as a reason to add structure.
The overriding rule: the simplest design that keeps the code easy to change. Add an abstraction only
for a problem that already exists.

## SOLID as diff checks

| Principle | Check | Common misapplication |
|---|---|---|
| Single responsibility | Can you name one reason this unit changes? Storage + rules + presentation in one place → split | One-function-per-file, dozens of anaemic classes |
| Open/closed | Does adding a variant mean editing the same `switch` in several places? → one lookup or strategy at that seam | Plugin points for variants nobody asked for |
| Liskov substitution | Would every implementation pass the same contract test? `instanceof` checks and "not supported" throws fail it | Inheritance used for code reuse |
| Interface segregation | Does the consumer use under half of the type it receives? → `Pick<>` or a role interface | One-method interfaces for everything |
| Dependency inversion | Does business code import `@aws-sdk`, axios, an ORM or a UI kit? → depend on a port it owns | An interface for every class (see `dependency-injection` rule 8) |

## Encapsulation

- **Invariants at the boundary**: parse, don't validate — a constructor or `parseX(input)` returns a
  valid value or a `Result` error, so invalid states can't exist further in.
- **Immutable by default**: `readonly` fields and arrays; return new values instead of mutating;
  return copies of internal collections.
- **Tell, don't ask** where behaviour guards data — but plain data objects and getters are fine.
- **Law of Demeter**: `a.b().c().d()` reaching into collaborators' internals is coupling. Fluent
  builders and DTOs are exempt.
- Module privacy: unexported = encapsulated; expose a module through `index.ts`.

## Cohesion and coupling

- Code that changes together lives together: organise by feature, not by technical type.
- Smells: shotgun surgery (one change touches many files), feature envy (a method mostly uses
  another module's data), a `utils` grab-bag, cyclic imports.
- Couple through types and values at boundaries, not shared mutable objects.

## Composition over inheritance

Inheritance is fine only when all hold: a real is-a relationship, one level deep, the base designed
for extension, and Liskov holds (typed error hierarchies, framework base classes). Smells: extending
to reuse code, `protected` mutable state, overriding to disable behaviour, depth ≥ 2. Replace with
composition: inject the collaborator or pass the varying step as a function.

## Simplicity

- **YAGNI**: no hooks, options or layers for imagined needs; it never excuses skipping tests.
- **Rule of three**: tolerate duplication twice; abstract on the third, real occurrence.
- **Duplication is cheaper than the wrong abstraction**: a shared helper growing boolean/mode
  parameters and `if (caller === …)` branches → inline it back into callers, delete dead branches,
  re-extract what is truly common.
- **Functional core, imperative shell**: decisions in pure functions over values; a thin shell
  fetches, calls the core, performs effects. The core is tested without doubles.

## OOP mapped to TypeScript

| Need | Use |
|---|---|
| Data | `type`/`interface` + plain objects, not classes with getters |
| Closed set of variants | Discriminated union + exhaustive `switch` with a `never` check |
| Open set (others add implementations) | Interface + implementations |
| Behaviour without state | Module functions |
| Stateful service with dependencies | Class with `private readonly` constructor params, or a factory closure — match the codebase |
| Expected failures | Result / outcome union (`design-patterns` → result-type) |

## Where to look

- Wiring, lifetimes, testability → `dependency-injection`
- Choosing a pattern for a concrete symptom → `design-patterns`
- TypeScript specifics (unions, `satisfies`, exhaustive checks, type safety) → `typescript`
- An independent read of a diff → the `design-reviewer` agent
