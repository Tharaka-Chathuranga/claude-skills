## Contents

- Over-engineering and speculative generality
- Premature abstraction ("wait for the third time")
- Anemic abstractions (pass-through layers, single-use interfaces)
- God object
- Inheritance for reuse
- Singletons as globals
- Feature envy and train wrecks
- Boolean-flag functions
- Quick review checklist

Design problems come in two directions. Under-design couples everything; over-design buries simple
behaviour under indirection. Both cost reading time. Flag both.

## Over-engineering and speculative generality

**Symptoms:** plugin systems, config options, generic type parameters or extension points with exactly one
user; "in case we need it later" in comments or PR descriptions; abstract base classes with one subclass.

**Fix:** delete the unused flexibility; write the concrete case. Re-introduce generality when the second
real case arrives — it will be better informed.

```ts
// Over-designed
class NotificationEngine<TChannel extends Channel, TPayload> { /* registry, plugins, hooks */ }
// Enough
export const sendWelcomeEmail = (mailer: Mailer, user: User) =>
  mailer.send({ to: user.email, template: 'welcome', data: { name: user.name } });
```

## Premature abstraction ("wait for the third time")

**Symptoms:** a shared helper extracted after two similar call sites, which then grows boolean parameters
and `if (caller === ...)` branches to serve diverging needs.

**Fix:** inline it back into the callers, let them diverge, and extract again only when three callers
share stable behaviour. Duplicated *knowledge* (a business rule, key format, constant) is the exception:
centralise it immediately.

## Anemic abstractions (pass-through layers, single-use interfaces)

**Symptoms:** a `Manager` calling a `Service` calling a `Helper` with identical signatures; an interface
with one implementation and no test fake; a wrapper exposing the wrapped library method-for-method.

**Fix:** collapse the layers. Keep an interface only if a second implementation or a test fake uses it
(fakes for I/O boundaries are a valid reason). Each layer must add a decision, a translation, or a boundary.

## God object

**Symptoms:** a class or module everybody imports; dozens of methods spanning unrelated concerns; names
like `Utils`, `Helper`, `Manager`, `Common`, `AppService`; files far over the project's size cap; tests
needing huge setup.

**Fix:** group methods by the data and callers they serve and split along those seams (often one service
per use case, one repository per aggregate). Move pure logic out into functions. Do it incrementally,
one extracted unit per commit, with behaviour unchanged.

## Inheritance for reuse

**Symptoms:** `BaseService` / `BaseController` classes holding helpers; subclasses overriding methods to
do nothing or throw; hierarchies three or more levels deep; changes to the base breaking distant subclasses.

**Fix:** move shared helpers to functions or injected collaborators; model variants as a discriminated
union or separate implementations of one interface.

```ts
// Instead of class AuditedRepo extends BaseRepo extends DbAccess
export class OrderRepository implements OrderStore {
  constructor(private readonly db: DbClient, private readonly audit: AuditLog) {}
}
```

## Singletons as globals

**Symptoms:** `Config.getInstance()`, imported client instances doing I/O deep in business code, module-level
mutable state (caches, "current user"), tests that must reset globals or run serially.

**Fix:** create once in the composition root and inject. Module-scope reuse of a stateless client at the
entry point is fine; module-scope request, user or tenant data never is.

## Feature envy and train wrecks

**Symptoms:** a function that mostly reads another object's fields; chains like `a.b().c.d()`.

**Fix:** move the logic to where the data lives, or pass the needed value directly (Law of Demeter).

## Boolean-flag functions

**Symptoms:** `render(true)`, `save(item, false, true)`; one function with branches per flag.

**Fix:** two clearly named functions, or a named options object when the variation is genuinely data.

## Quick review checklist

- Can each new abstraction name the existing problem it solves? If not → over-design.
- Does any unit construct its own I/O dependencies or read globals? → under-design (inject).
- Does adding a variant require edits in several files? → missing strategy/map.
- Any interface with one implementation and no fake? Any layer that only forwards? → remove.
- Any class over the size cap or with "and" in its one-sentence description? → split.
