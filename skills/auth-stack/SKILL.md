---
name: auth-stack
description: Authentication and authorization architecture for Next.js product apps. Better Auth as the default self-hosted option (email/password, OAuth, roles, admin plugin) with Drizzle, plus a Clerk fast-path. Covers server/session resolution, the protectedApi boundary from product-stack, route protection, and role-based access. Use when adding sign-in/sign-up, sessions, OAuth, protected routes, user management, or role checks to an app.
topics: [architecture, tooling]
---

# Auth Stack

One pattern for wiring authentication into a `product-stack` app: resolve the session once at the API middleware boundary (`protectedApi`), scope every DB query by `user.id`, and never trust client-sent identity fields.

**Default choice: Better Auth** (self-hosted, your Postgres, no vendor lock-in). Use **Clerk** when speed-to-ship beats data ownership (prototypes, internal tools).

---

## Rule Zero: One Identity Boundary

All authorization flows through one place:

```
Request → protectedApi(handler) → session resolved here → handler receives `user`
```

Route handlers never call the auth library directly. Components never receive more than `{ id, name, role }`. Every DB query filters by `userId` — ownership is enforced in queries, not just at the route level.

```typescript
// lib/middleware/api-middleware.ts (Better Auth variant)

import { auth } from "@/auth";
import { Errors } from "@/lib/response/server-response";
import { NextResponse } from "next/server";
import type { Session, User } from "better-auth";

type AuthedHandler<UserType extends { id: string } = User> = (
  request: Request,
  user: UserType,
  session: Session,
  ctx?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse> | NextResponse;

export function protectedApi(handler: AuthedHandler) {
  return async (request: Request, ctx?: { params: Promise<Record<string, string>> }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session) return Errors.unauthorized();
    return handler(request, session.user, session.session, ctx);
  };
}

export function adminApi(handler: AuthedHandler) {
  return async (request: Request, ctx?: { params: Promise<Record<string, string>> }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return Errors.unauthorized();
    if (session.user.role !== "admin") return Errors.forbidden();
    return handler(request, session.user, session.session, ctx);
  };
}
```

---

## Option A: Better Auth (default)

### Install + Schema

```bash
pnpm add better-auth
npx @better-auth/cli generate   # emits/patches Drizzle schema for user, session, account, verification
pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

The generated tables go in `db/schema/auth.ts` and barrel-export from `db/schema/index.ts` (product-stack Layer 1). The `user` table is the FK target for all domain tables' `userId` columns.

### Server Config

```typescript
// auth.ts (project root)

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [admin()], // adds role, banned, banReason to user + admin endpoints
});
```

### Route Handler

```typescript
// app/api/auth/[...all]/route.ts

import { auth } from "@/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

This serves `/api/auth/sign-in`, `/api/auth/sign-up`, `/api/auth/get-session`, OAuth callbacks, etc. Note it lives under the same `/api/auth` prefix as `API_ENDPOINTS.AUTH` in `config/api-endpoints.ts` — keep them in sync.

### Client

```typescript
// lib/auth-client.ts

"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

```tsx
// Sign up / sign in / session hook
const { data: session, isPending } = authClient.useSession();

await authClient.signUp.email({
  email, password, name,
});
await authClient.signIn.email({ email, password });
await authClient.signIn.social({ provider: "github" });
await authClient.signOut();
```

### Server-Side Session (layouts, Server Components)

```typescript
import { auth } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <>{children}</>;
}
```

### Roles

With the `admin()` plugin: `session.user.role` is `"admin" | "user"` by default. Gate with `adminApi` (above). For custom roles pass `admin({ defaultRole: "user", adminRoles: ["admin", "owner"] })`. Check roles in queries too when data must be isolated by role.

---

## Option B: Clerk (fast path)

```bash
pnpm add @clerk/nextjs
```

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect(); // redirects unauthenticated users
});

export const config = { matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"] };
```

```typescript
// app/layout.tsx — wrap once
import { ClerkProvider } from "@clerk/nextjs";

<ClerkProvider>{children}</ClerkProvider>
```

Server session in handlers/layouts: `const { userId } = await auth()` (async in Clerk v5+), full user via `await currentUser()`. UI gates: `<SignedIn>` / `<SignedOut>` / `<UserButton />`.

For the `protectedApi` boundary with Clerk, resolve `auth()` inside the wrapper instead of `auth.api.getSession`.

Clerk's `userId` is the FK target for domain tables — store it as `text`, not uuid.

---

## Choosing Between Them

| Factor                    | Better Auth            | Clerk                  |
| ------------------------- | ---------------------- | ---------------------- |
| Data location             | Your Postgres          | Clerk's servers        |
| Cost                      | Free                   | Free tier → MAU pricing |
| Setup time                | ~1 hour                | ~15 minutes            |
| Custom user fields        | Native (your schema)   | `unsafeMetadata` or dashboard |
| Self-host requirement     | Met                     | Not met                |

---

## Common Mistakes

1. **Trusting client identity** — never accept `userId` from request body/query. Always take it from the resolved session (`user.id`)
2. **Ownership checked outside the query** — `if (project.userId !== user.id)` after fetching is not enough; filter `.where(and(eq(id), eq(userId)))` so missing rows 404 without leaking existence
3. **DB calls in `middleware.ts`** — Edge runtime + per-request DB hits = slow and fragile. In middleware do cookie-level redirects only (or nothing); enforce real auth in `protectedApi`/layouts
4. **Skipping revalidation of session-dependent caches** — after role changes or bans, cached responses may still serve old privileges. Keep permission cache TTLs within your revocation tolerance
5. **Hand-rolling password hashing/sessions** — don't. Both providers handle storage, rotation, and timing-safe comparison
6. **Mixing identity sources** — one app, one provider. Migrating mid-project? Map old IDs to new in a lookup table before switching FKs over
7. **Forgetting the OAuth callback route** — social providers need the callback URL registered exactly (`{APP_URL}/api/auth/callback/{provider}`)
8. **Storing tokens client-side for Better Auth** — default is cookie-session; don't also stuff the session into localStorage (XSS surface)

---

## Tech Stack

- **Better Auth** — self-hosted auth (sessions, OAuth, plugins); verify current APIs against https://www.better-auth.com/docs — the library moves fast
- **Clerk** — hosted auth alternative (@clerk/nextjs)
- **Drizzle ORM** — generated auth tables live beside domain schemas
- **product-stack** — consumes auth through `protectedApi` / `adminApi` only
