---
name: structural-grid
description: A comprehensive design system for exposed grid/rail layouts used by Linear, Vercel, and Resend. Covers CSS foundation, section patterns, component recipes, and common pitfalls.
topics: [design-systems, architecture]
---

# Structural Grid Design System

You are implementing a **Structural Grid** (also called "Exposed Grid" or "Rail Layout") design pattern. This is the modern SaaS design pattern used by Linear, Vercel, Resend, Profound, and Planetscale — where the underlying page grid is promoted to a first-class visual element.

## Core Principles

1. **Visible structure** — Vertical rail lines and horizontal dividers are decorative elements, not hidden scaffolding
2. **Content lives inside the grid** — Components blend into the rail structure rather than floating over it
3. **Dashed internal, solid external** — Rail lines and section dividers are solid; internal grid cell dividers are dashed
4. **Alternating visual rhythm** — Sections alternate between default and dot-pattern backgrounds for depth
5. **Minimal containers** — No rounded-xl bordered cards floating inside sections. Content sits directly within the grid
6. **Consistent letter-spacing** — Use `tracking-wide` on all section labels and inline labels. Never mix `tracking-widest` and `tracking-wider`
7. **Every card hovers** — All grid cells get `transition-colors hover:bg-white/[0.02]` for interactive feedback

---

## CSS Foundation

Add these to your global CSS. All measurements derive from a single `--rail-offset` variable.

```css
/* Vertical rail lines */
.page-rails {
  --rail-offset: max(1rem, calc(50% - 36rem)); /* = max-w-6xl centered */
  position: relative;
  overflow-x: clip; /* clip, NOT hidden — hidden breaks position:sticky */
}
.page-rails::before,
.page-rails::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
  pointer-events: none;
  z-index: 1;
}
.page-rails::before {
  left: var(--rail-offset);
}
.page-rails::after {
  right: var(--rail-offset);
}

/* Content bounded to rail edges */
.rail-bounded {
  margin-left: var(--rail-offset);
  margin-right: var(--rail-offset);
}

/* Horizontal section divider between rails */
.section-divider {
  position: relative;
  height: 1px;
  z-index: 2;
}
.section-divider::before {
  content: "";
  position: absolute;
  left: var(--rail-offset, max(1rem, calc(50% - 36rem)));
  right: var(--rail-offset, max(1rem, calc(50% - 36rem)));
  height: 1px;
  background: var(--border);
}

/* Subtle dot pattern for section backgrounds */
.dot-pattern {
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
}

/* Custom scrollbar — matches dark themes */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
```

### Critical: overflow-x

**Always use `overflow-x: clip` on `.page-rails`, NEVER `overflow-x: hidden`.**
`hidden` creates a new scroll container which breaks `position: sticky` on any descendant.
`clip` clips overflow visually without affecting scroll/sticky behavior.

### Smooth scroll with sticky navbar offset

When using a sticky navbar with anchor links, add to `html`:

```css
html {
  scroll-behavior: smooth;
  scroll-padding-top: 5rem; /* clears the sticky navbar height */
}
```

### Adjusting rail width

Change `36rem` to match your desired max content width:

- `32rem` = 1024px = Tailwind `max-w-5xl`
- `36rem` = 1152px = Tailwind `max-w-6xl` (recommended default)
- `40rem` = 1280px = Tailwind `max-w-7xl`

---

## Page Structure

```tsx
<Navbar />
<div className="page-rails flex flex-col">
  <Hero />
  <div className="section-divider" aria-hidden="true" />
  <SectionA />
  <div className="section-divider" aria-hidden="true" />
  <SectionB />
  <div className="section-divider" aria-hidden="true" />
  <Cta />
</div>
<Footer />
```

Every section is separated by a `section-divider`. The rails run the full height of `.page-rails`. Navbar and Footer sit **outside** `.page-rails`.

### Section IDs

Always add `id` attributes to sections that need anchor links or nav tracking:

```tsx
<section id="features">
<section id="showcase">
<section id="faq">
```

---

## Section Patterns

### 1. Text Header (reusable across sections)

```tsx
<div className="mx-auto w-full max-w-6xl px-6">
  <div className="pb-6 pt-16">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Section Label
    </p>
    <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
      Section Title
    </h2>
    <p className="mt-2 max-w-md text-base text-muted-foreground">
      Section description text here.
    </p>
  </div>
</div>
```

### 2. Grid with Dashed Internal Dividers

Use `rail-bounded` to align the grid edges with the rails. Apply `border-t border-border` to connect the grid's top edge with the section divider above. Use dashed borders between cells. Always include `border-border` color class on internal dividers.

**Responsive border logic for a 3-column grid (1 col mobile, 2 col sm, 3 col lg):**

```tsx
<div className="rail-bounded border-t border-border">
  <div className="grid sm:grid-cols-2 lg:grid-cols-3">
    {items.map((item, i) => (
      <div
        key={item.id}
        className={`group px-6 py-8 transition-colors hover:bg-white/[0.02]
          ${i % 3 !== 0 ? "lg:border-l lg:border-dashed lg:border-border" : ""}
          ${i % 2 !== 0 ? "sm:max-lg:border-l sm:max-lg:border-dashed sm:max-lg:border-border" : ""}
          ${i >= 3 ? "lg:border-t lg:border-dashed lg:border-border" : ""}
          ${i >= 2 ? "sm:max-lg:border-t sm:max-lg:border-dashed sm:max-lg:border-border" : ""}
          ${i >= 1 ? "max-sm:border-t max-sm:border-dashed max-sm:border-border" : ""}
        `}
      >
        {/* cell content */}
      </div>
    ))}
  </div>
</div>
```

**For a simpler 3-column grid (1 col mobile, 3 col sm):**

```tsx
<div className="rail-bounded border-t border-border">
  <div className="grid sm:grid-cols-3">
    {items.map((item, i) => (
      <div
        key={item.id}
        className={`group px-6 py-8 transition-colors hover:bg-white/[0.02]
          ${i !== 0 ? "sm:border-l sm:border-dashed sm:border-border" : ""}
          ${i >= 1 ? "max-sm:border-t max-sm:border-dashed max-sm:border-border" : ""}
        `}
      >
        {/* cell content */}
      </div>
    ))}
  </div>
</div>
```

**Border logic rules:**

- `border-l` (left) = applied to every cell that is NOT the first in its row at that breakpoint
- `border-t` (top) = applied to every cell that is NOT in the first row at that breakpoint
- Use `sm:max-lg:` prefix for tablet-only borders that differ from desktop
- Use `max-sm:` prefix for mobile-only borders
- All internal borders are `border-dashed border-border`
- All grid cells include `group transition-colors hover:bg-white/[0.02]` for hover feedback

### 3. Side-by-Side Layout with Full-Height Dashed Divider

For layouts like text + interactive content, use `items-stretch` so the dashed divider spans the full section height, and `gap-0` so there's no gap between columns.

```tsx
<section id="section-name" className="relative">
  {/* optional background pattern */}
  <div className="dot-pattern absolute inset-0" aria-hidden="true" />

  <div className="relative mx-auto grid w-full max-w-6xl items-stretch gap-0 px-6 lg:grid-cols-[1fr_1.6fr]">
    {/* Left — text (sticky while right column scrolls) */}
    <div className="py-16 lg:py-24">
      <div className="lg:sticky lg:top-24">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Label
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          Title
        </h2>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
          Description text.
        </p>
      </div>
    </div>

    {/* Right — content with full-height dashed divider */}
    <div className="pb-16 lg:border-l lg:border-dashed lg:border-border lg:py-24 lg:pl-8">
      {/* tall content like an interactive demo or accordion */}
    </div>
  </div>
</section>
```

**Sticky text requirements:**

- Parent `.page-rails` must use `overflow-x: clip` (not `hidden`)
- The sticky element's direct parent must be taller than the sticky content
- `items-stretch` on the grid makes both columns match the taller column's height
- Apply padding to children, not the grid itself
- Use `lg:pl-8` for right column padding (not `lg:pl-16` — too wide)

### 4. Hero Section

```tsx
<section className="relative flex flex-col items-center px-4 pb-0 pt-24 text-center sm:pt-32">
  {/* optional subtle glow */}
  <div className="hero-glow" aria-hidden="true" />

  {/* badge */}
  <div className="relative z-10 mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5">
    <span className="size-1.5 rounded-full bg-white/40 animate-pulse" />
    <span className="text-[13px] text-white/60">Badge Text</span>
  </div>

  <h1 className="relative z-10 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
    Main headline
    <br />
    <span className="text-muted-foreground">secondary line</span>
  </h1>

  <p className="relative z-10 mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
    Subtitle description
  </p>

  <div className="relative z-10 mt-8 flex flex-col items-center gap-3 sm:flex-row">
    <Link
      href="/pricing"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-80"
    >
      Primary CTA
    </Link>
    <Link
      href="/#features"
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.1] px-5 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.04]"
    >
      Secondary CTA
    </Link>
  </div>

  {/* Optional: product mockup below CTAs, use pb-0 on section to eliminate gap before next divider */}
</section>
```

**Note:** Use `pb-0` on the hero section when a mockup/visual butts up against the next section divider for seamless continuity.

### 5. CTA Section (Bottom)

Clean, centered — no card container, no gradient. Matches the structural grid aesthetic.

```tsx
<section>
  <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-20 text-center sm:py-28">
    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
      Call to action headline
    </h2>
    <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
      Supporting text.
    </p>
    <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
      <Link
        href="/pricing"
        className="inline-flex h-11 w-44 items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-80"
      >
        Primary CTA
      </Link>
      <Link
        href="/pricing"
        className="inline-flex h-11 w-44 items-center justify-center gap-2 rounded-lg border border-white/[0.1] text-sm font-medium text-foreground transition-colors hover:bg-white/[0.04]"
      >
        Secondary CTA
      </Link>
    </div>
  </div>
</section>
```

---

## Component Recipes

### Icon Container (Feature Cards)

Card-style container with border for icon + text feature cards:

```tsx
<div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/60 transition-colors group-hover:text-white/90">
  <FeatureIcon size={18} stroke={1.5} />
</div>
<h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
  {description}
</p>
```

### Navbar with Active Section Tracking

Client component that highlights the current section as you scroll using IntersectionObserver:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { label: "Features", href: "/#features", sectionId: "features" },
  { label: "Showcase", href: "/#showcase", sectionId: "showcase" },
  { label: "FAQ", href: "/#faq", sectionId: "faq" },
  { label: "Pricing", href: "/pricing", sectionId: null },
];

export function Navbar() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/") return;
    const sectionIds = navLinks
      .map((l) => l.sectionId)
      .filter(Boolean) as string[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: "-40% 0px -40% 0px" },
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pathname]);

  function linkClass(link: (typeof navLinks)[number]) {
    const isActive =
      link.sectionId === null
        ? pathname === "/pricing"
        : pathname === "/" && activeSection === link.sectionId;
    return `transition-colors hover:text-foreground ${
      isActive ? "text-foreground" : "text-muted-foreground"
    }`;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 text-foreground">
          {/* icon */}
          <span className="font-semibold tracking-tight">Brand</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex text-sm">
          {navLinks.map((link) => (
            <Link key={link.label} href={link.href} className={linkClass(link)}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side: CTA + mobile hamburger */}
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="rounded-lg bg-foreground px-4 py-1.5 font-medium text-background transition-opacity hover:opacity-80"
          >
            Get Started
          </Link>
          {/* Mobile toggle — md:hidden */}
          <button
            type="button"
            onClick={() => setMobileOpen((p) => !p)}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {/* hamburger / X icon */}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      <div
        className={`overflow-hidden border-t border-border transition-[max-height] duration-300 ease-in-out md:hidden ${
          mobileOpen ? "max-h-80" : "max-h-0 border-t-transparent"
        }`}
      >
        <nav className="flex flex-col gap-1 px-6 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`rounded-lg px-3 py-2.5 text-sm ${linkClass(link)}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
```

**Key patterns:**

- `rootMargin: "-40% 0px -40% 0px"` — only triggers when a section is in the middle 20% of the viewport
- Active class is conditional: `text-foreground` vs `text-muted-foreground` (never both at once)
- Mobile menu uses `max-h` transition for smooth expand/collapse
- Auto-closes on link click via `onClick`
- Lock body scroll when mobile menu is open with `document.body.style.overflow`

### Responsive Tables

For data-heavy tables (e.g. feature comparison), wrap in `overflow-x-auto` with a minimum width:

```tsx
<div className="rail-bounded overflow-x-auto border-t border-border">
  <div className="min-w-[600px]">
    <div className="grid grid-cols-4">
      {/* table content stays readable, scrolls horizontally on mobile */}
    </div>
  </div>
</div>
```

### IntersectionObserver Animation Pattern

Trigger animations when a section scrolls into view:

```tsx
const ref = useRef<HTMLDivElement>(null);
const [isVisible, setIsVisible] = useState(false);

useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    },
    { threshold: 0.3 },
  );
  observer.observe(el);
  return () => observer.disconnect();
}, []);
```

Apply to elements with staggered delays:

```tsx
<div
  style={{
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateY(0)" : "translateY(8px)",
    transition: `all 0.4s ease ${0.3 + i * 0.1}s`,
  }}
>
```

---

## Design Tokens Reference

| Element                | Solid/Dashed | CSS                                           |
| ---------------------- | ------------ | --------------------------------------------- |
| Vertical rails         | Solid        | `background: var(--border)`                   |
| Section dividers       | Solid        | `background: var(--border)`                   |
| Internal grid dividers | Dashed       | `border-dashed border-border`                 |
| Dot pattern            | N/A          | `radial-gradient` with 4% white opacity       |
| Card hover             | N/A          | `hover:bg-white/[0.02]`                       |
| Section label          | N/A          | `text-xs font-medium uppercase tracking-wide` |
| Scrollbar thumb        | N/A          | `rgba(255, 255, 255, 0.1)`, hover `0.2`       |

---

## Common Pitfalls

1. **`overflow: hidden` breaks sticky** — Always use `overflow-x: clip` on the rails container
2. **Grid borders extending past rails** — Use `.rail-bounded` (margin-based) instead of `mx-auto max-w-6xl` (width-based) for grid wrappers that need border edges to align with rails
3. **Orphaned grid items on mobile** — If you have N items in a 2-col mobile grid and N is odd, the last item sits alone. Plan item counts around your column counts
4. **Border-left on single-column mobile** — Use `sm:max-lg:border-l` for tablet-only left borders and `max-sm:border-t` for mobile top borders. Never apply `border-l` at mobile single-column breakpoints
5. **Section padding on grid parents** — When using `items-stretch` for full-height dividers, apply padding to grid children, not the grid container itself
6. **Rails not reaching page bottom** — `.page-rails` pseudo-elements use `top: 0; bottom: 0` so they span the full height of the container. Ensure `.page-rails` wraps all content
7. **Missing `border-border` on dashed dividers** — Always include the color class: `border-dashed border-border`. Without it, borders default to gray which won't match your theme
8. **Anchor links landing behind sticky navbar** — Add `scroll-padding-top: 5rem` to `html` so anchored sections clear the navbar
9. **Inconsistent tracking classes** — Standardize on `tracking-wide` for all section labels and inline labels. Mixing `tracking-widest` and `tracking-wider` creates visual inconsistency
10. **Missing hover states on grid cards** — Every grid cell should have `group transition-colors hover:bg-white/[0.02]`. Missing hover states make some sections feel static compared to others
11. **Both color classes applied at once** — When toggling active/inactive states, use a conditional: `isActive ? "text-foreground" : "text-muted-foreground"`. Never apply both simultaneously and rely on cascade order
12. **4-column tables on mobile** — Always wrap data tables in `overflow-x-auto` with `min-w-[600px]` inner container. A 4-col grid is unreadable below 600px
