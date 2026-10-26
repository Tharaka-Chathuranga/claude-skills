---
name: error-handling
description: Rules for failures in any stack — handle each error once, typed expected vs unexpected errors, keep the cause, structured logging without secrets or PII, no swallowing, safe user-facing messages. Use when writing try/catch, throwing or returning errors, adding logging, mapping errors to responses, or when asked "how should I handle this failure".
---

# Error handling

## Rules

1. **Never swallow.** No empty `catch`, no catch that only logs and carries on along the main
   path as if it succeeded, no `.catch(() => {})`, no ignored error return values.
2. **Handle once, at the right level.** Catch where you can do something useful: retry, fall
   back, add context, or map to a response. Otherwise let it propagate. Catching to log and
   rethrow at every layer produces duplicate logs; log once, where it is finally handled.
3. **Keep the cause.** When rethrowing, wrap with context and attach the original
   (`new Error('Failed to load invoice 42', { cause: err })` or the language's equivalent).
4. **Map to the outside world once, at the edge** (request handler, resolver, job runner, UI
   boundary): expected errors become a specific status/result; unexpected ones become a generic
   failure plus a log entry with full detail.

## Expected vs unexpected

| | Expected (domain) | Unexpected (bug, outage) |
|---|---|---|
| Examples | not found, validation failed, conflict, forbidden, quota exceeded | null dereference, network down, invariant broken |
| Represent as | a typed error class/code or a result type the caller must check | a thrown exception that propagates |
| Caller | handles it explicitly | doesn't catch it; the edge does |
| Response | specific status and message (e.g. 404, 409, 422) | generic 500 / "Something went wrong" + correlation id |
| Log level | info or warn (usually no stack) | error, with stack and context |

Use the project's existing error types before adding new ones. Make the set of expected
errors part of the function's contract (type, doc comment or result union) so callers can
handle each case exhaustively.

## Messages

- **User-facing:** what happened and what they can do, in plain words, localised if the
  project localises. Never stack traces, SQL, internal ids, hostnames or library messages.
- **Internal (logs, error objects):** precise — which operation, which entity id, which input
  failed which rule.
- Don't leak existence through messages where it matters for security (e.g. "invalid
  credentials", not "user not found").

## Logging

- Use the project logger, structured: `logger.error('Payment capture failed', { orderId,
  correlationId, error })`. No string-concatenated logs; no debug `print`/`console.log`
  in shipped code.
- Always include the correlation/request id when it exists.
- Never log secrets, tokens, passwords, full request/response bodies, or personal data. Log ids,
  not contents. Detail: `security-basics`.
- Pick levels deliberately: `error` needs someone to look; `warn` is degraded but handled;
  `info` is a business event; `debug` is off in production.

## Patterns

- **Best-effort side effects** (analytics, notifications, cache warm-up) get their own
  try/catch so they can't fail the main operation, and they log when they fail.
- **Retries** only for transient failures (timeouts, throttling, 5xx), with capped exponential
  backoff and jitter, and only around idempotent operations. Never retry validation or auth errors.
- **Timeouts** on every outbound call; a timeout is an error with context, not a hang.
- **Partial failure** in batches: report which items failed and why; don't fail the whole batch
  for one item unless the operation must be atomic.
- **Cleanup** in `finally` / `using` / `defer`; never rely on the happy path to release
  resources.
- **UI:** show an actionable message, keep the last good data on screen, and offer retry where it
  makes sense.
- **Async:** every promise/future is awaited or explicitly handled; no floating async work.

## Review checklist

- [ ] No empty or log-and-continue catch on the main path.
- [ ] Each error is handled once; rethrows keep the cause.
- [ ] Expected errors are typed and mapped to specific responses; unexpected ones are generic
      outside and detailed in logs.
- [ ] Logs are structured, carry correlation ids, and contain no secrets or PII.
- [ ] Outbound calls have timeouts; retries are bounded and only for transient failures.
