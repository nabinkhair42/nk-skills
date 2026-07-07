---
name: feature-spec
description: Lightweight spec-driven development for product engineers and AI agents. Write executable feature specs before code, map them to product-stack layers, and verify implementation against acceptance criteria. Use when planning features, delegating to agents, or ensuring consistent CRUD implementation.
topics: [ai, architecture, tooling]
---

# Feature Spec

Spec-driven development without enterprise ceremony. Write a **feature spec** before code — structured enough for an AI agent to execute end-to-end without follow-up questions.

The spec is the source of truth. Code is derived from it.

Pairs with `product-stack` (9-layer checklist) and `agent-verification` patterns.

---

## When to Write a Spec

| Write a spec | Skip the spec |
| --- | --- |
| New CRUD resource | One-line bug fix |
| Multi-layer feature (DB → UI) | Style tweak |
| Agent-delegated implementation | Config change |
| Feature touching 3+ files | Dependency bump |

**Test:** "Could an agent execute this without asking me a follow-up question?" If no, the spec isn't clear enough.

---

## Spec Template

Copy this for every new feature:

```markdown
# Feature: [Name]

## Outcome
One sentence: what the user can do when this ships.

## Scope
### In
- [ ] Specific capability 1
- [ ] Specific capability 2

### Out
- What this feature explicitly does NOT include

## Constraints
- Must follow product-stack 9-layer flow
- Auth: [protected | admin | public]
- No hardcoded API paths (use API_ENDPOINTS)
- [Any domain-specific rules]

## Data Model
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| name | text | yes | max 100 chars |
| status | enum | yes | draft, active, archived |

## API
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | /api/{resource} | protected | List with pagination |
| POST | /api/{resource} | protected | Create |
| GET | /api/{resource}/[id] | protected | Get by ID |
| PUT | /api/{resource}/[id] | protected | Update |
| DELETE | /api/{resource}/[id] | protected | Delete |

## UI
- [ ] List view with data table (sort, filter, paginate)
- [ ] Create dialog
- [ ] Edit dialog (optimistic open with list data)
- [ ] Delete confirmation
- [ ] Empty state for first-time users

## Acceptance Criteria
- [ ] User can create a {resource} and see it in the list immediately (no refetch)
- [ ] User can edit a {resource} — form opens instantly with cached data
- [ ] User can delete a {resource} — removed from list without page reload
- [ ] Invalid input shows field-level errors from Zod validation
- [ ] Unauthorized users get 401, non-owners get 403

## Layers Checklist
- [ ] 1. DB Schema — `db/schema/{resource}.ts`
- [ ] 2. Endpoints — `API_ENDPOINTS.{RESOURCE}` + `QUERY_KEYS`
- [ ] 3. Zod Schema — `schemas/{resource}.ts`
- [ ] 4. Route Handlers — `app/api/{resource}/route.ts` + `[id]/route.ts`
- [ ] 5. Service — `services/{resource}.service.ts`
- [ ] 6. Hook — `hooks/use-{resource}.ts`
- [ ] 7. Columns — `components/{resource}/{resource}-columns.tsx`
- [ ] 8. Table — `components/{resource}/{resource}-table.tsx`
- [ ] 9. Dialogs — create/edit/delete in `components/{resource}/`
```

---

## Spec → Implementation Flow

```
1. Write spec (this template)
2. Review: "Can an agent execute without follow-ups?"
3. Agent implements layer by layer (never skip)
4. Verify against acceptance criteria
5. Ship
```

### Phase 1: Specify

Fill the template. Focus on **outcome** and **acceptance criteria** — not implementation details. The agent derives implementation from constraints + layers checklist.

Bad outcome: "Add tasks feature"
Good outcome: "User can create, edit, delete, and filter tasks by status from the dashboard"

### Phase 2: Plan (optional for complex features)

For features with cross-resource dependencies, add a technical plan:

```markdown
## Technical Plan
- Tasks belong to Projects (FK: projectId → projects.id, cascade delete)
- Status enum: todo, in_progress, done
- List endpoint filters by projectId (required query param)
- Optimistic cache: edit opens with list data, fetches assignee in background
```

### Phase 3: Implement

Agent follows the layers checklist in order. Each layer is a separate step — never combine.

### Phase 4: Verify

Check every acceptance criterion. Check every layer exists. Run the agent-verification checklist:

- [ ] No hardcoded `/api/` strings in services or components
- [ ] Components call hooks, not services
- [ ] Every mutation invalidates or updates cache (not both)
- [ ] Route handlers use `schema.safeParse()` before processing
- [ ] FK columns have indexes
- [ ] `enabled: !!id` on single-item queries

---

## Constitutional Constraints

Non-negotiable rules that apply to every feature. Store in `.cursor/rules/` or reference in every spec:

```markdown
## Constitution
1. Every feature follows the 9-layer product-stack flow — no shortcuts
2. API paths live only in `config/api-endpoints.ts`
3. Types come from Zod (`z.infer`) or Drizzle (`$inferSelect`) — never manual duplicates
4. Toast notifications live in hook `onSuccess`/`onError` — never in services
5. Server Components by default — `"use client"` only at the leaf
6. Auth on every mutation — `protectedApi` or `adminApi`
7. Validate every request body with Zod `safeParse()`
```

When an agent violates a constitutional rule, reject the output and re-run with the constraint highlighted.

---

## Spec Examples

### Minimal (bug fix — skip spec)

"Fix pagination offset on projects list" — no spec needed.

### Standard (new CRUD resource)

```markdown
# Feature: Tasks

## Outcome
User can manage tasks within a project from the project detail page.

## Scope
### In
- CRUD tasks scoped to a project
- Filter by status (todo, in_progress, done)
- Assignee field (user ID, optional)

### Out
- Subtasks
- Due date reminders
- Cross-project task view

## Constraints
- Must follow product-stack 9-layer flow
- Auth: protected (project owner only)
- Tasks cascade-delete when project is deleted

## Data Model
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | uuid | auto | primary key |
| projectId | uuid | yes | FK → projects.id, cascade |
| title | text | yes | max 200 chars |
| status | enum | yes | todo, in_progress, done |
| assigneeId | text | no | FK → users.id, set null |
| position | integer | yes | sort order, default 0 |

## Acceptance Criteria
- [ ] Tasks appear in project detail page table
- [ ] Create task dialog opens from project page
- [ ] Edit opens instantly with cached title/status
- [ ] Delete removes task from list without refetch
- [ ] Only project owner can CRUD tasks
```

### Complex (AI feature)

```markdown
# Feature: AI Project Summary

## Outcome
User can generate an AI summary of a project's tasks and status from the project detail page.

## Scope
### In
- "Summarize" button on project detail page
- Streams summary text inline
- Uses project tasks as context

### Out
- Chat interface
- Editing the summary
- Sharing summaries

## Constraints
- Must follow product-ai-layer patterns
- Rate limit: 5 summaries per hour per user
- Auth: protected (project owner only)
- Tool scopes to user's projects only

## API
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | /api/ai/summarize | protected | Stream project summary |

## Acceptance Criteria
- [ ] Summary streams token-by-token (not blocking spinner)
- [ ] Rate limit shows clear error after 5 uses
- [ ] Summary references actual task data, not hallucinated
- [ ] Stop button cancels generation
```

---

## Storing Specs

Keep specs in the repo so agents can read them:

```
specs/
├── tasks.md
├── ai-project-summary.md
└── billing-integration.md
```

Or inline in PR descriptions for smaller features. The key rule: **specs are versioned in git**, not in chat history or sprint boards.

---

## Agent Handoff Prompt

When delegating to an agent, paste:

```
Implement the feature described in specs/{name}.md.

Follow the layers checklist in order. Do not skip layers.
Apply constitutional constraints from the spec.
Verify every acceptance criterion before finishing.
```

---

## Common Mistakes

1. **Vague outcomes** — "add tasks" vs "user can CRUD tasks filtered by status"
2. **Missing acceptance criteria** — agent ships code that "works" but doesn't meet UX expectations
3. **Skipping the Out of scope section** — agent adds features you didn't ask for
4. **Spec in chat, not in repo** — lost after session ends; agents can't re-read it
5. **No constitutional constraints** — agent invents its own patterns per feature
6. **Implementing before spec review** — rework costs 3x when requirements were ambiguous
7. **Acceptance criteria without cache behavior** — "see it immediately" requires optimistic cache, not just CRUD
