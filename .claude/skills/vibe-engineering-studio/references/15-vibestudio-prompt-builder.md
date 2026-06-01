---
name: vibestudio-prompt-builder
description: "Use when editing the task detail page (apps/web/src/pages/dev-portal/tasks/[id].tsx) or the task list (tasks/index.tsx) — the AI Prompt Builder. It generates a structured prompt from a task + a VibeStudio MODULE (not accounting domain) for pasting into Claude/Cursor/Copilot. Modules: board, sprints, prompts, ai-chat, agents, channels, wiki, activity, deployments, usage."
---

# VibeStudio — AI Prompt Builder

## What it is

A UI on the task detail page (`/dev-portal/tasks/[id]`) that composes a
structured prompt from a task description + module context + a template.
The output is pasted into Claude / Cursor / Copilot to produce the code.
It is step 3 of the Vibe Coding flow ([[vibestudio-vibe-coding]]).

## Where it lives

- Page: `apps/web/src/pages/dev-portal/tasks/[id].tsx` — `DOMAIN_KB`, `PROMPT_TEMPLATES`, `PROJECT_DOCS`, and the context chips.
- Task create: `apps/web/src/pages/dev-portal/tasks/index.tsx` — `VIBE_DOMAINS`, `COMPONENTS`, `generateContext()`.
- Mirror copy in the service: `domains/dev-portal/src/dev-portal-service.ts` `generateDomainWikiPages()` `DOMAIN_KB`.

> Three places carry the module list. Keep them in sync when you add a module.

## The modules (NOT accounting domains)

`board`, `sprints`, `prompts`, `ai-chat`, `agents`, `channels`, `wiki`,
`activity`, `deployments`, `usage`, `dev-portal`. Each entry carries:
`label`, `tables` (all `dev_*`), `api` (`/api/v1/dev-portal/...`),
`rules`, `affects`, `pages` (`/dev-portal/...`), and an overview.

## Generated-prompt conventions (what the AI should produce)

1. **Migration** — `infrastructure/migrations/NNN_dev_<slug>.js` (next 082), `dev_*` table, knex up/down + `hasTable` guard.
2. **API route** — in `apps/api/src/routes/dev-portal.ts` under `/api/v1/dev-portal`, guarded by `devAuth` + `requireRole(...)`.
3. **Service method** — in `domains/dev-portal/src/dev-portal-service.ts`.
4. **Frontend page** — `apps/web/src/pages/dev-portal/<name>.tsx` using `DevPortalLayout` + `useDevAuth()`'s `devApi`.
5. **Sidebar entry** — in `DevPortalLayout`'s `VIEWS`.
6. **`logActivity()`** — record the mutation into `dev_activity_log`.

## The context chips (toggleable prompt snippets)

Auth & Access (dev_portal_token + RLS via `app.current_member_id`),
DB Conventions (`dev_*`, snake_case, UUID PKs, next migration 082),
Auth Pattern (DevPortal JWT, `useDevAuth()`), AI Providers (prefer latest
Claude models). **No** "data isolation / resolveOrgId", **no** "German
finance", **no** "i18n 6 languages" chips — those were the host app.

## What NOT to do

- Do NOT reintroduce accounting modules (accounting, invoicing, vat, datev, payroll, …) or German-tax context.
- Do NOT emit `resolveOrgId` / `organization_id` / `DashboardLayout` / `packages/api-client` / `packages/i18n` — none exist here.
- Do NOT generate prompts > ~4000 chars without reason.

## Related skills
- [[vibestudio-vibe-coding]]
- [[vibestudio-architecture]]
- [[vibestudio-auth]]
- [[vibestudio-database]]
