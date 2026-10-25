---
name: security-basics
description: Baseline security for any stack — input validation at trust boundaries, server-side authorisation, tenant isolation, secrets, least privilege, injection and safe logging. Use when handling user input, adding an endpoint, query, upload or permission check, touching auth, secrets or tenant data, or when asked "is this secure" or "can another tenant see this".
---

# Security basics

The highest-impact defects, in order. A finding in the first three blocks a merge.

## 1. Tenant isolation (multi-tenant systems)

The tenant key's name and where it comes from are in CLAUDE.md (e.g. `organizationId`,
`accountId`, `workspaceId`).

- The tenant id comes from **verified identity** (session, token claims, server-side context),
  **never** from a client-supplied argument, header, body or URL that the server trusts as is.
- **Every** read, write, key, index lookup, file path, cache key and queue message is scoped by
  it. A lookup by id alone must still check that the record belongs to the caller's tenant.
- No tenant-specific data in process-level globals, module-scope caches or shared temp files.
- **Storage**: object keys for tenant data are tenant-prefixed (`tenants/{tenantId}/…`) and the bucket's
  access rules enforce the prefix per tenant. A rule like "any authenticated user" on a flat prefix lets
  any signed-in user of any tenant read every file under it.
- Test the other-tenant case: a request authenticated as tenant A for tenant B's id returns
  not-found or forbidden.

## 2. Authorisation on the server

- Check permissions server-side on every operation, including reads, list endpoints, exports,
  background jobs and admin tools. Hiding a button is UX, not security.
- Check object-level access (this user, this record), not just "is logged in"; this is the
  most common API flaw (broken object-level authorisation).
- Deny by default. A new route, resolver or rule that is more permissive than its neighbours
  needs an explicit justification.
- Don't trust client-sent role, price, owner or status fields; derive them on the server.

## 3. Secrets

- No secrets, keys, tokens, connection strings or private endpoints in code, config committed to
  the repo, tests, fixtures or client bundles. Use the project's secret manager or environment.
- Anything shipped to a browser or mobile app is public. Only publishable keys go there.
- A leaked secret is rotated, not just deleted from the latest commit.

## 4. Input validation at boundaries

- Parse all external input (bodies, params, headers, files, webhooks, events, model output)
  with a schema at the boundary: types, lengths, ranges, formats, allowed values. Reject unknown
  fields where the framework allows.
- Validate on the server even if the client validates.
- Files: check size, type by content (not extension), store outside the web root with generated
  names, scan if the project does.
- Webhooks: verify signatures before parsing.

## 5. Injection

- Queries: parameterised queries or the ORM/query builder's bound parameters; never build
  query strings by concatenating input (SQL, NoSQL filters, LDAP, search DSLs).
- Shell: no shell with interpolated input; pass argument arrays.
- HTML: rely on the framework's escaping; any raw-HTML sink takes sanitised input only.
- Paths and URLs: normalise and check against an allowlist (path traversal, SSRF). Don't fetch
  arbitrary user-supplied URLs from the server.
- Deserialisation: never deserialise untrusted data into executable types.
- LLM prompts: treat user content as data; don't let it change instructions or tool permissions.

## 6. Least privilege

- Each service, function, token and database user gets only the permissions it needs, scoped to
  specific resources; no wildcards on actions or resources without a written reason.
- Short-lived credentials over long-lived keys.
- Admin and destructive operations are separately authorised and audit-logged.

## 7. Safe logging and errors

- Never log secrets, tokens, passwords, session ids, full payloads or personal data; log ids.
- Error responses don't expose stack traces, queries or internals (`error-handling`).
- Security-relevant events (login, permission change, export, delete) are logged with who,
  what and tenant.

## 8. Dependencies and transport

- Add a dependency only if it is maintained and needed; keep the lockfile committed; act on
  high-severity audit findings.
- TLS everywhere; secure, httpOnly, sameSite cookies; CSRF protection for cookie-authenticated
  state changes; rate limits on auth and expensive endpoints.

## Review checklist

- [ ] Tenant id from verified identity; every new data path scoped by it; other-tenant test exists.
- [ ] Server-side, object-level authorisation on every new operation; deny by default.
- [ ] No secrets in code, fixtures or client bundles.
- [ ] All external input schema-validated at the boundary.
- [ ] No string-built queries, shell commands or raw HTML from input.
- [ ] New permissions are least-privilege and resource-scoped.
- [ ] Logs and error responses contain no secrets, PII or internals.

For a full audit of pending changes, the built-in `/security-review` command goes deeper.
