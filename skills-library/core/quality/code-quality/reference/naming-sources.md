# Sources behind the naming rules

Read this when you need to justify a rule to a developer, or when two guidelines disagree.

## Naming Guidelines for Professional Programmers — Hilton & Hermans (PPIG 2017)
https://hilton.org.uk/presentations/naming-guidelines

- Syntax: replace numeric suffixes, use dictionary words, expand single letters, name what a
  constant means (not its value), keep names to a few words, put qualifiers like Count/Minimum
  in the name.
- Vocabulary: describe meaning, be precise (`data`, `object` are not names), choose concrete
  words, use problem-domain terms with one term per concept, make names differ in meaning
  rather than by a letter or word order, avoid synonyms.
- Data types: plural for collections, singular for values, precise opposites (add/remove,
  show/hide), positive booleans.
- Methods: verb phrases; `get`/`is`/`has` only for side-effect-free access; validation verbs only
  when the result is returned or thrown; conversion verbs only when the value is returned.
- Departure: the paper advises omitting `is` on booleans. Most JavaScript/TypeScript, Java,
  Kotlin, Swift and Dart codebases use `is`/`has`, so project convention wins.

## Clean Code, chapter 2 "Meaningful Names" — Robert C. Martin

- Intention-revealing names: if a name needs a comment, it doesn't reveal intent.
- Avoid disinformation (`accountList` that isn't a list), make meaningful distinctions, don't be
  cute, one word per concept, don't pun, add meaningful context.
- Critique worth keeping (https://bugzmanov.github.io/cleancode-critique/chapter_2.html): a name
  that restates a long description adds nothing; not every chunk needs a name.

## Domain-Driven Design — ubiquitous language (Eric Evans, 2003)
https://martinfowler.com/bliki/UbiquitousLanguage.html

- Identifiers come from the language developers and domain experts share; the glossary is the
  source of truth and changes as understanding grows.
- Prefer short, specific domain terms; drop weasel suffixes like `Info`, `Data`, `Item`.
- Watch for internal jargon nobody can explain.

## Language style guides

- Google style guides (TypeScript, Java, Go, Python…): casing per kind, acronyms as words in
  camelCase languages, constants in CONSTANT_CASE. https://google.github.io/styleguide/
- Framework idioms win locally: e.g. React `useX` hooks and `onX`/`handleX` callbacks,
  Go's short receiver names, Python's snake_case.
