---
name: project-blueprint
description: A coding pattern for starting and shaping any TypeScript application — single app vs pnpm monorepo, package boundaries, folder structure, Drizzle/Postgres schema design, the backend route shape (auth wrapper, Zod parsing, services, response and error helpers), env handling, tooling (Biome or ESLint, Knip, tsconfig), tests, CI and an AGENTS.md rulebook. Use when initializing a repo, scaffolding a new project or app, adding a package or workspace, designing database tables, deciding where code should live, or before any coding task in a repo that has no written conventions yet.
topics: [architecture, tooling]
---

# Project Blueprint

A repeatable way to lay out and write a TypeScript application, whatever it does. The pattern optimizes for three things: **every kind of code has one home, every input crosses one validated boundary, and every fact is written down once.**

Per-feature CRUD layers (endpoint → Zod → route → service → hook → component) follow `product-stack`. This skill covers what surrounds them: repo shape, packages, database design, backend boundaries, env, tooling and the written rules.

Examples use neutral resources (`projects`, `tasks`) and the scope `@app`. Rename them to the domain you are building.

---

## How the Code Reads

These habits apply to every file:

- **The smallest complete change.**
  - Prefer deleting code to adding it.
  - No options, wrappers or "for later" code nobody asked for.
  - Reuse the helper that already exists before writing a new one.
- **Thin edges, thick services.** Routes and components only wire things together. Logic lives in server services and pure helper files.
- **Small files with one responsibility.** Kebab-case names. About 200–250 lines at most; split along a responsibility seam, not at a line count.
- **Names over comments.**
  - No file-level docblocks and no comments that restate WHAT the code does.
  - A one-line WHY comment only where a reader would otherwise trip.
  - A known limitation gets one line saying the limit and when to fix it.
- **Types come from their source.** Use `z.infer` for inputs, `$inferSelect`/`$inferInsert` for rows, and enum unions from the enum. Never hand-write a type that duplicates one of these.
- **One way to do each thing.** One error shape, one HTTP client, one endpoints file, one env file. A second way is a bug waiting to happen.
- **Invariants belong in the database**, not in "check, then write" app code.

## Step 0: Pick the Shape

| Situation | Shape |
| --- | --- |
| One web app and its UI is the only API consumer | **Single app**: `product-stack` layout, route handlers or Server Actions |
| A separate API, a background worker, a second UI, or a CLI sharing types | **pnpm monorepo** |
| More than about 3 deployables or slow builds | Monorepo + Turborepo (cached `build` / `typecheck`) |
| Few deployables and fast builds | Monorepo + `pnpm -r` / `pnpm --filter` + `concurrently` for `dev` |

Don't start with a monorepo "for later". Split when the second deployable appears.

## Monorepo Layout

```
repo/
├── apps/
│   ├── web/                 # UI only: no route handlers, no DB imports
│   ├── api/                 # HTTP API
│   └── worker/              # background jobs (only if the product needs them)
├── packages/
│   ├── core/                # start here: db, schemas, server services, endpoints, lib
│   │                        # split later into db / contracts / auth when two apps need different slices
│   └── ui/                  # shared shadcn primitives, only once a second UI exists
├── docs/                    # ARCHITECTURE.md, DEPLOY.md
├── AGENTS.md                # the rulebook; CLAUDE.md is just `@AGENTS.md`
├── .env.example             # ONE env file for every app
├── pnpm-workspace.yaml
└── package.json             # dev / build / typecheck / test / check
```

**Package rules**

- Name every package `@<scope>/<name>`, one scope per repo.
- **Only the db package imports the database driver.** Everything else goes through it, so connection settings and transactions stay in one place.
- **The web app never imports server code** (db, server services, secrets). It reads shared schemas, types and endpoint constants only.
- **Exports:**
  - Source-consumed packages: `"exports": { "./*": "./src/*.ts" }`, no build step.
  - Build to `dist/` only what a non-TypeScript runtime consumes.
- **Public import paths are a contract.** Anything imported as `@scope/pkg/...` must keep working after a refactor.
- **Pin shared versions once** with the pnpm `catalog:`. Every `overrides` entry gets a one-line WHY (usually a security floor).
- **Root `package.json`:**
  - Set `"packageManager"` and `"engines"`.
  - Provide one `check` script (`lint && typecheck && knip && test`). CI runs exactly this.

## Database (Drizzle + Postgres)

Full examples are in [reference.md](reference.md).

1. **Files:** `schema/<domain>.ts`, one domain per file, re-exported from `schema/index.ts`. That barrel and package entry points are the only barrels.
2. **Every owned row has an owner column.** Use `user_id` when users own data alone, `org_id` (or `workspace_id`) when teams share it. Every query on an owned table filters on it. **Take the owner id from the session, never from the request body.**
3. **Timestamps:** `timestamp(..., { withTimezone: true }).notNull().defaultNow()`. Use `created_at` always, and `updated_at` on anything editable.
4. **Index every foreign key and every list query** (`owner_id, created_at`). Name indexes `<table>_<cols>_idx`; unique ones get `_uidx`.
5. **Invariants are constraints.** A rule like "one active subscription per user" or "one open ticket per customer" is a (partial) unique index. Then two racing requests cannot both win.
6. **Enums:** `text("status", { enum: [...] })` rather than `pgEnum`. A new value needs no migration.
7. **Foreign keys:** reference with thunks (`.references(() => projects.id, { onDelete: "cascade" })`), and always write `onDelete` explicitly.
8. **Soft delete only where history matters.** Add a `deleted_at` column plus partial indexes `WHERE deleted_at IS NULL`. Everything else is deleted for real.
9. **Types come from the schema** (`$inferSelect` / `$inferInsert`).
10. **Migrations:**
    - Run `drizzle-kit generate`, read the SQL diff, commit it, then `migrate`.
    - Use `push` only on a throwaway dev or CI database.
    - Set `strict: true`.
11. **Transactions:** use a pooled driver that supports them for any multi-write that must be all-or-nothing. Plain serverless HTTP drivers usually don't support them.
12. **Auth-library tables** keep that library's own naming. Your domain tables follow yours.

### Decide once per repo and write it in AGENTS.md

| Decision | Default | Alternative |
| --- | --- | --- |
| Primary key | `uuid("id").primaryKey().defaultRandom()` | `text("id")` + app-generated id when the id must exist before the insert |
| Table names | plural snake_case (`projects`) | singular (`project`) — never mix in one repo |
| TS property names | camelCase props → snake_case columns (`ownerId: uuid("owner_id")`) | snake_case props that mirror SQL |
| `relations()` | none; explicit joins | relational queries where nesting reads clearer |

## Backend Boundaries

Pick the HTTP layer by size:

- **Framework route handlers** (e.g. Next.js): one app (`product-stack`).
- **A small router with file routes** (e.g. Hono):
  - A separate API that should stay lean.
  - Each route is `routes/<path>/route.ts` exporting `GET`/`POST`/...; `[id]` maps to `:id`.
- **A DI framework** (e.g. Nest):
  - Many guards, permissions, API keys or rate limits per route.
  - One module, controller and service per domain, with pure helper files beside them.

Every route has the same shape, whatever the framework:

```
auth wrapper/guard → parse input with a shared Zod schema → call a server service → return through response helpers
```

- **Validation:** Zod at every boundary: HTTP body, query string, queue payload, webhook and env. Schemas are named `createProjectSchema`, with `type CreateProjectInput = z.infer<...>`. Parse with one helper (`safeParse` → `Errors.badRequest`, or `parseBody(schema, body)`).
- **One error shape for the whole API**, e.g. `{ success: false, error, details? }`, or `{ code, message, statusCode }` with snake_case `code`s mapped to messages in one file. Return or throw through helpers only, never a raw `Response.json`.
- **One success shape for the whole API**, e.g. `{ success: true, data }`, or the raw object, or `{ items }` for lists. Lists that can grow get keyset pagination (`next_cursor`), not offset.
- **Auth:** one wrapper (`withApiSession` / `protectedApi` / a guard) runs before the handler. Public routes go on a short, explicit allowlist.
- **Services** hold the logic and DB access, return data, and never touch HTTP or the UI.
- **Background work** goes to a durable queue or workflow engine, never a `void promise` inside a request. Start with a Postgres-backed queue; add more infrastructure only when Postgres is proven insufficient.
- **Versioning:** version APIs that outside clients call (`/api/v1/...`). An API only your own UI calls can stay unversioned.

## Client Data Layer

- **`config/api-endpoints.ts`** holds `API_ENDPOINTS` (UPPER keys, functions for ids) and `QUERY_KEYS`. Never write a path string anywhere else.
- **One HTTP client instance** with credentials and a 401 redirect. Services are object literals (`projectsService.list()`) that unwrap the response and do nothing else.
- **Hooks** (React Query) own the cache and the toasts. Components call hooks, never services.
- **Server components by default.** Use client-side fetching only where data must stay live. Build on shadcn/ui primitives.

## Env

- **One env file.** Keep `.env.local` + `.env.example` at the repo root for every app, never per-app copies. Each app loads the root file explicitly.
- **Validate at boot** with a Zod schema that reports every bad variable in one error.
- **Treat `""` as unset** (`||`, not `??`), so an empty optional key falls back to its default.
- **List every key** in `.env.example`, optional ones left empty, with no comments.
- **No duplicates:** one key per fact, never two names holding the same value.
- **One secret per job.** Session signing and data-at-rest encryption use separate secrets, so either can rotate without breaking the other.
- **Generate secrets** with `openssl rand -base64 32`.

## Tooling

- **Lint and format:**
  - Biome (fast, one tool), or ESLint flat config + `unused-imports` when you need custom rules such as `max-lines`.
  - Exclude vendored folders from both.
- **Knip** catches dead files, exports and dependencies. Delete what it finds; don't silence it.
- **tsconfig:**
  - Turn on `strict` and `noUncheckedIndexedAccess`.
  - Node packages use either NodeNext with relative `.js` imports, or bundler resolution with `@scope/pkg/...` subpaths. Pick one style.
- **Vendored UI** (shadcn and other registries) is added with its CLI and never hand-edited. Once you change a vendored piece, it is yours: move it out of the vendored folder and drop any duplicate primitives it carried.

## Tests and CI

- **Location:** tests live in `<pkg>/test/`, never in `src/`.
- **Runner:** Node's built-in runner (`node --import tsx --test 'test/**/*.test.ts'`); Vitest where you need its mocking.
- **What to test:**
  - New non-trivial logic gets at least one test: branches, parsers, money, security checks.
  - Trivial wiring needs none.
- **Database:** integration tests run against a throwaway Postgres (Docker or a CI service), never a shared or hosted database.
- **CI:** `pnpm install --frozen-lockfile` → `pnpm check`. Add an image build per deployable if you ship containers, plus a dependency vulnerability scan.

## AGENTS.md

Every repo gets one, and it **wins on conflict**. It holds:

1. Package manager and task runner.
2. Package map and import rules (who may import the db driver, what the web app may import).
3. The per-repo decisions from the table above (ids, naming, owner column, response shape).
4. Boundary rules ("Zod at every boundary", "owner id from the session").
5. Code style (file size, comments, no new barrels).
6. What is out of scope for this version.
7. Invariants that code review must enforce.

Files under `docs/` explain how things work; they never restate AGENTS.md rules. `CLAUDE.md` contains only `@AGENTS.md`.

---

## New Repo Checklist

1. Pick the shape (Step 0) and the per-repo decisions; write them into `AGENTS.md`.
2. Run `pnpm init`, then add `pnpm-workspace.yaml`, `packageManager`, `engines`, and the `catalog:`.
3. Create the db package (or `core`): client, `schema/index.ts`, auth tables, `drizzle.config.ts` (`strict: true`).
4. Add the shared Zod schemas and the env schema.
5. Create the API: auth wrapper, response/error helpers, input parsing helper, `/health`.
6. Create the web app: `config/api-endpoints.ts`, HTTP client, query client, providers, `shadcn init`.
7. Add root `.env.example` with every key, and `.env.local` with generated secrets.
8. Add tooling: Biome/ESLint, Knip, a base tsconfig, and the `check` script.
9. Add CI running `pnpm check`. Add Dockerfile/compose only once you deploy containers.
10. Write `README.md` (run it in three commands) and `docs/ARCHITECTURE.md` (layout + layers).

## Common Mistakes

1. **A monorepo on day one** for a single web app.
2. **The DB driver imported outside the db package.**
3. **Owner id read from the request body** instead of the session.
4. **Invariants enforced only in code** ("check, then insert") instead of a unique or partial index.
5. **`pgEnum`** for values that will grow; every new value costs a migration.
6. **Missing foreign key indexes.** Drizzle doesn't create them.
7. **`db:push` against production.** Generate, review, migrate.
8. **Per-app env files**, or two keys holding the same value.
9. **Two error shapes** in one API.
10. **Fire-and-forget promises** for work that must finish.
11. **Rules scattered** across README, docs and comments instead of one AGENTS.md.
12. **Abstractions, options or config built "for later".** Add them when the second caller exists.
