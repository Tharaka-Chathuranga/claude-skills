# Performance and scalability

General principles only. Stack modules own the specifics (query planners, database key design,
rendering, bundle size, serverless limits); use theirs when installed.

## Rules for code you write now

1. **Bound every list.** Every query, list endpoint and export is paginated (cursor-based for
   large or changing data) with a server-enforced maximum page size. No "fetch all then filter".
2. **No N+1.** Never make a remote call (database, API, cache) per item inside a loop. Fetch
   the set in one batched call, or join, or prefetch by id list, then map in memory.
3. **Batch writes.** Use the store's batch/bulk API, respecting its size limits, chunking and
   retrying only the unprocessed items.
4. **Filter and sort where the data lives**, using an index or key designed for the access
   pattern, not in application memory after a full read. Prefer key lookups and indexed
   queries over scans.
5. **Bound concurrency.** Parallelise independent I/O, but with a limit; unbounded fan-out
   exhausts connections and triggers throttling.
6. **Timeouts on every outbound call**, shorter than the caller's own timeout, so failures
   surface as errors instead of hangs.
7. **Retries are bounded**: capped exponential backoff with jitter, transient errors only, and
   only for idempotent operations (error-handling reference).
8. **Idempotency.** Anything triggered by a queue, event, webhook or retry must be safe to run
   twice: deterministic ids, conditional writes, or a processed-keys record.
9. **Spread hot keys.** Writes concentrated on one key, partition or row throttle under load;
   design keys so load distributes.
10. **Bound work per request.** Long or heavy work moves to a background job/queue; the request
    returns quickly with a status to poll or an event to wait for.

## Caching, deliberately

- Cache only with a known invalidation rule and TTL; write both down beside the cache.
- Cache keys include every input that changes the result, **including the user id** for per-user data.
- Never cache per-user data in a shared cache without that key.
- Initialise expensive clients and connections once per process, not per request; keep them
  free of request or user state.

## Data shape

- Select only the fields you need; don't ship whole records to render one column.
- Avoid unbounded growth: arrays inside records, log tables, temp files and in-memory maps all
  need a cap or a retention policy.
- Large payloads are streamed or paged, not built in memory.

## Measure before optimising

- Don't optimise without a measurement: a profile, a trace, query stats, or a benchmark with
  realistic data volume.
- Fix the biggest cost first; record the before and after numbers in the PR.
- Prefer algorithmic and data-access fixes (fewer round trips, an index, a batch) over
  micro-optimisations that cost readability.
- Memoisation and caching added "just in case" are complexity with no proven gain.

## Review checklist

- [ ] Every new list is paginated with a server-side maximum.
- [ ] No remote call inside a loop where a batch or join fits.
- [ ] Queries use an index or key for their access pattern; no full scans on hot paths.
- [ ] Outbound calls have timeouts; retries are bounded; retried handlers are idempotent.
- [ ] Concurrency is limited; heavy work is off the request path.
- [ ] Caches have an invalidation rule, a TTL and a key covering every input.
- [ ] Any optimisation comes with a measurement.
