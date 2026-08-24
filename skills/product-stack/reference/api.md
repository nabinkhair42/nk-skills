# Product Stack — API Reference

Full code for Layers 1–8 of the product-stack flow. Load this file when implementing endpoints, services, hooks, or route handlers.

---

## Layer 1: API Endpoints

All API paths live in one file. No hardcoded strings in services or components.

```typescript
// config/api-endpoints.ts

export const API_ENDPOINTS = {
  AUTH: {
    SIGN_IN: "/api/auth/sign-in",
    SIGN_OUT: "/api/auth/sign-out",
    SESSION: "/api/auth/session",
  },

  // Static paths for collection endpoints
  // Function paths for item endpoints with dynamic IDs
  PROJECTS: {
    LIST: "/api/projects",
    CREATE: "/api/projects",
    GET: (id: string) => `/api/projects/${id}`,
    UPDATE: (id: string) => `/api/projects/${id}`,
    DELETE: (id: string) => `/api/projects/${id}`,
  },
};

// React Query key factory - colocated with endpoints
export const QUERY_KEYS = {
  PROJECTS: ["projects"],
  PROJECT: (id: string) => ["projects", id],
};
```

**Rules:**

- Group endpoints by resource with comments
- Static paths for collections (`LIST`, `CREATE`)
- Function paths for items (`GET`, `UPDATE`, `DELETE`) that take an `id` parameter
- `QUERY_KEYS` mirror the endpoint structure for cache management
- Never construct API paths outside this file

---

## Layer 2: Axios Instance

One configured axios instance for the entire app. Auth and error handling happen in interceptors, not in individual service calls.

```typescript
// config/axios.ts

import axios, { AxiosError } from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Cookie-first auth: the session cookie rides automatically via withCredentials.
// Do NOT read tokens from localStorage and set Authorization headers here —
// localStorage is readable by any injected script (XSS). If a bearer-token
// provider is unavoidable, keep the token in an httpOnly cookie and proxy it,
// never expose it to client JS.

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      window.location.href = "/sign-in";
    }
    return Promise.reject(error);
  },
);

export default api;
```

**Rules:**

- One axios instance, one file
- Auth via session cookies (`withCredentials: true`), not localStorage tokens — see `auth-stack`
- Response interceptor handles 401 redirect globally
- Services import `api` from this file, never create their own instances

---

## Layer 3: Zod Schemas

Schemas define validation AND generate TypeScript types. One file per resource.

```typescript
// schemas/project.ts

import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  status: z.enum(["active", "archived", "draft"]).default("draft"),
  url: z
    .string()
    .transform((val) => val.replace(/\/+$/, "").trim())
    .pipe(z.string().url("Enter a valid URL"))
    .optional(),
});

// Update schema: same fields but all optional
export const updateProjectSchema = createProjectSchema.partial();

// Infer types from schemas - never define these manually
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
```

**Rules:**

- Use `z.transform()` for data normalization (trim, lowercase, strip protocol)
- Use `.pipe()` to chain validators after transforms
- Use `.superRefine()` for cross-field validation
- Derive update schemas with `.partial()`
- Always use `z.infer<typeof schema>` for types, never duplicate manually
- One schema file per resource in `schemas/`

---

## Layer 4: Frontend Services

Services are thin wrappers around axios. One function per API call. No business logic.

```typescript
// services/project.service.ts

import { API_ENDPOINTS } from "@/config/api-endpoints";
import api from "@/config/axios";
import type { ApiResponse, PaginatedData } from "@/types";
import type { CreateProjectInput, UpdateProjectInput } from "@/schemas/project";

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
}

export const projectService = {
  getAll: async (page = 1, limit = 10) => {
    const response = await api.get<ApiResponse<PaginatedData<Project>>>(
      API_ENDPOINTS.PROJECTS.LIST,
      { params: { page, limit } },
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Project>>(
      API_ENDPOINTS.PROJECTS.GET(id),
    );
    return response.data;
  },

  create: async (data: CreateProjectInput) => {
    const response = await api.post<ApiResponse<Project>>(
      API_ENDPOINTS.PROJECTS.CREATE,
      data,
    );
    return response.data;
  },

  update: async (id: string, data: UpdateProjectInput) => {
    const response = await api.put<ApiResponse<Project>>(
      API_ENDPOINTS.PROJECTS.UPDATE(id),
      data,
    );
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<ApiResponse<{ id: string }>>(
      API_ENDPOINTS.PROJECTS.DELETE(id),
    );
    return response.data;
  },
};
```

**Rules:**

- Export a single object with all methods for the resource
- Every method returns `response.data` (unwraps axios response wrapper)
- Type the response with `ApiResponse<T>` generic
- Use input types from Zod schemas, not manual interfaces
- No error handling here, that is the hook's job
- No toast, no redirect, no side effects

---

## Layer 5: React Query Hooks

Hooks wrap services with React Query. One file per resource. All cache management happens here.

```typescript
// hooks/use-projects.ts

"use client";

import { QUERY_KEYS } from "@/config/api-endpoints";
import { projectService } from "@/services/project.service";
import type { CreateProjectInput, UpdateProjectInput } from "@/schemas/project";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/pill-toaster";

// READ - list (paginated). Accept a params object so hooks stay forward-compatible
// with extra query params (sort/filter — see data-table-pattern)
export function useProjects(params: { page?: number; limit?: number; enabled?: boolean } = {}) {
  const { page = 1, limit = 10, enabled = true } = params;
  return useQuery({
    queryKey: [...QUERY_KEYS.PROJECTS, { page, limit }],
    queryFn: () => projectService.getAll(page, limit),
    enabled,
  });
}

// READ - single
export function useProject(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PROJECT(id),
    queryFn: () => projectService.getById(id),
    enabled: !!id,
  });
}

// CREATE
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectInput) => projectService.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROJECTS });
      toast.success(response.message || "Project created");
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || "Failed to create project");
    },
  });
}

// UPDATE
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectInput }) =>
      projectService.update(id, data),
    onSuccess: (response, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROJECTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROJECT(id) });
      toast.success(response.message || "Project updated");
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || "Failed to update project");
    },
  });
}

// DELETE
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => projectService.delete(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROJECTS });
      toast.success(response.message || "Project deleted");
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || "Failed to delete project");
    },
  });
}
```

**Rules:**

- `useQuery` for reads, `useMutation` for writes
- `queryKey` always from `QUERY_KEYS` factory
- `enabled: !!id` to prevent fetching with empty IDs
- `onSuccess`: update cache + toast
- **Cache strategy is either/or per mutation:** default to `invalidateQueries`. If a flow adopts `optimistic-cache-pattern` (instant UI, no refetch), replace that mutation's invalidations with `setQueryData`/`setQueriesData` entirely — never combine both in one `onSuccess`
- Never call services directly from components, always through hooks
- TanStack Query v5: use `isPending` not `isLoading` for mutation loading states
- Define `QueryClient` outside components (in `query-provider.tsx`), never inside a component body

---

## Layer 6: API Route Handlers

Route handlers validate input, call server services, and return formatted responses.

```typescript
// app/api/projects/route.ts

import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { protectedApi } from "@/lib/middleware/api-middleware";
import {
  Errors,
  getPaginationParams,
  paginatedResponse,
  successResponse,
} from "@/lib/response/server-response";
import { createProjectSchema } from "@/schemas/project";
import { count, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

// GET /api/projects - List with pagination
export const GET = protectedApi(async (request: NextRequest, user) => {
  const { searchParams } = request.nextUrl;
  const { page, limit, offset } = getPaginationParams(searchParams);

  const [[{ value: total }], rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(projects)
      .where(eq(projects.userId, user.id)),
    db
      .select()
      .from(projects)
      .where(eq(projects.userId, user.id))
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  return paginatedResponse(rows, total, page, limit);
});

// POST /api/projects - Create
export const POST = protectedApi(async (request: NextRequest, user) => {
  const body = await request.json();

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.badRequest(
      parsed.error.issues[0]?.message || "Invalid input",
    );
  }

  const [project] = await db
    .insert(projects)
    .values({ ...parsed.data, userId: user.id })
    .returning();

  return successResponse(project, "Project created", { status: 201 });
});
```

```typescript
// app/api/projects/[id]/route.ts

import { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/[id]
export const GET = protectedApi(
  async (_request: NextRequest, user, ctx: Params) => {
    const { id } = await ctx.params;

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) return Errors.notFound("Project not found");
    if (project.userId !== user.id) return Errors.forbidden();

    return successResponse(project);
  },
);

// PUT /api/projects/[id]
export const PUT = protectedApi(
  async (request: NextRequest, user, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await request.json();

    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return Errors.badRequest(
        parsed.error.issues[0]?.message || "Invalid input",
      );
    }

    const [updated] = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();

    return successResponse(updated, "Project updated");
  },
);

// DELETE /api/projects/[id]
export const DELETE = protectedApi(
  async (_request: NextRequest, user, ctx: Params) => {
    const { id } = await ctx.params;

    await db.delete(projects).where(eq(projects.id, id));

    return successResponse({ id }, "Project deleted");
  },
);
```

**Rules:**

- Wrap handlers with `protectedApi` or `adminApi` middleware
- Always validate body with `schema.safeParse()` before processing
- Use `Errors.badRequest()`, `Errors.notFound()`, etc. for error responses
- Use `successResponse(data, message, options)` for success responses
- Use `paginatedResponse(items, total, page, limit)` for list endpoints
- `ctx.params` is a `Promise` in Next.js 15+, always `await` it
- Parallel queries with `Promise.all()` when fetching count + rows

---

## Layer 7: Response Helpers

Consistent response format across all API routes.

```typescript
// lib/response/server-response.ts

import { NextResponse } from "next/server";

export function successResponse<T>(
  data: T,
  message?: string,
  options: { status?: number; headers?: Record<string, string> } = {},
) {
  return NextResponse.json(
    { success: true, data, message },
    { status: options.status || 200, headers: options.headers },
  );
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
  message?: string,
) {
  const totalPages = Math.ceil(total / limit);
  return NextResponse.json({
    success: true,
    data: {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
    message,
  });
}

export function errorResponse(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export const Errors = {
  badRequest: (msg = "Bad request") => errorResponse(msg, 400),
  unauthorized: (msg = "Unauthorized") => errorResponse(msg, 401),
  forbidden: (msg = "Forbidden") => errorResponse(msg, 403),
  notFound: (msg = "Not found") => errorResponse(msg, 404),
  conflict: (msg = "Conflict") => errorResponse(msg, 409),
  internal: (msg = "Internal server error") => errorResponse(msg, 500),
};

export function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "10")),
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
```

---

## Layer 8: Shared Types

```typescript
// types/index.ts

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  meta: PaginationMeta;
}
```

---

## When to Use Server Actions vs API Routes

Not every mutation needs the Axios -> Service -> Hook flow. Use **Server Actions** for simple internal mutations. Use **API Route Handlers** when external clients need access.

| Use case                                           | Pattern           |
| -------------------------------------------------- | ----------------- |
| Form submission from your app                      | Server Action     |
| Simple create/update/delete from a dialog          | Server Action     |
| External API consumed by mobile app or third party | API Route Handler |
| Webhook endpoint                                   | API Route Handler |
| Cacheable GET endpoint                             | API Route Handler |
| Complex multi-step mutation with streaming         | API Route Handler |

```typescript
// app/actions/project.ts
"use server";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { createProjectSchema } from "@/schemas/project";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
  const parsed = createProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  await db.insert(projects).values({ ...parsed.data, userId: "..." });
  revalidatePath("/dashboard");
}
```

**Rule of thumb:** if your frontend is the only consumer, prefer Server Actions. If anything else calls it, use an API route.

---

## Server Components and Data Fetching

Pages and layouts are Server Components by default. Fetch data where you render it, not in a parent that passes props down.

```typescript
// app/dashboard/page.tsx (Server Component - no "use client")
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProjectList } from "@/components/projects/project-list";

export default async function DashboardPage() {
  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, "..."))
    .orderBy(projects.createdAt);

  // Pass server-fetched data to client component as props
  return <ProjectList initialData={userProjects} />;
}
```

**Rules:**

- Default to Server Components. Only add `"use client"` when you need interactivity (state, effects, event handlers)
- Fetch data directly in Server Components using Drizzle, no need for API routes or services
- Wrap slow data fetches in `<Suspense>` so fast parts render immediately
- `params` and `searchParams` are Promises in Next.js 15+, always `await` them
- Keep the `"use client"` boundary as close to the leaf as possible
