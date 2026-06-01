# ARCHITECTURE.md — VibeStudio

## System overview
Turborepo monorepo. A Next.js web app and an Express API talk to a shared
Postgres (on IONOS, reached via SSH tunnel in dev). A desktop Electron shell
can bundle and run both locally. Single business surface: the dev-portal.

```
┌───────────────────────────── Platform shells ─────────────────────────────┐
│  apps/web (Next.js 14, :3100)   apps/desktop (Electron → self-contained .exe)│
│                                  [planned] apps/mobile (Expo)                │
└───────────────┬─────────────────────────────────────────────┬──────────────┘
                │ HTTP /api/v1/dev-portal                       │ spawns (packaged)
┌───────────────▼─────────────┐                   ┌─────────────▼──────────────┐
│ apps/api (Express, :4100)   │                   │ bundled web + api (Node)    │
│ routes/dev-portal.ts        │                   └─────────────────────────────┘
└───────────────┬─────────────┘
                │ imports
┌───────────────▼───────────────────────────── Core ────────────────────────┐
│ domains/dev-portal (service)  ·  packages/{config,database,logging,utils}   │
│ Postgres (dev_* tables, RLS)  ·  AI providers (ai-provider-service.ts)       │
└────────────────────────────────────────────────────────────────────────────┘
```

## Frontend modules (`apps/web/src/pages/dev-portal/`, 30 pages)
- Plan & Track: `index`, `board`, `tasks/[index|[id]]`, `my-tasks`, `calendar`, `gantt`, `sprints`
- Collaborate: `team`, `portfolio`, `channels`, `inbox`, `knowledge`, `wiki`
- AI: `agents`, `prompts`, `ai`, `usage`
- Ops: `deployments`, `environments`, `architecture`, `project-explorer`, `project`, `guide`, `settings`, `help`, `login`
- Layout `DevPortalLayout` (multi-project picker, sidebar, ⚡ Vibe Coding panel).
- Data access via `useDevAuth().devApi`; English-only i18n shim (`lib/i18n.tsx`).

## Backend modules (`apps/api/src/routes/dev-portal.ts`, ~133 endpoints)
Grouped: auth, team, projects, sprints, tasks, spaces/lists/docs, channels/
messages, inbox, bookmarks/favorites, prompts, ai, mobile, code-files, ops,
search. All under `/api/v1/dev-portal`. See `API_CONTRACT.md`.

## Data
Postgres, 29 `dev_*` tables, UUID PKs, snake_case, JSONB for flexible data,
RLS enabled. AES-256-GCM for mobile-deploy credentials. See `DATABASE_DESIGN.md`.

## Auth & permissions
`dev_portal_token` JWT (httpOnly cookie + Bearer fallback). `devAuth`
middleware + `requireRole(...)`. Single-tenant; RLS scopes by
`app.current_member_id`. No `acca_token` / `resolveOrgId`. See `12-vibestudio-auth.md`.

## AI layer
`domains/dev-portal/src/ai-provider-service.ts` — provider registry
(Anthropic/OpenAI/DeepSeek/Moonshot/Groq; Ollama planned). `ai-call-logger.ts`
records usage to `dev_prompt_history`. Prefer latest Claude models.

## Desktop (self-contained)
`apps/desktop/` (Electron). Packaging: `next build` (`output: 'standalone'`) +
esbuild API bundle (inlines `@vibestudio/*` TS, externalises knex/pg),
assembled by `scripts/prepare-server.mjs`, spawned on :3100/:4100 via
`ELECTRON_RUN_AS_NODE`. Secrets auto-generated in `userData`; DB via
`userData/db.env`.

## Logging & observability
`@vibestudio/logging` (`createLogger`); X-Request-Id on every request;
`dev_activity_log` for the in-app audit trail.

## Deployment
IONOS VM: systemd (`vibestudio-api/web`) + nginx + certbot; `deploy/deploy.sh`
(git pull → install → migrate → build → restart). Ports web 3100 / api 4100 /
tunnel 5545 (ACCA uses 3000/4000/5544 on the same VM). See `14-vibestudio-ionos-deploy.md`.

## Multi-project
`dev_projects` + project-scoped endpoints (`/projects/:projectId/*`); the
`DevPortalLayout` picker switches active project. Filesystem context packs live
in `projects/<slug>/` (see `projects/README.md`).
