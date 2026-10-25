# Research summary: where the rules come from

Read this when a rule's reason matters to a decision, when two rules conflict, or when someone
asks why the standard says what it says.

## Contents

- Principles
- Size and complexity
- Types and validation
- Errors and logging
- Structure
- Comments and decisions
- Testing
- Review and adoption

## Principles

| Principle | In practice | Source |
| --- | --- | --- |
| Readability first | Beck's rules of simple design, in order: passes tests, reveals intent, no duplication, fewest elements | [Fowler: Beck Design Rules](https://martinfowler.com/bliki/BeckDesignRules.html) |
| Single responsibility | One reason to change per unit | SOLID (Robert C. Martin) |
| DRY, applied to knowledge | Duplicated rules are bugs; duplicated shapes are cheap. "Duplication is far cheaper than the wrong abstraction" | [Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) |
| AHA / rule of three | Avoid hasty abstractions; extract on the third occurrence | [Kent C. Dodds](https://kentcdodds.com/blog/aha-programming); Fowler, *Refactoring* |
| KISS, YAGNI | Build the simplest thing for the current requirement | Extreme Programming |
| Law of Demeter | Talk to immediate collaborators; wrap deep property chains | Lieberherr, Holland |
| Functional core, imperative shell | Pure domain logic, thin I/O shell | [Gary Bernhardt](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) |
| Dependency inversion | Core depends on interfaces; adapters injected at the composition root | SOLID; [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) |

## Size and complexity

- No study supports one magic line count. *Clean Code* argues for very small functions; *Code
  Complete* cites studies where routines up to 100–200 lines were not more error-prone.
  Complexity and cohesion predict defects better than length. Common guardrails: files 300–400
  lines, functions 50–80. That is why the cap lives in config, not in the skill.
- **Cognitive complexity** (SonarSource) counts nesting and breaks in linear flow. Default
  threshold 15, chosen after 10 proved too noisy.
  [Whitepaper](https://www.sonarsource.com/docs/CognitiveComplexity.pdf)

## Types and validation

- Treat external data as unknown until parsed; derive static types from the runtime schema so
  the two can't drift ("parse, don't validate").
  [Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- Exhaustive switches checked by the compiler turn a new enum member into a build error instead of
  a silent fallthrough.

## Errors and logging

- Typed domain errors mapped once at the edge; keep the cause chain; never swallow.
- Structured logs with correlation and tenant ids, no PII; log once at the boundary.
  [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- At-least-once delivery means handlers must be idempotent.

## Structure

- Feature-first folders with one-way imports; a slice imports only from layers below; no
  cross-feature internals. [Feature-Sliced Design](https://feature-sliced.design/docs/reference/layers),
  [Clean Architecture dependency rule](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- At most one public entry file per feature boundary; nested barrels slow builds and tests and
  cause import cycles.

## Comments and decisions

- Comments explain why, not what; doc comments on public APIs.
- Architecture Decision Records: context, decision, consequences.
  [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

## Testing

- Static checks, then unit tests for the pure core, then mostly integration tests, then a few
  end-to-end. Test behaviour, not implementation.
  [Testing trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- Regression test first for every bug fix.

## Review and adoption

- Approve a change when it improves overall code health, not when it is perfect; keep changes
  small. [Google eng practices](https://google.github.io/eng-practices/review/reviewer/standard.html)
- Adopt new rules with a ratchet so legacy code doesn't block work but can't get worse.
  [ESLint bulk suppressions](https://eslint.org/blog/2025/04/introducing-bulk-suppressions/),
  [Betterer](https://github.com/phenomnomnominal/betterer)
