# nk-skills

reusable skills for product engineers, packaged as installable agent skills.

Each skill is a plain `SKILL.md` folder, distributed through
[skills.sh](https://skills.sh) — the open agent-skills directory. One command
installs them into Claude Code, Cursor, GitHub Copilot, Windsurf, Gemini, and
30+ other agents.

## install

```bash
npx skills add nabinkhair42/nk-skills
```

Pick specific skills or target specific agents:

```bash
npx skills add nabinkhair42/nk-skills --skill structural-grid
npx skills add nabinkhair42/nk-skills --skill form-stack --agent claude-code
npx skills add nabinkhair42/nk-skills --all          # all skills, all agents
npx skills add nabinkhair42/nk-skills -l             # list without installing
```

Manage installed skills with `npx skills list`, `npx skills remove`, and
`npx skills update`. See the [skills.sh docs](https://skills.sh) for the full
CLI.

## skills

- **structural-grid** — design system for exposed grid/rail layouts (Linear, Vercel, Resend style)
- **optimistic-cache-pattern** — React Query cache layering for instant UI
- **product-stack** — full-stack Next.js architecture with layered CRUD patterns (Axios, React Query, Zod, shadcn/ui)
- **form-stack** — type-safe forms with React Hook Form + Zod + shadcn/ui
- **data-table-pattern** — TanStack Table + shadcn/ui with URL-synced state and server-side operations
- **product-ai-layer** — Vercel AI SDK integration (streaming chat, tools, rate limiting) for product-stack apps
- **command-palette** — global Cmd+K palette with fuzzy search, frecency ranking, and server search
- **feature-spec** — lightweight spec-driven development for agent-delegated feature implementation

## adding a skill

1. Create `skills/<name>/SKILL.md` with `name`, `description`, and `topics` frontmatter
   (directory name must match the `name` field).
2. That's it — the showcase site, per-skill `llms.txt`, and `skills.sh`
   discovery all pick it up from the folder.

## development

This repo is also a small showcase site (built with Astro) that documents the
skills.

```bash
pnpm install
pnpm dev
```

## license

MIT
