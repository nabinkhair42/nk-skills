---
name: commit-pr-conventions
description: >-
  Git workflow using Conventional Commits and small focused PRs — type(scope)
  format, imperative summaries ≤72 chars, bullet-body PRs with verification
  notes, branch naming type/scope-summary, and surgical staging (never
  git add -A). Use when committing, writing commit messages, opening PRs,
  creating branches, or reviewing git hygiene in any repo.
topics: [git, tooling]
---

# Commit & PR Conventions

Conventional Commits plus small PRs. One logical change per commit, short PR bodies, never straight to master.

The core idea: **the commit title tells what, the body tells why** — anything non-obvious gets bullets explaining why, not just what.

Adapt the scope list to your repo's areas. The examples below come from a monorepo with `ui`, `web`, `admin`, `api`, `scheduler`, `consensus`, `billing`, `status-pages` as its areas.

---

## Commit Messages

Format: `type(scope): imperative summary`

| Part | Rule |
| --- | --- |
| type | `feat \| fix \| refactor \| chore \| ci \| docs \| build \| test` |
| scope | the area touched — pick from your repo's areas (`ui`, `api`, `scheduler`…) or omit for single-area repos |
| summary | lowercase, imperative mood, no period, ≤72 chars |

Real examples:

```
feat(status-pages): implement monitor filtering in status page listing
refactor(ui): extract shared shadcn/Base-UI primitives into @tallwatch/ui
fix(status-page): conditionally render incidents and maintenance sections
chore(dev): fixed dev ports (web 3000, api 3001, admin 3002, docs 3003)
```

### Body (optional, for anything non-obvious)

Bullet points, one per change, say why not just what:

```
- drop standalone admin install (admin is a workspace member now)
- web's customized primitives are the reference; admin-only empty.tsx merged in
```

### Rules

1. **Pure-refactor commits never bundle bugfixes.** Separate commits.
2. **One logical change per commit**; don't mix unrelated files.
3. **Never commit secrets or `.env` files.**

---

## PR Content

Keep it short — **title = main commit's message**, body = 3–6 bullets:

```markdown
<one-line summary of what changed>

- <change> — <why>
- <change> — <why>

Verification: typecheck/lint/tests green (name what you ran).
Deploy notes only if behavior/deps changed.
```

Real example (#109):

> **Title:** chore: remove dependabot config
>
> **Body:** Removes .github/dependabot.yml (weekly npm + actions bump PRs).

Bigger PRs add:

- a **"Behavior deltas to QA"** section if user-visible output changes
- explicit **"Not included / untouched"** notes when other work is in flight

---

## Workflow

1. Branch off fresh master/main: name it `type/scope-summary` (`feat/status-filters`, `fix/web-env-zod`)
2. Work on a branch, never commit straight to master/main
3. Only `git add` files you touched — **never `git add -A`** when other agents may have WIP in the tree
4. Push, open PR against master/main, merge, then delete local + remote branch

---

## Pre-Commit Checklist

- [ ] Title matches `type(scope): summary` — lowercase, imperative, ≤72 chars, no period
- [ ] Scope names the area actually touched
- [ ] Refactor commits contain zero bugfixes (and vice versa)
- [ ] Unrelated files left out of the commit
- [ ] No `.env` or secrets staged
- [ ] Staged files checked individually (`git status`) before committing

---

## Common Mistakes

1. **`git add -A`** — sweeps up other agents' WIP into your commit
2. **Bundling refactor + fix** — split into two commits
3. **Committing to master** — always branch first
4. **Vague scope** — `chore: stuff` instead of `chore(api): …`
5. **PR body restates the diff** — bullets should say *why*, not *what*
6. **Missing verification line** — name exactly what you ran (typecheck/lint/tests)
