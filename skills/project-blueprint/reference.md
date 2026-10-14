# Project Blueprint — Reference

Code for the rules in [SKILL.md](SKILL.md). Load it when writing the first files of a repo or a new package. Examples use the scope `@app` and a `projects` / `tasks` domain; rename both to fit what you are building.

---

## pnpm-workspace.yaml

```yaml
packages:
  - apps/*
  - packages/*

catalog:
  drizzle-orm: ^0.45.0
  drizzle-kit: ^0.31.0
  zod: ^4.0.0
  typescript: ~6.0.0
```

A package depends on `"zod": "catalog:"`, so a version bump happens in one place.

## Root package.json

```json
{
  "name": "app",
  "private": true,
  "packageManager": "pnpm@11.0.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "biome check",
    "knip": "knip --no-progress",
    "check": "pnpm lint && pnpm typecheck && pnpm knip && pnpm test"
  }
}
```

Without Turborepo: `"dev": "concurrently -n api,web \"pnpm --filter api dev\" \"pnpm --filter web dev\""` and `"typecheck": "pnpm -r typecheck"`.

## Source-consumed package

```json
{
  "name": "@app/core",
  "private": true,
  "type": "module",
  "exports": { "./*": "./src/*.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test 'test/**/*.test.ts'"
  }
}
```

Imports then read `@app/core/db/projects` or `@app/core/schemas/projects`, never `../../../packages/core/src/...`.

---

## DB client

```typescript
// packages/core/src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

export const db = drizzle({ client: new Pool({ connectionString: url, max: 10 }), schema });
```

Use a pooled (TCP or WebSocket) driver in long-running servers so `db.transaction` works. Serverless HTTP drivers usually can't run transactions.

## drizzle.config.ts

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  strict: true,
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

## Domain table

```typescript
// packages/core/src/db/schema/projects.ts
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // text enum: a new value needs no migration
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("projects_owner_created_idx").on(t.ownerId, t.createdAt),
    uniqueIndex("projects_owner_slug_uidx").on(t.ownerId, t.slug),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectStatus = Project["status"];
```

## Invariant as a partial unique index

```typescript
// "a project has at most one running task"
uniqueIndex("tasks_project_running_uidx")
  .on(t.projectId)
  .where(sql`${t.status} = 'running'`),
```

Two requests that race to start a task now get a unique violation instead of two running tasks. Catch it (`23505`) and answer "already running".

## Owner scoping

```typescript
// every query on an owned table carries the owner filter, taken from the session
await db
  .select()
  .from(projects)
  .where(and(eq(projects.ownerId, session.user.id), eq(projects.id, id)));
```

A small helper that injects the filter into every select/insert/update is worth it once a team grows. Until then, the one-line rule plus code review is enough.

## Transaction for a multi-write

```typescript
await db.transaction(async (tx) => {
  const [project] = await tx.insert(projects).values(input).returning();
  await tx.insert(tasks).values(defaultTasks(project.id));
});
```

---

## Response and error helpers

```typescript
// lib/response/server-response.ts
export function successResponse<T>(data: T, message?: string, status = 200): Response {
  return Response.json({ success: true as const, data, ...(message ? { message } : {}) }, { status });
}

function errorResponse(error: string, status: number, details?: unknown): Response {
  return Response.json({ success: false, error, ...(details !== undefined ? { details } : {}) }, { status });
}

export const Errors = {
  badRequest: (error = "Bad request", details?: unknown) => errorResponse(error, 400, details),
  unauthorized: (error = "Unauthorized") => errorResponse(error, 401),
  forbidden: (error = "Forbidden") => errorResponse(error, 403),
  notFound: (error = "Not found") => errorResponse(error, 404),
  conflict: (error = "Conflict") => errorResponse(error, 409),
  tooManyRequests: (error = "Too many requests") => errorResponse(error, 429),
  server: (error = "Internal server error") => errorResponse(error, 500),
};
```

Exception-based variant (DI frameworks): throw `new NotFoundException({ code: "project_not_found" })`. One global exception filter maps each `code` to a message from a single `ERROR_MESSAGES` map and always returns `{ code, message, statusCode, issues? }`.

## Route

```typescript
// routes/projects/route.ts (file router) or app/api/projects/route.ts (Next.js)
export async function POST(request: Request) {
  return withApiSession(request, async (session) => {
    const parsed = createProjectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Errors.badRequest("Invalid project.", parsed.error.flatten());
    const project = await createProject(session.user.id, parsed.data);
    return successResponse({ project }, undefined, 201);
  });
}
```

## File-route discovery (small router)

```typescript
const routesDir = fileURLToPath(new URL("./routes", import.meta.url));
// static paths first, so /projects/archived wins over /projects/:id
const files = globSync("**/route.ts", { cwd: routesDir }).toSorted(
  (a, b) => a.split("[").length - b.split("[").length,
);
for (const file of files) {
  const path = `/api/${file
    .replace(/\/?route\.ts$/, "")
    .replace(/\[\.\.\.\w+\]/g, "*")
    .replace(/\[(\w+)\]/g, ":$1")}`;
  const mod = await import(`./routes/${file}`);
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
    const handler = mod[method];
    if (handler) app.on(method, path, (c) => handler(c.req.raw, { params: Promise.resolve(c.req.param()) }));
  }
}
```

## Controller (DI framework)

```typescript
@Controller("api/v1/projects")
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  @UseGuards(SessionGuard)
  async list(@Req() req: AuthedRequest) {
    return { items: await this.projects.list(req.user.id) };
  }
}
```

## Env validation

```typescript
// shared/env.ts
export function parseEnvOrThrow<T extends z.ZodTypeAny>(schema: T, env = process.env): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid env:\n${lines.join("\n")}`);
}

const optional = z.string().optional().transform((v) => v || undefined);

// api/src/config/env.ts
export const env = parseEnvOrThrow(
  z.object({
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    ENCRYPTION_SECRET: z.string().min(32),
    WEB_URL: z.string().url(),
    SMTP_API_KEY: optional,
  }),
);
```

## Endpoints + query keys

```typescript
// config/api-endpoints.ts
export const API_ENDPOINTS = {
  PROJECTS: {
    LIST: "/api/projects",
    GET: (id: string) => `/api/projects/${id}`,
  },
} as const;

export const QUERY_KEYS = {
  PROJECTS: {
    ALL: ["projects"] as const,
    DETAIL: (id: string) => ["projects", "detail", id] as const,
  },
} as const;
```

## AGENTS.md skeleton

```markdown
# AGENTS.md: single source of truth, wins on conflict

1. pnpm only. Workspaces: apps/*, packages/*. <Turborepo | pnpm -r + concurrently>.
2. Packages are @app/*. Only the db package imports the database driver. apps/web never imports server code.
3. DB: uuid ids, plural snake_case tables, camelCase props, text enums, owner column on every owned table,
   index every FK, invariants as (partial) unique indexes, generate + review migrations (no push on prod).
4. Zod at every HTTP / queue / env boundary. Owner id from the session, never the body.
5. Routes: auth wrapper → parse → service → response helpers. One error shape, one success shape.
6. Background work goes to a durable queue. No new infrastructure until Postgres is proven insufficient.
7. Files: kebab-case, ≤ 250 lines, no file docblocks, one-line WHY comments only. Tests in <pkg>/test/.
8. Not in v1: <list>.
```
