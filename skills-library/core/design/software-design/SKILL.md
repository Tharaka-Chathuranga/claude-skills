---
name: software-design
description: Applies design principles (SOLID, composition, dependency injection, pure core) and picks the right design pattern from a symptom-to-pattern table, while guarding against over-engineering. Use when asked "which pattern", "refactor this", "this is too coupled", "SOLID", "design pattern", "OOP", "how should I structure this", or before introducing a new abstraction, class hierarchy or layer.
---

# Software design

## The overriding rule

**Use the simplest design that works. Introduce a pattern only when the problem it solves is already
present in the code** — not because it might appear later. A function beats a class, a class beats a
hierarchy, a direct call beats an indirection. Every abstraction must pay for itself today with a
second implementation, a test seam that is actually used, or a removed duplication.

Before adding a pattern, name the concrete pain it removes. No pain, no pattern.

## Principles that matter day to day

**SOLID — one line each, with the test to apply:**

| Principle | Means | Practical test |
|---|---|---|
| Single responsibility | One reason to change | Describe the unit in one sentence without "and" |
| Open/closed | Add behaviour by adding code, not editing a switch | Does a new variant force edits in several existing files? |
| Liskov substitution | Subtypes honour the parent's contract | Would any caller need `instanceof` or break on the subtype? |
| Interface segregation | Clients depend only on what they use | Does a fake for tests have to stub methods the unit never calls? |
| Dependency inversion | Policy depends on abstractions; details plug in | Can the unit be tested without a network, disk or clock? |

**Composition over inheritance.** Inherit only for a true is-a relationship with a stable contract. To
reuse behaviour, inject a collaborator or call a function. Hierarchies deeper than two levels are a smell.

**Dependency injection + composition root.** Units receive collaborators through the constructor (or
function parameters), typed by interface. `new` of services, clients, config reads, `Date.now()` and
randomness happen in one place at the entry point (handler, `main`, app bootstrap, DI container
setup). Everything below receives the graph.

**Small interfaces.** Define the interface at the consumer, sized to what the consumer calls
(`UserReader { getById(id) }`, not a 20-method `UserService`). Large classes can implement several.

**Law of Demeter.** Talk to direct collaborators only. `order.customer.address.city` in business logic
means a missing method (`order.shippingCity()`) or a missing parameter.

**Pure core, thin shell.** Decisions, calculations, validation and mapping are pure functions with no
I/O, no ambient time, no globals. The shell fetches, calls the core, then writes. The core is where
tests and reuse live; the shell stays too thin to need much testing.

**Duplication: wait for the third time.** Duplicated *knowledge* (a rule, a key format) — centralise
now. Duplicated *code shape* — extract on the third occurrence. A shared helper that keeps gaining
flags is the wrong abstraction; inline it back.

## Symptom → pattern lookup

Find the symptom you can actually point at in the code. If none matches, you probably need no pattern.

| Symptom present in the code | Pattern | Reference |
|---|---|---|
| Growing `switch`/`if` chain on a type or mode, repeated in several places | Strategy (or a lookup map of functions) | [behavioral](reference/behavioral.md) |
| Wrapping a third-party SDK, HTTP API or LLM client so its types leak everywhere | Adapter (behind a port) | [structural](reference/structural.md) |
| Handler or service constructs its own clients, reads env, calls `new Date()` | Composition root + DI | [architectural](reference/architectural.md) |
| Queries and persistence calls scattered across services | Repository | [architectural](reference/architectural.md) |
| Business rules mixed into controllers/handlers/components | Service layer + pure core | [architectural](reference/architectural.md) |
| Object built in many steps, many optional parts, invalid intermediate states | Builder | [creational](reference/creational.md) |
| Choosing an implementation at runtime from config or input | Factory (function) | [creational](reference/creational.md) |
| Same logging/retry/caching/metrics code around many calls | Decorator | [structural](reference/structural.md) |
| Callers do a five-call dance against a complex subsystem for one simple job | Facade | [structural](reference/structural.md) |
| One module must react to another's events without importing it | Observer / pub-sub | [behavioral](reference/behavioral.md) |
| Actions must be queued, retried, logged, or undone | Command | [behavioral](reference/behavioral.md) |
| A sequence of validators/handlers, each may stop or pass on | Chain of responsibility (pipeline) | [behavioral](reference/behavioral.md) |
| Same algorithm skeleton, a few varying steps | Template method → prefer passing step functions | [behavioral](reference/behavioral.md) |
| Behaviour depends on an explicit lifecycle (draft → submitted → closed) | State machine / discriminated union | [behavioral](reference/behavioral.md) |
| Multi-step write that must succeed or fail as a whole | Unit of work / transaction | [architectural](reference/architectural.md) |
| Reads and writes have very different shapes or load | CQRS-lite (separate read models) | [architectural](reference/architectural.md) |
| Domain code imports framework, DB or SDK types | Ports & adapters (hexagonal) | [architectural](reference/architectural.md) |
| Class violates a SOLID test above | Split by responsibility / interface | [solid](reference/solid.md) |
| Interfaces with one implementation and no test fake, layers that only forward | Remove the abstraction | [anti-patterns](reference/anti-patterns.md) |

## Workflow when designing or refactoring

1. State the change in one sentence and list the units it touches.
2. Identify the concrete symptom (table above). If none, write the direct code.
3. Pick the smallest pattern that removes it; check its "when not to" section.
4. Keep behaviour changes and structural refactors in separate commits.
5. Re-read the result: could a newcomer follow the call path from entry point to effect in one pass?

## Where to look

- **Checking or explaining a SOLID violation** → read [reference/solid.md](reference/solid.md)
- **Object creation is messy (factory, builder, singleton questions)** → read [reference/creational.md](reference/creational.md)
- **Wrapping, decorating or simplifying another component** → read [reference/structural.md](reference/structural.md)
- **Varying behaviour, events, pipelines, commands, state** → read [reference/behavioral.md](reference/behavioral.md)
- **Layering, repositories, DI wiring, hexagonal, transactions, CQRS** → read [reference/architectural.md](reference/architectural.md)
- **Suspect the design is too heavy, or reviewing someone's abstractions** → read [reference/anti-patterns.md](reference/anti-patterns.md)
- **Language-specific idioms** → the `typescript-idioms` or `dart-idioms` skill, when installed
