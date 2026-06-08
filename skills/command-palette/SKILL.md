---
name: command-palette
description: Build a ⌘K command palette with cmdk and shadcn/ui. Apply when adding global search, quick actions, navigation, or a Linear/Vercel/Raycast-style command menu to a Next.js app. Covers the global keyboard listener, dialog structure, fuzzy filtering, nested pages, async/dynamic results, recent items, and the accessibility details that make it feel native.
topics: [design-systems, react-patterns]
---

# Command Palette

A ⌘K command palette — the keyboard-first menu Linear, Vercel, Raycast, and GitHub use for navigation and quick actions. Built on **cmdk** (the unstyled command-menu primitive) wrapped by **shadcn/ui**'s `Command` component.

The core idea: **one keyboard shortcut surfaces everything** — pages, actions, search results, settings — in a single filtered, keyboard-navigable list. It replaces a dozen buried menu items.

---

## Principles

1. **Keyboard-first, mouse-optional** — every action reachable by typing + Enter. Arrow keys, Enter, and Escape must all work without touching the mouse.
2. **One dialog, many sources** — pages, actions, and async results live in one list, separated by groups, not in separate menus.
3. **Filter is forgiving** — substring/fuzzy match on a human label, not exact prefix. "set bil" should find "Billing settings".
4. **Always close the loop** — selecting an item runs it _and_ closes the dialog (unless it opens a sub-page).
5. **Show, then resolve** — render static items instantly; stream async results (search) in as they arrive without blocking the static ones.
6. **Empty is a state** — design the empty/loading/no-results views; they're seen constantly.

---

## Setup

```bash
npx shadcn@latest add command dialog
```

This installs `cmdk` and shadcn's wrapper exporting `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, and `CommandShortcut`. The `CommandDialog` already composes `Command` inside shadcn's `Dialog` with the right a11y roles.

---

## The Global Trigger

A command palette is useless if it's not one keystroke away from anywhere. Put the listener in a single client component mounted once at the root layout.

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export function CommandMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {/* groups go here */}
      </CommandList>
    </CommandDialog>
  );
}
```

Mount it once, outside your routed content, so it survives navigation:

```tsx
// app/layout.tsx
<body>
  {children}
  <CommandMenu />
</body>
```

**Rules:**

- Handle **both** `metaKey` (⌘, macOS) and `ctrlKey` (Windows/Linux).
- `e.preventDefault()` — the browser binds ⌘K in some contexts; claim it.
- Toggle (`!prev`) so the same key opens and closes.
- Mount the component **once** at the root. Mounting per-page loses state and double-binds the listener.

---

## Running Actions

Wrap selection in a helper that runs the action **and** closes the dialog. This is the single most common source of bugs — items that run but leave the menu open, or close without running.

```tsx
import { useRouter } from "next/navigation";

export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // run an action, always close after
  function runCommand(command: () => void) {
    setOpen(false);
    command();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard"))}
          >
            Dashboard
            <CommandShortcut>G then D</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/projects"))}
          >
            Projects
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            Toggle dark mode
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => navigator.clipboard.writeText(location.href))
            }
          >
            Copy current URL
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

**Rules:**

- Use `onSelect` (fires on Enter _and_ click), never an `onClick` on the item — keyboard users won't trigger `onClick`.
- Funnel every action through `runCommand` so closing is guaranteed and consistent.
- Group related items with `CommandGroup heading="..."`; separate groups with `CommandSeparator`.
- `CommandShortcut` is a visual hint (right-aligned, muted) — it does not bind the key. Bind real chords separately if you want them.

---

## Filtering & Search Value

cmdk filters automatically by matching the typed query against each item's text. When an item's visible text isn't enough (icons-only, or you want to match synonyms/keywords), set an explicit `value`.

```tsx
<CommandItem value="billing payments invoice subscription" onSelect={...}>
  <CreditCardIcon className="mr-2 size-4" />
  Billing settings
</CommandItem>
```

cmdk matches against `value` (falling back to text content). Pack synonyms into `value` so "invoice" finds "Billing settings".

To customize ranking (e.g. fuzzy vs strict), pass a `filter` to the root `Command`:

```tsx
<Command
  filter={(value, search) =>
    value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
  }
>
```

**Rules:**

- Add keyword-rich `value` to items whose label alone won't be searched well.
- Don't filter the list yourself with `.filter()` in React — let cmdk own filtering, or it breaks keyboard navigation and highlighting.
- For server-side search results (below), set `shouldFilter={false}` so cmdk shows exactly what the API returned.

---

## Async / Dynamic Results (search an API)

For results that come from the server (search projects, users, docs), debounce the query, fetch, and disable cmdk's client filter so it renders your results verbatim.

```tsx
"use client";

import { useEffect, useState } from "react";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setResults(await res.json());
      } catch (e) {
        if (!(e instanceof DOMException)) setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {/* shouldFilter=false: we already filtered on the server */}
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search..."
        />
        <CommandList>
          {loading && <CommandEmpty>Searching...</CommandEmpty>}
          {!loading && query && results.length === 0 && (
            <CommandEmpty>No results for "{query}".</CommandEmpty>
          )}

          {/* Static commands when there's no query */}
          {!query && (
            <CommandGroup heading="Quick actions">{/* ... */}</CommandGroup>
          )}

          {/* Async results */}
          {results.length > 0 && (
            <CommandGroup heading="Results">
              {results.map((r) => (
                <CommandItem
                  key={r.id}
                  value={r.id}
                  onSelect={() => runCommand(() => router.push(r.href))}
                >
                  {r.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
```

**Rules:**

- Debounce input (200–300ms) and `AbortController` in-flight requests so stale responses can't overwrite newer ones.
- `shouldFilter={false}` when results are server-filtered — otherwise cmdk re-filters and hides matches.
- Use `CommandInput`'s controlled `value`/`onValueChange` to capture the query.
- Always render a distinct **loading** vs **empty** vs **no-query** state.
- For cleaner data fetching, wrap the fetch in a React Query `useQuery` keyed on the debounced query instead of manual state (see [optimistic-cache-pattern](/skills/optimistic-cache-pattern)).

---

## Nested Pages (multi-level menus)

For palettes with sub-menus ("Change theme →", "Switch project →"), track a `pages` stack and render different items per page. Handle Backspace on an empty input to pop back.

```tsx
const [pages, setPages] = useState<string[]>([]);
const page = pages[pages.length - 1];
const [search, setSearch] = useState("");

return (
  <CommandDialog open={open} onOpenChange={setOpen}>
    <Command
      onKeyDown={(e) => {
        // Backspace on empty input, or Escape, pops one page
        if ((e.key === "Backspace" && !search) || e.key === "Escape") {
          if (pages.length > 0) {
            e.preventDefault();
            setPages((p) => p.slice(0, -1));
          }
        }
      }}
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="..."
      />
      <CommandList>
        {!page && (
          <CommandGroup heading="Settings">
            <CommandItem onSelect={() => setPages([...pages, "theme"])}>
              Change theme...
            </CommandItem>
          </CommandGroup>
        )}
        {page === "theme" && (
          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
              Light
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
              Dark
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
              System
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  </CommandDialog>
);
```

**Rules:**

- Model navigation as a `pages` stack so back/forward is just push/pop.
- Backspace-on-empty pops a level (Raycast convention); reset `search` when changing pages.
- Reset `pages` and `search` when the dialog closes so it reopens at the root.

---

## Recent Items

Surface recently used commands/results when the input is empty. Persist to `localStorage`.

```tsx
const [recents, setRecents] = useState<RecentItem[]>([]);

useEffect(() => {
  setRecents(JSON.parse(localStorage.getItem("cmdk-recents") ?? "[]"));
}, []);

function pushRecent(item: RecentItem) {
  const next = [item, ...recents.filter((r) => r.id !== item.id)].slice(0, 5);
  setRecents(next);
  localStorage.setItem("cmdk-recents", JSON.stringify(next));
}

// Show only when there's no active query
{
  !query && recents.length > 0 && (
    <CommandGroup heading="Recent">
      {recents.map((r) => (
        <CommandItem
          key={r.id}
          onSelect={() =>
            runCommand(() => {
              pushRecent(r);
              router.push(r.href);
            })
          }
        >
          {r.title}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
```

**Rules:**

- Read `localStorage` in `useEffect`, never during render (it doesn't exist on the server → hydration mismatch).
- Dedupe by id and cap the list (5–8 items).
- Only show recents when the query is empty.

---

## Reset on Close

State leaks between opens unless you reset it. Clear query and page stack whenever the dialog closes.

```tsx
function onOpenChange(next: boolean) {
  setOpen(next);
  if (!next) {
    setSearch("");
    setPages([]);
  }
}
```

---

## Styling & Theming

shadcn's `Command` is theme-aware via CSS variables. Common touches:

- `[cmdk-item]` selected state is driven by `data-[selected=true]` — style hover/keyboard-selection identically so mouse and keyboard look the same.
- Add leading icons with a fixed size: `<Icon className="mr-2 size-4 shrink-0" />`.
- Keep groups short; long flat lists are hard to scan. Prefer 3–6 items per group.
- Width: `CommandDialog` defaults to a centered modal — `max-w-lg` to `max-w-2xl` reads well.

---

## Accessibility

cmdk and shadcn's `Dialog` handle most of this, but verify:

- **Focus trap** — focus moves into the input on open and returns to the trigger on close (Dialog handles it).
- **Escape closes** — built in; don't `stopPropagation` keydown in a way that swallows it.
- **`aria-label`** — give `CommandInput` a clear placeholder; add `aria-label="Command menu"` to the dialog if it has no visible title.
- **No mouse-only actions** — every `CommandItem` must work via `onSelect` (keyboard + click), never `onClick` alone.

---

## Common Mistakes

1. **`onClick` instead of `onSelect`** — `onClick` won't fire on Enter. Keyboard users can't run the item. Always `onSelect`.
2. **Not closing after action** — Funnel actions through a `runCommand(fn)` helper that closes first. Items that run but stay open feel broken.
3. **Filtering the list manually** — `.filter()` in React breaks cmdk's navigation/highlighting. Use `value` for matching, or `shouldFilter={false}` for server results — never both.
4. **Leaving `shouldFilter` on for async results** — cmdk re-filters your server results and hides matches. Turn it off when you've already filtered.
5. **Mounting the menu per-page** — Double-binds the ⌘K listener and loses state on navigation. Mount once at the root.
6. **Reading `localStorage` during render** — SSR has no `localStorage`; you get a hydration mismatch. Read it in `useEffect`.
7. **Only handling `metaKey`** — Windows/Linux users press Ctrl+K. Check `e.metaKey || e.ctrlKey`.
8. **No debounce / no abort on search** — Every keystroke fires a request and stale responses overwrite fresh ones. Debounce + `AbortController`.
9. **Not resetting on close** — Query text and sub-page persist into the next open. Clear them in `onOpenChange`.
10. **Forgetting `e.preventDefault()` on the shortcut** — Some browsers/extensions bind ⌘K; without preventing default the palette fights them.
11. **One giant ungrouped list** — Group by intent (Navigation, Actions, Results, Recent) with `CommandGroup` + `CommandSeparator` for scannability.
12. **No empty/loading states** — `CommandEmpty` is shown constantly. Distinguish "searching", "no results", and "start typing".

---

## Tech Stack

- **cmdk** — unstyled command-menu primitive (filtering, keyboard nav, a11y)
- **shadcn/ui `Command` + `Dialog`** — styled wrappers with theme variables
- **Next.js `useRouter`** — navigation actions from items
- **TanStack React Query** (optional) — clean async result fetching keyed on the debounced query
- **localStorage** — recent items persistence
