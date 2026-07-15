---
name: nextjs-api-performance
description: Audits and optimizes Next.js App Router APIs using measured request timing, cookie-first authentication, Server Component prefetching, PostgreSQL query tuning, Drizzle transaction patterns, caching, and durable background work. Use when API routes, server rendering, database queries, authentication, mutations, or loading UX are slow.
topics: [react-patterns, performance]
---

# Next.js API Performance

## Goal

Improve real p50 and p95 latency without weakening authentication, tenant
isolation, data freshness, or mutation correctness.

Do not optimize from assumptions. Instrument first, identify the dominant
request phase, then make the smallest change that removes that cost.

## Required workflow

Track this checklist:

```text
- [ ] Read architecture, auth, database, and caching conventions
- [ ] Inventory every GET, POST, PATCH/PUT, and DELETE Route Handler
- [ ] Capture baseline p50/p95 and Server-Timing
- [ ] Trace auth, database, provider, and serialization work
- [ ] Fix the highest-cost repeated work
- [ ] Verify query plans and indexes
- [ ] Verify cache invalidation and tenant isolation
- [ ] Run types, lint, tests, and production build
- [ ] Compare warm and cold p50/p95 against baseline
```

## 1. Discover the actual request path

Before editing:

1. Read `package.json`, framework config, auth config, database clients, API
   middleware, query client, and architecture docs.
2. Inventory Route Handlers under `app/api`.
3. Map each route:

```text
method → auth → validation → service → DB/provider calls → side effects → response
```

4. Record:
   - Authentication and membership lookups
   - Number of database transactions and SQL statements
   - Sequential versus parallel independent work
   - External provider calls
   - Cache reads, writes, and invalidation
   - Response payload size
   - Client refetches caused by the mutation

Use a code graph when available, but confirm every proposed deletion or merge
with direct caller searches and the TypeScript compiler.

## 2. Measure before optimizing

Add `Server-Timing` phases around the shared API boundary:

```typescript
const startedAt = performance.now();
const session = await resolveSession(request);
const authMs = performance.now() - startedAt;

const handlerStartedAt = performance.now();
const response = await handler(request, session);
const handlerMs = performance.now() - handlerStartedAt;

response.headers.set(
  "Server-Timing",
  `auth;dur=${authMs.toFixed(1)}, handler;dur=${handlerMs.toFixed(1)}`,
);
```

Add finer phases only where they answer a question: membership, database,
provider, serialization, queueing. Log slow requests as structured data with
route, method, status, total time, and phase times. Never log secrets, tokens,
cookies, or request bodies containing personal data.

Compare:

- Cold and warm requests
- p50 and p95, not one development request
- Server time and end-to-end browser time
- Before and after using the same dataset and environment

## 3. Optimize in this order

### A. Remove repeated authentication work

- Enable the auth library's signed cookie/session cache when supported.
- Resolve identity once at the shared Route Handler boundary.
- Resolve tenant/workspace membership once, cache it briefly, and invalidate it
  immediately after membership changes.
- Use single-flight loading so concurrent misses for one key share one query.
- A fast context cookie must be signed, short-lived, HttpOnly, session-bound,
  and minted only after authoritative membership resolution.
- Permission-changing operations must perform authoritative authorization.
- Never trust tenant IDs from body, query, or unsigned headers.

### B. Remove rendering waterfalls

- Server Components call server services directly for initial data. They do not
  call the application's own Route Handlers.
- Pass initial data to the client query cache to avoid
  `SSR → hydration → authenticated API → render`.
- Start independent reads together with `Promise.all`.
- Use Suspense boundaries when streaming improves first paint.
- Keep previous query data during background refetches to prevent flicker.

### C. Reduce database round trips

- Combine related reads in one transaction when they need one tenant context.
- Start independent queries concurrently only when the pool can execute them.
- Batch inserts and upserts instead of looping over rows.
- Keep mutation checks, row locks, writes, and durable job enqueueing atomic.
- Use `INSERT ... ON CONFLICT` for idempotent claims and suppression updates.
- Avoid opening several tenant transactions for one request.

### D. Improve the SQL shape

- Select only fields the response uses.
- Use indexed `EXISTS` for existence checks.
- Use grouped or filtered aggregates instead of repeated `count(*)` queries.
- Use explicit time bounds instead of applying functions to indexed timestamps.
- Use stable keyset pagination with a unique tie-breaker and `limit + 1`.
- Avoid offset pagination and exact totals on growing interactive datasets.
- Use `FOR UPDATE` when mutation invariants depend on the current row.
- Normalize searchable data or use an appropriate text-search/trigram index.

Verify important queries with:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) ...
```

Use `pg_stat_statements` to rank production queries by total time, mean time,
calls, and rows. Do not add indexes without matching them to real predicates,
joins, and ordering. Remember that every index has write and storage cost.

### E. Cache only repeated, safe work

Use the narrowest useful cache:

1. Per-request deduplication
2. Process LRU/TTL cache
3. Framework/server cache
4. Durable database or distributed cache

Rules:

- Namespace keys and include every value affecting the result.
- Use shorter TTLs for positive availability than stable negative results when
  races are possible.
- Cache external API results durably when calls are expensive or billable.
- Add single-flight protection around expensive cache misses.
- Invalidate from the mutation that changes the source data.
- Do not combine browser `max-age` caching with client invalidation for mutable
  authenticated resources.
- Do not cache permission decisions longer than revocation requirements allow.

### F. Move side effects off the response path

After the authoritative mutation succeeds:

- Queue email, SMS, calendar synchronization, analytics, and PDF generation.
- Insert the durable job in the same transaction when losing it would violate
  correctness.
- Kick the processor with Next.js `after()` only as an accelerator; the durable
  queue remains the source of truth.
- Give jobs idempotency/dedupe keys, retry limits, and explicit
  completed/skipped/failed outcomes.

Do not move required validation, authorization, payment confirmation, or
consistency checks into background work.

### G. Bound connection concurrency

- Use a transaction pooler for serverless PostgreSQL where appropriate.
- Disable prepared statements when the pooler's transaction mode requires it.
- Keep per-instance application and admin pools small and configurable.
- Size total possible connections as:

```text
connections per instance × maximum concurrent instances
```

- More connections do not fix slow SQL and can overload PostgreSQL.

## 4. Method-specific checks

### GET

- Avoid duplicate auth and membership reads.
- Prefetch primary page data on the server.
- Use keyset pagination for growing lists.
- Return `no-store` for mutable authenticated data when the client query cache
  owns freshness.
- Use short private caching only for safe high-frequency lookups.

### POST

- Parse and validate once.
- Make creation and dependent job insertion atomic.
- Use idempotency keys for retried public/provider requests.
- Return after the authoritative write; defer notifications and integrations.

### PATCH/PUT

- Lock the row when checking state-transition invariants.
- Update only changed fields.
- Invalidate every affected client/server cache.
- Keep provider synchronization asynchronous unless the response requires it.

### DELETE

- Authorize against authoritative ownership.
- Cancel or supersede pending jobs atomically.
- Use soft deletion only when product or compliance rules require it.
- Make provider deletion idempotent; `not found` can often be treated as
  success.

## 5. Drizzle and PostgreSQL rules

- Route Handlers stay thin; database work belongs in server services.
- Infer transaction types from the configured Drizzle client.
- Pass the active transaction into reusable atomic helpers.
- Do not hide privileged clients behind a generic repository.
- Keep RLS/session context setup and tenant queries in the same transaction.
- Put RLS policies and query-supporting indexes in reviewed migrations.
- Treat ORM convenience as code generation, not proof of an efficient query.
  Inspect generated SQL for hot paths.

## 6. Client experience

Performance includes perceived latency:

- Use optimistic updates only when rollback is safe.
- Disable duplicate submissions.
- Debounce and abort typing-triggered requests.
- Retain previous data during refetch.
- Invalidate precise query keys after mutations.
- Avoid refetching unrelated dashboards after every small mutation.
- Use URL query parameters for deep-linkable selection and filtering when the
  state should survive refresh/back navigation.

## 7. Anti-patterns

Do not:

- Blame region distance before measuring request phases.
- Add caching before fixing repeated queries.
- Cache tenant context from untrusted input.
- Call internal Route Handlers from Server Components.
- Run independent network/database operations sequentially.
- Put email, SMS, calendar, or report generation on the mutation response path.
- Use `Promise.all` when a one-connection transaction will serialize it anyway.
- Add broad indexes without checking query plans and write cost.
- trust development hot-cache timings as production evidence.
- weaken RLS or authorization for speed.

## 8. Verification and handoff

Required checks:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Also verify:

- Every Route Handler method uses the shared auth/error boundary.
- Tenant isolation tests still pass.
- Cache invalidation works after create/update/delete.
- Background jobs are durable and idempotent.
- Important SQL uses expected indexes.
- No stale internal API request occurs after server rendering.
- p50 and p95 improve for cold and warm traffic.

Report results as:

```markdown
## Baseline

- Route/method:
- p50/p95:
- Dominant Server-Timing phase:

## Changes

- Removed work:
- Query/index change:
- Cache/invalidation:
- Deferred side effects:

## Verification

- Types/lint/tests/build:
- Query plan:
- Tenant/security:
- New p50/p95:

## Remaining bottleneck

- Evidence:
- Recommended next measurement:
```
