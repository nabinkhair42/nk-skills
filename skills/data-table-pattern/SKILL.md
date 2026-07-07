---
name: data-table-pattern
description: Production data tables with TanStack Table v8, shadcn/ui, URL-synced state, and server-side operations. Use when building admin dashboards, list views, CRM tables, or any sortable/filterable/paginated data grid. Integrates with product-stack API shapes and React Query hooks.
topics: [react-patterns, architecture]
---

# Data Table Pattern

The standard for SaaS list views in 2026: **TanStack Table v8** for headless logic, **shadcn/ui** for styling, **URL state** for shareable views, and **server-side operations** for real datasets.

Pairs with `product-stack` (API routes, hooks, `PaginatedData<T>`) and `optimistic-cache-pattern` (instant row updates, cache sync on mutations).

---

## File Structure

```
src/components/
├── ui/
│   └── data-table/
│       ├── data-table.tsx           # Main orchestrator
│       ├── data-table-column-header.tsx
│       ├── data-table-faceted-filter.tsx
│       ├── data-table-pagination.tsx
│       ├── data-table-toolbar.tsx
│       └── data-table-bulk-actions.tsx
└── {resource}/
    ├── {resource}-columns.tsx       # ColumnDef per resource
    └── {resource}-table.tsx       # Feature table wrapper
```

One `columns.tsx` per resource. Never define columns inline in page files.

---

## Column Definitions

```tsx
// components/projects/project-columns.tsx

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Project } from "@/db/schema/projects";

export const projectColumns: ColumnDef<Project>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return <Badge variant="outline">{status}</Badge>;
    },
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id)),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as Date;
      return date.toLocaleDateString();
    },
  },
];
```

**Rules:**

- Always use `DataTableColumnHeader` for sortable columns
- `filterFn` for faceted filters — return boolean
- `size` on select/actions columns to prevent layout shift
- Row actions go in a final column with `enableSorting: false`

---

## URL-Synced Table State

Sync sort, filter, pagination to URL so views are shareable and survive refresh.

```tsx
// hooks/use-table-url-state.ts

"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { SortingState, ColumnFiltersState } from "@tanstack/react-table";

export function useTableUrlState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "10");
  const sort = searchParams.get("sort") ?? "createdAt";
  const order = (searchParams.get("order") ?? "desc") as "asc" | "desc";

  const sorting: SortingState = useMemo(
    () => [{ id: sort, desc: order === "desc" }],
    [sort, order],
  );

  const statusFilter = searchParams.get("status")?.split(",").filter(Boolean) ?? [];

  const columnFilters: ColumnFiltersState = useMemo(
    () => (statusFilter.length ? [{ id: "status", value: statusFilter }] : []),
    [statusFilter],
  );

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return { page, limit, sorting, columnFilters, setParams };
}
```

**Rules:**

- `router.replace` not `push` — avoid polluting browser history on every filter change
- `{ scroll: false }` — table filters should not scroll the page
- Reset `page` to `1` when sort or filters change
- Comma-separate multi-value filters: `?status=active,draft`

---

## Feature Table Wrapper

```tsx
// components/projects/project-table.tsx

"use client";

import { useProjects } from "@/hooks/use-projects";
import { useTableUrlState } from "@/hooks/use-table-url-state";
import { DataTable } from "@/components/ui/data-table/data-table";
import { projectColumns } from "./project-columns";
import { DataTableToolbar } from "@/components/ui/data-table/data-table-toolbar";

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
];

export function ProjectTable() {
  const { page, limit, sorting, columnFilters, setParams } = useTableUrlState();

  const sort = sorting[0]?.id ?? "createdAt";
  const order = sorting[0]?.desc ? "desc" : "asc";
  const status = (columnFilters.find((f) => f.id === "status")?.value as string[]) ?? [];

  const { data, isPending } = useProjects({ page, limit, sort, order, status });

  return (
    <DataTable
      columns={projectColumns}
      data={data?.data.items ?? []}
      pageCount={data?.data.meta.totalPages ?? 0}
      rowCount={data?.data.meta.total ?? 0}
      isLoading={isPending}
      sorting={sorting}
      columnFilters={columnFilters}
      onSortingChange={(updater) => {
        const next = typeof updater === "function" ? updater(sorting) : updater;
        const col = next[0];
        setParams({
          sort: col?.id ?? "createdAt",
          order: col?.desc ? "desc" : "asc",
          page: "1",
        });
      }}
      onColumnFiltersChange={(updater) => {
        const next = typeof updater === "function" ? updater(columnFilters) : updater;
        const statusVal = next.find((f) => f.id === "status")?.value as string[] | undefined;
        setParams({
          status: statusVal?.length ? statusVal.join(",") : null,
          page: "1",
        });
      }}
      onPaginationChange={(pageIndex, pageSize) => {
        setParams({ page: String(pageIndex + 1), limit: String(pageSize) });
      }}
      toolbar={
        <DataTableToolbar
          filterColumn="status"
          filterOptions={STATUS_OPTIONS}
          searchPlaceholder="Filter projects..."
        />
      }
    />
  );
}
```

---

## Server-Side API (product-stack integration)

Extend route handlers to accept table query params:

```typescript
// app/api/projects/route.ts — GET additions

const sort = searchParams.get("sort") ?? "createdAt";
const order = searchParams.get("order") ?? "desc";
const status = searchParams.get("status")?.split(",").filter(Boolean) ?? [];

const sortColumn = projects[sort as keyof typeof projects] ?? projects.createdAt;
const orderFn = order === "asc" ? asc : desc;

let query = db
  .select()
  .from(projects)
  .where(eq(projects.userId, user.id));

if (status.length) {
  query = query.where(inArray(projects.status, status));
}

const rows = await query
  .orderBy(orderFn(sortColumn))
  .limit(limit)
  .offset(offset);
```

Extend the hook to pass table params:

```typescript
// hooks/use-projects.ts

export function useProjects(params: {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  status?: string[];
  enabled?: boolean;
} = {}) {
  const { page = 1, limit = 10, sort, order, status, enabled = true } = params;

  return useQuery({
    queryKey: [...QUERY_KEYS.PROJECTS, { page, limit, sort, order, status }],
    queryFn: () => projectService.getAll({ page, limit, sort, order, status }),
    enabled,
  });
}
```

---

## Bulk Actions

Show toolbar only when rows are selected:

```tsx
// components/ui/data-table/data-table-bulk-actions.tsx

interface BulkActionToolbarProps {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BulkActionToolbar({ selectedCount, onClear, children }: BulkActionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
      <span className="text-sm text-muted-foreground">
        {selectedCount} selected
      </span>
      {children}
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
```

Clear row selection when `data` changes (after delete mutation):

```tsx
useEffect(() => {
  table.resetRowSelection();
}, [data, table]);
```

---

## Virtualization (100+ rows)

For client-side tables or when server returns large pages:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => tableContainerRef.current,
  estimateSize: () => 48,
  overscan: 10,
});
```

**When to virtualize:**

| Row count | Strategy |
| --- | --- |
| < 100 | No virtualization |
| 100–1,000 | Client virtualization |
| 1,000+ | Server-side pagination + virtualization |

---

## Mutation Cache Sync

After bulk delete or inline edit, update cache without refetch (from `optimistic-cache-pattern`):

```tsx
onSuccess: (_, deletedIds: string[]) => {
  queryClient.setQueriesData({ queryKey: QUERY_KEYS.PROJECTS }, (old) => {
    if (!old?.data) return old;
    return {
      ...old,
      data: {
        ...old.data,
        items: old.data.items.filter((p) => !deletedIds.includes(p.id)),
        meta: { ...old.data.meta, total: old.data.meta.total - deletedIds.length },
      },
    };
  });
};
```

---

## Adding a New Table Checklist

1. **Columns** — `components/{resource}/{resource}-columns.tsx`
2. **Table wrapper** — `components/{resource}/{resource}-table.tsx`
3. **API params** — extend GET route handler with sort/filter/pagination
4. **Service** — pass query params to axios `params`
5. **Hook** — include params in `queryKey` and `queryFn`
6. **Page** — render `<ResourceTable />` in dashboard page

---

## Common Mistakes

1. **Client-side sort on server data** — sort on the server when dataset exceeds one page
2. **Missing params in queryKey** — stale data when filters change; every param must be in the key
3. **`router.push` for filters** — pollutes history; use `replace`
4. **Inline column definitions** — hard to test and reuse; always separate file
5. **No loading skeleton** — show skeleton rows matching column layout, not a spinner
6. **Bulk delete without cache update** — triggers unnecessary refetch; use `setQueriesData`
7. **4-column grid on mobile** — wrap in `overflow-x-auto` with `min-w-[600px]` inner container
