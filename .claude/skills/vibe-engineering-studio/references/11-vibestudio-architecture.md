---
name: vibestudio-architecture
description: "Use when editing any page under apps/web/src/pages/dev-portal/, the DevPortalLayout, the API router apps/api/src/routes/dev-portal.ts, or the service domains/dev-portal/src/dev-portal-service.ts. VibeStudio is a standalone Vibe Code Prompt Studio (project mgmt + sprint board + AI prompt library + wiki + activity feed). 30 pages, single backend router, single service. Ports: web 3100, API 4100, DB tunnel 5545. NOT an accounting app."
---

# VibeStudio — Architecture

## What it is

A standalone studio for vibe-coding teams. Everything lives under
`/dev-portal/*`. Extracted from the ACCA host on 2026-05-31; it has
**no accounting concepts** (no SKR03, journal entries, VAT, GoBD). The
roadmap targets a standalone **desktop (.exe) + mobile app**, integrated
with **Claude subscriptions / AI provider APIs**, focused on prompt
engineering and developer context tooling.

## Where things live

| Layer | Path |
|---|---|
| Web pages (30) | `apps/web/src/pages/dev-portal/*` |
| Desktop shell | `apps/desktop/` (Electron — wraps the web app, packages to .exe) |
| Layout | `apps/web/src/components/layouts/DevPortalLayout.tsx` |
| Auth hook | `apps/web/src/hooks/useDevAuth.ts` (`devApi` helper) |
| API router | `apps/api/src/routes/dev-portal.ts` (single router) |
| Service | `domains/dev-portal/src/dev-portal-service.ts` |
| AI providers | `domains/dev-portal/src/ai-provider-service.ts` |
| Migrations | `infrastructure/migrations/` (next: **082**) |
| Seed | `infrastructure/seeds/005_dev_portal_data.js` |

## Ports (do not clash with ACCA on the shared VM)

| Service | Port |
|---|---|
| Web (Next.js) | 3100 |
| API (Express) | 4100 |
| DB tunnel (local → IONOS) | 5545 |

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:4100` in the web app —
override it in production.

## The 30 pages (by sidebar section)

- **Plan & Track**: `index`, `board`, `tasks/index`, `tasks/[id]` (AI Prompt Builder), `my-tasks`, `calendar`, `gantt`, `sprints`
- **Collaborate**: `team`, `portfolio`, `channels/index`, `channels/[id]`, `inbox`, `knowledge`, `wiki`
- **AI**: `agents`, `prompts`, `ai`, `usage`
- **Ops**: `deployments`, `environments`, `architecture`, `project-explorer`, `project`, `guide`, `settings`, `help`, `login`

## Modules (the AI Prompt Builder's "domains")

board, sprints, prompts, ai-chat, agents, channels, wiki, activity,
deployments, usage. See [[vibestudio-prompt-builder]]. **Never** introduce
accounting modules — that's the host app.

## When to extend

- **New page** → under `apps/web/src/pages/dev-portal/`, use `DevPortalLayout`, add a sidebar entry in the layout's `VIEWS` array.
- **New endpoint** → `apps/api/src/routes/dev-portal.ts` under `/api/v1/dev-portal`, guarded by the `devAuth` middleware (validates `dev_portal_token`, NOT `acca_token`). Frontend calls go through `devApi` from `useDevAuth()`.
- **New table** → new migration `NNN_dev_<slug>.js` (next 082), all tables prefixed `dev_*`. See [[vibestudio-database]].

## What NOT to do

- Do NOT reintroduce `apps/web-platform` paths — it's `apps/web` here.
- Do NOT query `users` / `organizations` / accounting tables — VibeStudio's user table is `dev_team_members`, and it is single-tenant (no `organization_id`).
- Do NOT validate `acca_token` or use `resolveOrgId()` — neither exists here.
- Do NOT reach across to `D:\ACCA`.

## Related skills
- [[vibestudio-session-bootstrap]]
- [[vibestudio-auth]]
- [[vibestudio-prompt-builder]]
- [[vibestudio-vibe-coding]]
- [[vibestudio-database]]
