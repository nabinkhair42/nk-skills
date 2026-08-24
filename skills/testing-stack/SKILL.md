---
name: testing-stack
description: Testing architecture for Next.js product apps — Vitest as the runner, a four-layer pyramid (Zod schemas, services with mocked DB, route handlers via direct invocation or Supertest, components via Testing Library), plus React Query hook testing and transactional database tests. Use when adding tests to a product-stack app, setting up Vitest, testing API routes, hooks, forms, or deciding what to test and how.
topics: [react-patterns, tooling]
---

# Testing Stack

A repeatable four-layer testing setup for `product-stack` apps: **Vitest** (one runner for node + jsdom environments), **Testing Library** (components), **Supertest** (HTTP-level API checks when needed), and **transactional rollback** (real DB without cross-test pollution).

The core idea: **test at the lowest layer that can fail.** A Zod schema bug should fail a schema test, not an end-to-end suite.

Pairs with `product-stack` (the layers under test) and `feature-spec` (acceptance criteria map directly onto integration tests).

---

## The Pyramid

| Layer | What | Speed | Count |
| --- | --- | --- | --- |
| 1. Schemas & pure functions | Zod `.parse()`, helpers, formatters | µs | Many |
| 2. Services / server logic | Business rules, mocked DB or transactional real DB | ms | Some |
| 3. Route handlers | Auth boundary, validation, status codes | ms | Key paths only |
| 4. Components | User-visible behavior via Testing Library | slowest | Critical flows |

Skip layer 3–4 coverage for trivial CRUD that layers 1–2 already pin down.

---

## Setup

```bash
pnpm add -D vitest @vitest/coverage-v8
pnpm add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

```typescript
// vitest.config.ts

import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    alias: { "@": path.resolve(__dirname, "./src") },
    // Never let React Query retry inside tests — multiplies test time
    retry: 0,
  },
});
```

```typescript
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

Node-only tests (schemas, services, handlers) run faster without jsdom — use environment comments per file:

```typescript
// @vitest-environment node
```

---

## Layer 1: Zod Schema Tests (write these first)

Schemas are the contract (`product-stack` Layer 3). Test boundaries, not happy paths:

```typescript
// schemas/project.test.ts

import { describe, expect, it } from "vitest";
import { createProjectSchema } from "./project";

describe("createProjectSchema", () => {
  it("accepts valid input", () => {
    const result = createProjectSchema.safeParse({ name: "Acme", status: "draft" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createProjectSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Name is required");
    }
  });

  it("strips trailing slashes from url", () => {
    const result = createProjectSchema.parse({ name: "x", url: "https://a.com///" });
    expect(result.url).toBe("https://a.com");
  });

  it("applies defaults", () => {
    const result = createProjectSchema.parse({ name: "x" });
    expect(result.status).toBe("draft");
  });
});
```

If your form uses the same schema (see `form-stack`), these tests cover form validation too.

---

## Layer 2: Services & Server Logic

### Mocked unit tests (fast, default)

Test business rules in isolation by mocking the DB module:

```typescript
// services/server/task.service.test.ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: { query: { tasks: { findMany: vi.fn() } } },
}));

import { db } from "@/db";
import { getTasksForUser } from "./task.service";

describe("getTasksForUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never returns other tenants' tasks", async () => {
    vi.mocked(db.query.tasks.findMany).mockResolvedValue([]);
    await getTasksForUser("user-1");
    expect(db.query.tasks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.stringContaining("user-1") }),
    );
  });
});
```

### Transactional real-DB tests (for query correctness mocks can't prove)

Run against a **dedicated test database** (`DATABASE_URL` pointing at an ephemeral/disposable Postgres), never development data. Two robust patterns:

**A. Truncate between tests** — simple and driver-agnostic:

```typescript
// tests/db-setup.ts
// @vitest-environment node

import { afterAll, beforeEach } from "vitest";
import { db, sql } from "@/db";

beforeEach(async () => {
  await db.execute(sql`
    DO $$ DECLARE r record; BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
      LOOP EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
});

afterAll(async () => {
  await db.execute(sql`SELECT 1`); // keep pool warm through suite; close via vitest teardown
});
```

**B. Per-test transaction rollback** — fastest for large suites; each test's writes vanish on rollback:

```typescript
export async function inTransaction<T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  return db.transaction(async (tx) => {
    try {
      const result = await fn(tx);
      throw new ROLLBACK();
    } catch (e) {
      if (e instanceof ROLLBACK) return undefined as never;
      throw e;
    }
  });
}
class ROLLBACK extends Error {}
```

> Caveat: pattern B breaks when the code under test manages its own transactions (Postgres has no nested transactions without savepoints). Prefer A when handlers/services open their own `db.transaction(...)`.

---

## Layer 3: Route Handlers

Next.js route handlers are just functions `(request) => Response` — call them directly, no HTTP server needed:

```typescript
// app/api/projects/route.test.ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth at the middleware boundary — the handler must receive `user`
vi.mock("@/lib/middleware/api-middleware", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/middleware/api-middleware")>()),
  protectedApi: (handler: any) =>
    (request: Request, ctx?: any) =>
      handler(request, { id: "user-1" }, {}, ctx),
}));

import { GET, POST } from "./route";

function jsonRequest(body: unknown, url = "http://localhost/api/projects") {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/projects", () => {
  it("returns 400 on invalid body", async () => {
    // mock db.insert to throw-if-called so we assert validation happens first
    const res = await POST(jsonRequest({ name: "" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/projects", () => {
  it("scopes results to the session user", async () => {
    const req = new Request("http://localhost/api/projects?page=1&limit=10");
    const res = await GET(req as any);
    // assert via mocked db call args that user.id was filtered on
  });
});
```

Assert three things per endpoint: **status code**, **auth scoping** (query filtered by `user.id`), and **response shape** (`successResponse` envelope).

Use **Supertest** only when you need real HTTP semantics (middleware chain, cookies, headers) — typically for Express/FastAPI services, not Next.js handlers:

```typescript
import request from "supertest";

const res = await request(app).post("/api/tasks").send({ title: "x" });
expect(res.status).toBe(401); // unauthenticated rejected
```

---

## Layer 4: React Query Hooks & Components

Hooks need a fresh `QueryClient` per test — never share one across tests:

```tsx
// hooks/use-projects.test.tsx

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useProjects } from "./use-projects";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useProjects", () => {
  it("returns paginated data", async () => {
    const { result } = renderHook(() => useProjects({ page: 1 }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data.items).toBeDefined();
  });
});
```

Component tests assert **what the user sees**, not implementation:

```tsx
it("shows field error from failed submission", async () => {
  server.use(http.post("/api/projects", () => HttpResponse.json(
    { success: false, error: "Name already exists" }, { status: 409 },
  )));
  render(<ProjectForm />);
  await userEvent.type(screen.getByLabelText("Name"), "dup");
  await userEvent.click(screen.getByRole("button", { name: /create/i }));
  expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
});
```

Mock network at the fetch level with **MSW v2** (`server.use(...)`) rather than mocking axios — service-layer refactors won't break tests.

---

## Mapping Tests to feature-spec Acceptance Criteria

Each `- [ ]` criterion in a spec becomes one named integration test. If a criterion can't be expressed as a test, it's too vague — rewrite the criterion.

---

## Adding Tests Checklist

1. **Runner config** — `vitest.config.ts` with `@` alias, jsdom default, node per-file
2. **Schemas first** — every file in `schemas/` gets boundary tests
3. **Route handlers** — one test per method per resource: valid, invalid, unauthorized
4. **Critical flows** — component test per acceptance criterion in the spec
5. **CI gate** — `vitest run --coverage` with thresholds on `services/` and `schemas/`

---

## Common Mistakes

1. **Sharing a QueryClient between tests** — cache leaks across tests. New client per test
2. **Leaving React Query retries on** — a failing query retries 3× and triples test time
3. **Mocking axios instead of the network** — MSW intercepts at fetch level; axios mocks break when services change transport
4. **Testing component internals** — query state names or class lists, not rendered output. Assert roles/text like a user would
5. **Running tests against the dev database** — always a dedicated `DATABASE_URL`; migrations applied in CI before the suite
6. **No cleanup between DOM tests** — missing `cleanup()` in setup causes duplicate-element query failures
7. **Snapshotting whole pages** — snapshots rot silently. Assert specific visible text/roles instead
8. **Skipping the 400/unauthorized cases** — most production bugs live in rejection paths, not happy paths
9. **Async assertions without `waitFor`/`findBy`** — `getByText` runs before state updates land; use `findBy*` variants
10. **Testing route handlers through `fetch("http://localhost:3000")`** — requires a running server in CI; call the exported handler function directly instead

---

## Tech Stack

- **Vitest** — runner (node + jsdom), coverage, workspace mode
- **@testing-library/react + user-event** — component/hook behavior testing
- **MSW v2** — network-level mocking of your own API
- **Supertest** — HTTP-level tests for Express/FastAPI companions
- **Testcontainers / disposable DATABASE_URL** — real Postgres for query-correctness tests
