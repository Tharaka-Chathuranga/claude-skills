# Naming

A name is often the only documentation a reader sees. A good name lets someone new to the code
say what a thing is for, in the product's own words, without opening it.

## Which rule wins

1. **The project's conventions** (CLAUDE.md, the language module, the surrounding code).
   Consistency with neighbours beats any general guideline.
2. **The domain vocabulary** in CLAUDE.md (glossary of product terms). Use the word users and
   the product team use, not an invented technical synonym.
3. **The checklist below.**

If the project has no glossary and a change introduces a domain concept, use the word from the
UI copy and data schema, and suggest adding it to CLAUDE.md.

## Checklist

Apply to every new or renamed identifier. Rename only if it fails one; say which.

**Meaning**
- **Says why it exists, not how it works:** `findOverdueInvoices`, not `filterList`. If the name
  needs a comment, it isn't finished.
- **Still true:** names go stale when the design changes; a stale name misleads more than a long one.
- **Precise:** reject `data`, `info`, `item`, `object`, `value` (alone), `manager`, `helper`,
  `util`, `handler` (as a noun), `process`, `stuff`, `temp`, `flag`.
- **One concept, one word:** don't call it `customer` here and `client`, `account` or `user`
  next door. Synonyms make readers hunt for a difference that isn't there.
- **One word, one concept:** don't reuse a word that already means something in the domain or
  the framework (a pun).

**Form**
- Functions are verb phrases; types, components and values are noun phrases.
- **Verb prefixes keep their promise:** `get`/`is`/`has` only read; `find` may return nothing;
  `to`/`convert` return a converted value; `build`/`create` make a new thing;
  `validate`/`check` return or throw a result; `set` changes state; `fetch`/`load` do I/O.
- Booleans read as a positive yes/no question: `isActive`, `hasAccess`, `canEdit`, `shouldRetry`
  (never `isNotHidden`), unless the language's idiom differs.
- Collections plural (`invoices`), single values singular; maps as `<value>By<key>`.
- Units and qualifiers in the name: `timeoutMs`, `sizeBytes`, `maxRetries`, `itemCount`.
- No numeric suffixes (`user2`), no type encodings (`strName`, `userList` for a set), no
  abbreviations a newcomer must decode (`cfg`, `btn`, `idx`); `id` and well-known acronyms are fine.
- Length fits scope: a three-line loop index can be `i`; an exported name needs 2–4 real words.
- Acronyms follow the language's casing convention consistently.

**Files and folders**
- Casing follows the project/language convention (kebab-case is the common default for
  web projects); one convention per repo.
- A file is named after its main export; a folder after the concept it holds.
- Role suffixes are consistent across the repo (`.service`, `.repository`, `.test`), matching
  neighbours when a folder already has a style.
- A new developer should guess a file's content from its path alone.

**Tests**
- `describe(<unit>)`, `it(<behaviour stated as a fact>)`: `it('rejects an expired token')`, not
  `it('works')`.

**Reading test:** read the line aloud. `if (isExpired) renewSubscription()` passes;
`if (f) h()` fails.

## When not to rename

Every rename costs review attention and can break imports. Propose one only when the name
misleads, collides with a domain word, breaks a project convention, or is clearly vaguer than a
ready alternative; list "slightly nicer" as optional. Names from an external schema, library or
API stay as they are; translate them once at the boundary and use the domain word after.

## Reviewing names in a diff

1. Collect names: `git diff --name-status` for files and folders, then exported and top-level
   identifiers, parameters, constants, test titles and user-facing labels that name a concept.
2. Build a concept map first: each concept the change introduces and every word used for it in
   code, copy and tests. Synonyms and puns show up here.
3. Run the checklist. For each rename, count the blast radius with `grep -rn`.

Report:

```
## Concept map
| Concept | Words used now | Proposed single word |
## Must rename (misleading, domain collision, breaks convention)
| Current | Proposed | Where | Rule |
## Should rename (vaguer than a ready alternative)
| Current | Proposed | Where | Rule |
## Optional
```

End with how many files the "must" renames touch, and offer to apply them in one change so the
code is never half-renamed.
