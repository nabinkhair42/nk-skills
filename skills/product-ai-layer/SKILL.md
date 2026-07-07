---
name: product-ai-layer
description: Embed AI features in Next.js product apps using Vercel AI SDK. Covers streaming chat, tool calling with Zod, rate limiting, and auth — integrated into the product-stack 9-layer architecture. Use when adding chat, copilots, AI search, or agent features to a SaaS product.
topics: [ai, architecture, react-patterns]
---

# Product AI Layer

How to add AI features to a `product-stack` app without bolting on a separate architecture. Same layers: endpoints, services, hooks, components — plus AI-specific server routes and streaming UI.

Built on **Vercel AI SDK** (`ai` package), **Zod** for tool schemas, and **shadcn/ui** for chat UI.

---

## Where AI Fits in product-stack

```
src/
├── app/
│   └── api/
│       └── ai/
│           ├── chat/route.ts          # Streaming chat endpoint
│           └── generate/route.ts      # One-shot structured output
├── config/
│   └── api-endpoints.ts               # AI_ENDPOINTS + QUERY_KEYS
├── services/
│   └── ai.service.ts                  # Client calls to AI routes
├── hooks/
│   └── use-ai-chat.ts                 # useChat wrapper
├── schemas/
│   └── ai.ts                          # Tool input schemas
├── lib/
│   └── ai/
│       ├── tools.ts                   # Tool definitions + execute fns
│       ├── rate-limit.ts              # Per-user rate limiting
│       └── prompts.ts                 # System prompts per feature
└── components/
    └── ai/
        ├── chat-panel.tsx
        ├── chat-message.tsx
        └── tool-result.tsx
```

**Rule:** AI routes follow the same `protectedApi` middleware as CRUD routes. Never expose unauthenticated AI endpoints.

---

## Layer 1: Endpoints

```typescript
// config/api-endpoints.ts

export const API_ENDPOINTS = {
  // ...existing endpoints
  AI: {
    CHAT: "/api/ai/chat",
    GENERATE: "/api/ai/generate",
  },
};

export const QUERY_KEYS = {
  // ...existing keys
  AI_CONVERSATIONS: ["ai", "conversations"],
  AI_CONVERSATION: (id: string) => ["ai", "conversations", id],
};
```

---

## Layer 2: Chat Route Handler

```typescript
// app/api/ai/chat/route.ts

import { streamText, convertToModelMessages, UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { protectedApi } from "@/lib/middleware/api-middleware";
import { productTools } from "@/lib/ai/tools";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { getSystemPrompt } from "@/lib/ai/prompts";
import { Errors } from "@/lib/response/server-response";

export const POST = protectedApi(async (request, user) => {
  const { allowed, remaining } = await checkRateLimit(user.id);
  if (!allowed) {
    return Errors.tooManyRequests(`Rate limit exceeded. ${remaining} requests remaining.`);
  }

  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: getSystemPrompt("product-assistant"),
    messages: await convertToModelMessages(messages),
    tools: productTools(user.id),
    maxSteps: 5,
  });

  return result.toUIMessageStreamResponse();
});
```

**Rules:**

- `maxSteps` prevents infinite tool loops (default 5 is safe for product features)
- `convertToModelMessages` handles the `UIMessage` → model message conversion
- Rate limit before model call, not after
- Pass `user.id` into tools for row-level security

---

## Layer 3: Tool Definitions

Tools use the same Zod schemas as your CRUD layer:

```typescript
// lib/ai/tools.ts

import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema/projects";
import { eq } from "drizzle-orm";

export function productTools(userId: string) {
  return {
    listProjects: tool({
      description: "List the user's projects. Use when the user asks about their projects.",
      parameters: z.object({
        status: z.enum(["active", "draft", "archived"]).optional(),
      }),
      execute: async ({ status }) => {
        const rows = await db
          .select({ id: projects.id, name: projects.name, status: projects.status })
          .from(projects)
          .where(eq(projects.userId, userId))
          .limit(20);
        return status ? rows.filter((r) => r.status === status) : rows;
      },
    }),

    createProject: tool({
      description: "Create a new project for the user.",
      parameters: z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }),
      execute: async ({ name, description }) => {
        const [project] = await db
          .insert(projects)
          .values({ name, description, userId })
          .returning();
        return project;
      },
    }),
  };
}
```

**Rules:**

- Every tool `execute` scopes queries to `userId` — never trust the model for auth
- Return minimal data (no passwords, tokens, internal IDs the user shouldn't see)
- Tool descriptions are prompts — write them for the model, not humans
- Reuse Zod schemas from `schemas/` where possible

---

## Layer 4: Rate Limiting

```typescript
// lib/ai/rate-limit.ts

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "ai-chat",
});

export async function checkRateLimit(userId: string) {
  const { success, remaining } = await ratelimit.limit(userId);
  return { allowed: success, remaining };
}
```

For simpler setups without Redis, use an in-memory Map with TTL (dev only — not production-safe).

---

## Layer 5: Client Hook

```typescript
// hooks/use-ai-chat.ts

"use client";

import { useChat } from "@ai-sdk/react";
import { API_ENDPOINTS } from "@/config/api-endpoints";
import type { UIMessage } from "ai";

export function useAiChat(initialMessages?: UIMessage[]) {
  return useChat({
    api: API_ENDPOINTS.AI.CHAT,
    initialMessages,
    onError: (error) => {
      console.error("AI chat error:", error);
    },
  });
}
```

---

## Layer 6: Chat UI Components

Render `message.parts` — not `message.content`. Parts support text, tool calls, and tool results simultaneously.

```tsx
// components/ai/chat-message.tsx

"use client";

import type { UIMessage } from "ai";

export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {message.parts.map((part, i) => {
          switch (part.type) {
            case "text":
              return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
            case "tool-invocation":
              return (
                <ToolResult
                  key={i}
                  toolName={part.toolInvocation.toolName}
                  state={part.toolInvocation.state}
                  result={part.toolInvocation.result}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
```

```tsx
// components/ai/chat-panel.tsx

"use client";

import { useAiChat } from "@/hooks/use-ai-chat";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatPanel() {
  const { messages, input, setInput, handleSubmit, isLoading, stop } = useAiChat();

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          {isLoading ? (
            <Button type="button" variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button type="submit">Send</Button>
          )}
        </div>
      </form>
    </div>
  );
}
```

---

## Structured Output (non-chat)

For one-shot AI features (summaries, classifications, extractions):

```typescript
// app/api/ai/generate/route.ts

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { protectedApi } from "@/lib/middleware/api-middleware";
import { successResponse } from "@/lib/response/server-response";

const summarySchema = z.object({
  title: z.string(),
  keyPoints: z.array(z.string()).max(5),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});

export const POST = protectedApi(async (request, user) => {
  const { text } = await request.json();

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: summarySchema,
    prompt: `Summarize the following text:\n\n${text}`,
  });

  return successResponse(object);
});
```

Use `generateObject` when you need typed output. Use `streamText` when the user is watching.

---

## System Prompts

```typescript
// lib/ai/prompts.ts

const PROMPTS = {
  "product-assistant": `You are a helpful assistant inside a project management app.
You can list, create, and update projects for the current user.
Always confirm destructive actions before executing.
Keep responses concise. Use tools when you need data — don't guess.`,
} as const;

export function getSystemPrompt(key: keyof typeof PROMPTS) {
  return PROMPTS[key];
}
```

Store prompts in code, not env vars. Version them in git.

---

## When to Use What

| Feature | Pattern | SDK function |
| --- | --- | --- |
| Chat copilot | Streaming + tools | `streamText` + `useChat` |
| Inline summary | One-shot structured | `generateObject` |
| AI search/filter | Tool that queries DB | `tool` + `execute` |
| Background agent | Server-only, no UI | `generateText` in cron/job |

---

## Server Actions vs API Routes for AI

| Use API route when | Use Server Action when |
| --- | --- |
| `useChat` hook (needs streaming HTTP) | Simple `generateObject` from a form |
| External clients need access | Internal-only, no streaming |
| Tool calling with multi-step loops | Single-step mutation with AI assist |

For streaming chat, always use API routes. `useChat` expects an HTTP streaming endpoint.

---

## Adding an AI Feature Checklist

1. **Prompt** — add to `lib/ai/prompts.ts`
2. **Tools** — define in `lib/ai/tools.ts` with Zod + user scoping
3. **Route** — `app/api/ai/{feature}/route.ts` with `protectedApi` + rate limit
4. **Endpoint** — add to `API_ENDPOINTS.AI`
5. **Hook** — `useAiChat` or feature-specific hook
6. **Component** — chat panel or inline AI widget
7. **Rate limit** — configure per feature tier if needed

---

## Common Mistakes

1. **Unauthenticated AI routes** — always wrap with `protectedApi`
2. **Tools without user scoping** — model can request any ID; scope in `execute`
3. **Rendering `message.content`** — use `message.parts` for tool call support
4. **No `maxSteps`** — tool loops run forever without a step limit
5. **Rate limiting after the model call** — limit before `streamText`/`generateObject`
6. **Huge tool results** — truncate lists; return summaries for large datasets
7. **Storing API keys client-side** — model calls happen server-side only
