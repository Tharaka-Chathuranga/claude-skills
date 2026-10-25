# Writing skills for this library

How to write skills that Claude finds at the right moment and that cost as few tokens as possible.
Based on Anthropic's [authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
the [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) and the
[Claude Code skills reference](https://code.claude.com/docs/en/skills).

## Contents

1. How a skill spends tokens
2. Hard limits (the build fails if you break these)
3. The description: the only part Claude always reads
4. Keeping SKILL.md small
5. Splitting into reference files
6. Scripts instead of instructions
7. How specific to be
8. Writing style rules
9. Claude Code frontmatter options
10. Testing a skill
11. Checklist before you open a PR
12. Template

---

## 1. How a skill spends tokens

Skills load in three levels, and each level only loads when needed:

| Level | What | When it loads | Cost |
|---|---|---|---|
| 1. Metadata | `name` + `description` | Every session, for every installed skill | about 100 tokens per skill |
| 2. Instructions | the body of `SKILL.md` | When the skill is triggered | keep it under 5k tokens |
| 3. Resources | other files in the folder | Only when Claude reads or runs them | nothing until used |

What this means for you:

- **The description is paid for in every session**, by every developer, whether or not the skill is used. Make it
  short and precise.
- **The SKILL.md body stays in context for the rest of the conversation** once loaded. Claude Code doesn't re-read
  it later, so every line keeps costing tokens on every following turn.
- **Reference files are free until opened.** Long material belongs there, not in SKILL.md.
- **Scripts are the cheapest of all.** Claude runs them and only their output enters context; the code itself never does.
- **After auto-compaction**, Claude Code re-attaches only the first 5,000 tokens of each invoked skill (25,000 tokens
  across all skills). Put the most important rules at the top.

## 2. Hard limits

`scripts/build-index.mjs` rejects a skill that breaks any of these:

| Field | Rule |
|---|---|
| folder name | same as `name` |
| `name` | max 64 characters; lowercase letters, digits and hyphens only; must not contain `claude` or `anthropic` |
| `description` | required; max 1,024 characters; one line; no XML tags like `<example>` |
| SKILL.md | max 500 lines |

It also warns (without failing) when a description has no "Use when" clause or a reference file over 100 lines has
no table of contents.

## 3. The description

Claude picks a skill by matching the request against descriptions, often out of 100 or more. A skill with a
weak description never triggers, however good its body is.

**Write it as: what it does, then when to use it, with the words people actually type.**

```yaml
# Good: specific, third person, trigger phrases included
description: Create a React component with a folder per component, index.ts exports and a colocated test. Use when asked to "add a component", "build a UI for", or "extract this into a component".

# Bad: vague, matches nothing
description: Helps with React stuff

# Bad: wrong point of view. The description is injected into the system prompt.
description: I can help you build components
```

Rules:

- **Third person.** "Creates…", not "I can…" or "You can use this to…".
- **Key use case first.** Claude Code truncates long descriptions in the skill listing, and when many skills are
  installed it drops descriptions for the least-used skills first.
- **Include file types, library names and domain words**: `.xlsx`, `zod`, "server action", "multi-tenant".
- **Don't overlap with another skill.** If two descriptions match the same request, Claude may pick the wrong one.
  Split responsibilities clearly, or merge the skills.
- **Aim for 1–3 sentences** (roughly 150–400 characters). Longer descriptions cost every developer tokens in every session.

## 4. Keeping SKILL.md small

**Assume Claude is already very smart.** Only write what it can't know: your conventions, your folder layout,
your gotchas, your internal tools. For every paragraph, ask "does Claude really need this?"

```markdown
<!-- Good: ~50 tokens -->
## Extract PDF text
Use pdfplumber:
    with pdfplumber.open("file.pdf") as pdf:
        text = pdf.pages[0].extract_text()

<!-- Bad: ~150 tokens explaining what a PDF is and why libraries exist -->
```

Cut:

- Explanations of general concepts (what React is, what a test is, why validation matters).
- Several ways to do the same thing. Give one default, plus an escape hatch for the edge case
  ("Use pdfplumber. For scanned PDFs, use pytesseract instead.").
- History and dates ("before August 2025, use…"). If old behaviour must be documented, put it in an
  "Old patterns" section at the bottom or in a reference file.
- Anything already in the project's CLAUDE.md. Claude reads that anyway.

Keep:

- The exact folder layout, naming rules and commands for this kind of project.
- Rules Claude gets wrong without being told.
- One short, concrete example of the expected output.

## 5. Splitting into reference files

When a skill grows, SKILL.md becomes a table of contents that points to other files. Claude opens only the
file the current task needs.

```
nextjs-amplify/
├── SKILL.md              # overview, the common path, links below
├── reference/
│   ├── data-models.md    # loaded only for data-model work
│   ├── auth.md           # loaded only for auth work
│   └── lambdas.md
├── examples/
│   └── crud-page.tsx     # loaded only when Claude needs a full example
└── scripts/
    └── check-schema.mjs  # run, never read
```

In SKILL.md, say **when** to open each file:

```markdown
## Where to look
- **Changing a data model** → read [reference/data-models.md](reference/data-models.md)
- **Adding auth rules** → read [reference/auth.md](reference/auth.md)
- **Need a full page example** → see [examples/crud-page.tsx](examples/crud-page.tsx)
```

Rules:

- **Link one level deep only.** Every reference file must be linked straight from SKILL.md. When a reference file
  links to another one, Claude may only preview the second file (for example with `head`) and miss content.
- **Organise by domain or task**, not by type: `reference/auth.md`, not `docs/file2.md`.
- **Name files after their content**: `form-validation-rules.md`, not `notes.md`.
- **Reference files over 100 lines start with a table of contents**, so Claude sees everything a file covers even
  from a partial read and can jump to the right section.
- **Large lookups can be grepped.** Tell Claude, e.g. `grep -i "invoice" reference/tables.md`, instead of having
  it read the whole file.
- **Use forward slashes** in all paths, even for Windows users.

## 6. Scripts instead of instructions

For anything deterministic (validating, generating boilerplate, checking a schema, formatting), ship a script.

- Running a script costs only its output in tokens. Generating the same code costs the code, every time.
- Scripts are more reliable and consistent than code Claude writes on the fly.
- Say clearly whether Claude should **run** the script ("Run `scripts/validate.mjs`") or **read** it as
  reference ("See `scripts/validate.mjs` for the algorithm"). Running is almost always what you want.
- In Claude Code, refer to scripts with `${CLAUDE_SKILL_DIR}/scripts/x.mjs` so the path works whether the
  skill is installed in the project or in `~/.claude/skills`.
- Handle errors inside the script, and print messages that say how to fix the problem:
  "Field `signature_date` not found. Available: customer_name, order_total".
- Explain constants. `TIMEOUT = 30 // most requests finish in 30s` is good; `TIMEOUT = 47` is not.
- Don't assume packages are installed. List what the script needs, and prefer Node or Python built-ins.

## 7. How specific to be

Match strictness to how fragile the task is:

| Freedom | Use when | Write it as |
|---|---|---|
| High | Many valid approaches; judgment needed (code review, naming) | A short list of what to consider |
| Medium | A preferred pattern exists but details vary (a new component) | A template to adapt |
| Low | One wrong step breaks things (migrations, deploys) | The exact command, plus "don't change the flags" |

For multi-step work, give a checklist Claude can copy and tick off, and a feedback loop:
**do → validate → fix → validate again → only then continue.**

## 8. Writing style rules

- **One term per concept.** Don't mix "endpoint", "route", "URL" and "path" for the same thing.
- **Concrete examples beat descriptions.** One input/output pair teaches a format better than a paragraph.
- **Write rules that apply to the whole task.** "Run the tests after every edit", not "Run the tests". The
  skill is read once, then followed for many turns.
- **Name MCP tools fully** as `ServerName:tool_name`.
- **Rules that must never be skipped belong in a hook**, not in skill text. Skills are guidance; hooks always run.

## 9. Claude Code frontmatter options

Only `name` and `description` are needed. These optional fields help control token use and behaviour:

| Field | Use it for |
|---|---|
| `disable-model-invocation: true` | Skills only a person should start, like deploys or releases. The description is then **not** listed in context at all, which saves tokens. Run it with `/skill-name`. |
| `user-invocable: false` | Background knowledge Claude should use but people wouldn't call by name. |
| `paths: ["amplify/**"]` | Only auto-activate when Claude works on matching files. |
| `context: fork` | Run the skill in a subagent, so its reading and searching stay out of the main conversation. Only for skills with explicit, self-contained instructions. |
| `allowed-tools` | Tools the skill may use without a permission prompt, e.g. `Bash(node *)`. |
| `argument-hint` + `$ARGUMENTS` | Skills run as commands with input, e.g. `/new-lambda send-invoice`. |
| `` !`command` `` in the body | Injects live output (e.g. `` !`git diff --stat` ``) when the skill runs, instead of Claude spending a turn to fetch it. A failing command aborts the skill, so add `|| true` when a non-zero exit is expected. |

Other platforms (claude.ai, the API) ignore the Claude Code-only fields, so a skill that uses them still loads there.

## 10. Testing a skill

1. **Start from a real gap.** Do the task with Claude without the skill, and note what it gets wrong or what you
   keep having to explain. The skill should fix exactly that, and nothing more.
2. **Write at least three test prompts** before writing much content: two that should trigger the skill, and one
   similar prompt that should not.
3. **Test in a fresh session.** Install the skill into a sample project, start a new Claude Code session, and run
   your prompts. Check that it triggers, finds the right reference files, and follows the rules.
4. **Watch how Claude navigates.** A file it never opens is unneeded or badly linked. A file it opens every time
   probably belongs in SKILL.md.
5. **Test with the models your team uses.** Haiku may need more guidance; Opus needs less explanation.
6. **Check the cost.** In Claude Code, `/context` shows the skill listing's size, `/doctor` shows the biggest
   contributors, and `/skill-doctor` shows each skill's context cost and usage.
7. **Not triggering?** Add the words people actually say to the description. **Triggering too often?** Make it
   narrower, or set `disable-model-invocation: true`.

## 11. Checklist before you open a PR

- [ ] Description is third person, says what and when, and includes real trigger phrases
- [ ] Description doesn't overlap with another skill in the library
- [ ] SKILL.md is under 500 lines (aim for under 200) and contains nothing Claude already knows
- [ ] The most important rules are near the top
- [ ] Long material is in reference files, each linked straight from SKILL.md with "read this when…"
- [ ] Reference files over 100 lines start with a table of contents
- [ ] Deterministic steps are scripts that Claude runs, not code it writes
- [ ] No dates or "new vs old" notes in the main text
- [ ] One term per concept; forward slashes in paths
- [ ] Tested in a fresh session with at least three prompts
- [ ] `node scripts/build-index.mjs` passes and the skill is in the right pack in `packs.json`

## 12. Template

```markdown
---
name: doing-the-thing
description: Does X for Y projects, following our Z conventions. Use when asked to "phrase people say", "another phrase", or when working on <file type or folder>.
---

# Doing the thing

## Rules
1. The rule Claude most often gets wrong.
2. The next most important rule.

## Steps
1. ...
2. Run `node ${CLAUDE_SKILL_DIR}/scripts/check.mjs` and fix anything it reports.

## Example
<one short, concrete example of the expected result>

## Where to look
- **<Situation A>** → read [reference/a.md](reference/a.md)
- **<Situation B>** → read [reference/b.md](reference/b.md)
```
