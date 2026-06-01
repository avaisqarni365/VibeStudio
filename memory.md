# Project Memory

> Read before coding (per CLAUDE.md "Project AI Operating Rules").
> Durable facts only — session detail goes in `.claude/sessions/`.

## Product Goal
Build a **Vibe Engineering Studio** for planning, designing, prompting,
debugging, token tracking, IDE monitoring, sprint management, and local AI
memory. 9 modules — see `PROJECT_PLAN.md` for the full module map, repo
mapping, added features, and phased build order.

## Current Architecture
- Turborepo: `apps/web` (Next.js 14, :3100) · `apps/api` (Express, :4100) ·
  `apps/desktop` (Electron shell, self-contained .exe) · `domains/dev-portal`
  (service) · `packages/{config,database,logging,utils}`.
- Postgres on IONOS via SSH tunnel `127.0.0.1:5545`; all tables `dev_*`.
- Auth: `dev_portal_token` (httpOnly cookie + Bearer fallback). Single-tenant, RLS.
- AI: `domains/dev-portal/src/ai-provider-service.ts` — Anthropic (Claude
  **Opus 4.8** default, prompt caching, adaptive thinking) / OpenAI / DeepSeek /
  Moonshot / Groq / **Ollama (local, keyless)** + `embedTexts()` for memory search.
- Extracted standalone from ACCA on 2026-05-31 — no accounting concepts.

## Operating mode
- Drive work through the **vibe-engineering-studio** skill. Every output runs
  the 5-step context loop: (1) goal → (2) current architecture → (3) previous
  bugs → (4) better design/code → (5) update memory + session notes.
- Standard per-project output package (skill): PROJECT_PLAN, PRD, ARCHITECTURE,
  DESIGN_SYSTEM, DATABASE_DESIGN, API_CONTRACT, TASKS, SPRINT_BOARD, PROMPTS,
  BUGFIX_HISTORY, TOKEN_COST_LOG, memory, CLAUDE, AGENTS, .cursorrules.
  Status: **all ✅ at repo root** (the host repo's own pack).
- **Multi-project:** the app is already multi-project (`dev_projects` +
  `/projects/:projectId/*`). Filesystem context packs for *managed* projects
  live under `projects/<slug>/` (`projects/README.md`, `projects/_template/`).
  Link each pack to its `dev_projects` row via `settings.docs_path`.
- **Add-project pack flow (built):** `createProjectPack()` in the service →
  `POST /projects/:projectId/pack` → portfolio New-Project modal checkbox.
  Scaffolds `projects/<slug>/` from `_template` + 15 doc stubs, sets
  `settings.docs_path`. Idempotent (re-run relinks without overwriting unless `force`).
- `TOOL_RULE`: claude = inspect → plan → edit. cursor = small file-scoped prompts.
  codex = tests + minimal diff. `BUG_RULE`: always paste exact error + command.
  `COST_RULE`: log model, tool, est. tokens, result quality.
- Complete feature catalog: `PROJECT_PLAN.md` (9 modules ↔ skill refs 01–10 + added A1–A10).

## Important Decisions
- **Access model (2026-06-01):** `dev_projects` = workspaces; membership in `dev_project_members`. **`ceo` = super-admin** (sees all projects, enters any workspace) via an RLS bypass — GUC `app.current_dev_member_role='ceo'` in the `member_scope` policies (migration 087) + `requireProjectMembership(...,role)` short-circuit. Everyone else is scoped to linked projects (`listProjects`/`getPortfolioStats` take `(viewerId,role)`). Login lands on a visible project via `resolveActiveProjectId`. **New project-scoped routes MUST pass `req.devUser.role` to `requireProjectMembership`.** Per-member tables (prompt history, bookmarks, favorites, code notes, channels) are NOT bypassed.
- **Electron over Tauri** for desktop (pure-JS, wraps Next.js directly).
- **Fixed ports 3100/4100** in the packaged app (keeps `NEXT_PUBLIC_API_URL` + CORS consistent).
- **API is esbuild-bundled, not tsc'd** — workspace `main` fields point at raw `.ts`.
- **English-only** — `@vibestudio/i18n` was not extracted; `apps/web/src/lib/i18n.tsx` is a local stub.
- Identity placeholders: `@codes-ai.uk`, `github.com/codes-ai/vibestudio`, `vibestudio.codes-ai.uk`.

## Reusable Prompts
- `PROMPTS.md` (P1 feature · P2 bugfix · P3 context-pack) + git-backed `.claude/prompts/`.
- Prompt Builder can auto-attach top-k memory (🧠 Attach memory) and auto-saves prompts to history on Copy.

## Repeated Bugs and Fixes
- Logged in `BUGFIX_HISTORY.md` + `.claude/bug-history/`. 5 from 2026-05-31:
  missing `@vibestudio/i18n`, `.gitignore` hid `apps/desktop/`, ops endpoints hit
  ACCA `users`/`organizations`, scan path `web-platform`, config defaulted to `accadb`.
- Auto-capture: Git Monitor → "Capture bug" → `.claude/bug-history/` entry + fix prompt.

## Token / Cost Notes
- Live source: `dev_prompt_history`. `callAnthropic` now returns `cacheReadTokens`/`cacheWriteTokens` (not yet persisted — migration 082 pending). Rollups + `budget.json` in `.claude/cost-tracking/`.

## Sprint Status
- Live in `dev_sprints`/`dev_tasks`; plans in `.claude/sprint/` + `SPRINT_BOARD.md`. Sprint 1 = standalone + studio foundation (done).

## Built so far (2026-05-31)
Independence + migration 081 · desktop `.exe` + self-contained packaging ·
consolidated `vibe-engineering-studio` skill (refs 01–17) · full root doc package ·
`projects/<slug>/` multi-project packs + add-project flow · Ollama provider ·
deep Claude integration · A2 memory search (+ Prompt Builder hookup) ·
IDE Monitor (#5, pull-based) · auto bug-capture (A6).

## Build/runtime status (validated 2026-06-01)
- `npm install` (619 pkgs) + `npm run desktop:build` **PASS** → `apps/desktop/release/`
  `VibeStudio Setup 0.0.1.exe` (NSIS) + `VibeStudio 0.0.1.exe` (portable) +
  `win-unpacked/`. Bundled API/web present; bundled API boots, `/health` ok.
- 7 build blockers fixed — see BUGFIX_HISTORY 2026-06-01 (next.config experimental
  key, team.tsx cast, dead `posting-accounts` export, electronVersion pin,
  reinstall 7zip-bin/app-builder-bin/app-builder-lib, winCodeSign cache workaround,
  logging service `acca`→`vibestudio`).
- Added desktop deps: `7zip-bin`, `app-builder-bin` (pin); electron 31.7.7.
- **Windows note:** electron-builder needs `winCodeSign-2.6.0` pre-extracted into
  `%LOCALAPPDATA%/electron-builder/Cache` without `*.dylib` (or enable Developer Mode);
  build with `CSC_IDENTITY_AUTO_DISCOVERY=false` (unsigned).

## Full app launch — validated 2026-06-01 (local PostgreSQL 17)
- Local DB: `postgres`/`postgres` superuser; created `vibestudio` role+DB; `db:migrate` (13 incl. 082) + `db:seed`.
- **RLS disabled on `dev_*` for the local test** (seed doesn't set the GUC — V4). GUC is `app.current_dev_member_id` (not `app.current_member_id` — docs corrected).
- Ran bundled API (:4100, local DB) + bundled web (:3100): login DB-backed (CEO `ceo@codes-ai.uk` / `DevPortal@2024`), CORS + httpOnly cookie OK, web serves UI (200), web→API `/api/v1` proxy OK, authed reads = 12 members / 1 project / 29 tasks, 20/20 health. **Stack stable.**
- **Fixed (critical):** `apps/api/src/middleware/data-isolation.ts` was missing (never extracted) → `devAuth`→`withRlsTransaction` threw on every authed request → `INVALID_TOKEN`. Recreated using `knexBase`+`dbStore` (ALS per-request trx). API bundle rebuilt.
- Rebranded default project (migration 082): "ACCA Platform"→"VibeStudio".

## Done since launch test (2026-06-01)
- ✅ **Installer rebuilt** with the middleware fix embedded — fresh `VibeStudio Setup 0.0.1.exe` + portable; verified the packaged `api.cjs` contains `withRlsTransaction` and an authed read returns 12 members.
  - **Gotcha:** `npm install <pkg> -w <workspace>` pruned `electron` → `tsc` failed "Cannot find module 'electron'". Fix: plain `npm install` at root restores it. Build needs `CSC_IDENTITY_AUTO_DISCOVERY=false` + cached winCodeSign.
- ✅ **Migration 083** cache-token cost tracking: `cache_read_tokens`/`cache_write_tokens` on `dev_prompt_history`; `/ai/chat`→`createPrompt` persists them; usage aggregation returns `totalCacheRead`/`totalCacheWrite`.

- ✅ **Cost Tracker UI:** `usage.tsx` shows Cache read / Cache write / **Est. cost** (public list prices; cache read ≈0.1× in, write ≈1.25×; local models $0). `/me/usage` totals/byModel/recent carry cache tokens.
- ✅ **Migration 084** (`provider`/`ai_origin`/`actor_email`/`actor_role` on `dev_prompt_history` — were missing; `/me/usage` 500'd without them). Dropped dead `actor_org_id` (single-tenant). Verified `/me/usage` OK under RLS.
- ✅ **One-command seeder:** `npm run db:seed:local` (`scripts/seed-local.mjs`) = migrate → RLS off → seed → RLS on. App role owns tables → toggles RLS itself. ACTION_PLAN has the local-DB section. App reads validated with RLS ENABLED (`withRlsTransaction` sets the GUC).

- ✅ **Budget caps + per-model cost:** `.claude/cost-tracking/budget.json` (caps + per-model prices) served by `GET /ops/budget` (`getBudget()`); `usage.tsx` reads it for per-model **$** rows, total est. cost, and a **budget bar** (spend vs cap, amber/red past `alert_at_percent`). Prices substring-matched against model id; cache read ≈0.1× in, write ≈1.25×, local = $0. Verified with a real prompt row (opus ≈ $0.148).
- ✅ **A7 cost-per-feature ROI:** `getProjectCostRoi(projectId)` + `GET /projects/:projectId/cost-roi` joins `dev_prompt_history.task_id` → `dev_tasks`/`dev_sprints`, costs each (task,model) bucket with `budget.json`, and returns per-task cost + per-sprint cost & **cost-per-point** + an `untracked` bucket (prompts with no `task_id`). Surfaced as a **Cost ROI** tab in `project.tsx`. Gated by `devAuth` + DB RLS only (matches `/prompt-stats`). Verified end-to-end under RLS (VIBE-11 = $0.6088, $0.0468/pt; total $0.6288).
- ✅ **Monthly cost rollups:** `getMonthlyRollup(month)` + `writeMonthlyRollup(month)` (writes `.claude/cost-tracking/YYYY-MM.md`) + `GET /ops/cost-rollup?month=` (compute + months list) + `POST /ops/cost-rollup` (managers, persists file). One grouped query over (author,project,provider,model) folded into byModel/byProvider/byMember/byProject + totals. Pricing centralized in shared `_costEngine(budget)` (used by A7 + rollups + matches `usage.tsx`). UI: manager-only **Monthly cost rollup** card on `usage.tsx` (month picker + Save). Verified: June test = $0.8065, markdown correct.
- ✅ **Live IDE Monitor (#5 watcher):** `watchRepo(target,onChange,{intervalMs})` (git-status poll dedup'd by change-signature + best-effort recursive `fs.watch` accelerator ignoring node_modules/.git/.next/dist; returns stop()). Exposed as **SSE** `GET /ops/monitor/stream?path=&interval=` via a new **`devAuthNoTx`** middleware (token/session verify WITHOUT `withRlsTransaction`, so the long-lived stream holds no DB connection — reusable pattern for any SSE/long-poll). UI: **Go live** toggle in the Git Monitor modal (`project-explorer.tsx`) opens an `EventSource` (withCredentials → cookie) and live-updates the snapshot; Refresh disabled while live. Works in web + desktop (shared bundled API). Verified via SSE curl: clean → working-tree change (changed=1) → new commit (head changed), 3 snapshots auto-pushed.
- ✅ **A5 PII redaction:** pure `_redactText` engine (private keys, AWS/Google/GitHub/Slack keys, `sk-`/`sk-ant-`, JWT, Bearer, `SECRET/PASSWORD/TOKEN/API_KEY=…`, credit card, email, IPv4). Service: `previewRedaction` (stateless), `redactPrompt` (persist + set `is_pii_redacted`), `setPromptShared` (**blocks sharing until redacted**, auto-marks clean prompts). Routes: `POST /redact/preview`, `POST /prompts/:id/redact`, `POST /prompts/:id/share` (owner/admin via `author_id` — note existing PUT/DELETE check the nonexistent `member_id`, so only admins; new routes use `author_id`). UI: **🛡 Scan secrets** button in the task Prompt Builder (preview + "Redact in prompt") + **Sharing & PII** card on the prompt detail (Redact / Share with guard). Verified: preview 8 types, share blocked→redact→share ok. No migration (columns existed).
- ✅ **A3 prompt A/B testing:** migration `086` `dev_prompt_experiments` + `dev_prompt_variants`. Service: `createExperiment`/`listExperiments`/`getExperiment` (decorated avg cost/ms/rating/tokens) / `runVariant` (live via `ai-provider-service.chatCompletion` OR `{manual:{response,tokens}}`; costs via shared `_costEngine`; logs to `dev_prompt_history` ai_origin `ab_test`) / `rateVariant` / `decideExperimentWinner` / `deleteExperiment`. Routes: `GET/POST /projects/:id/experiments`, `GET/DELETE /experiments/:id`, `POST /experiments/:id/decide`, `POST /experiments/:id/variants/:vid/run`, `POST /variants/:vid/rate` (all membership-gated). UI: new **Prompt A/B Lab** page (`/dev-portal/experiments`) + sidebar link — create, variant cards side-by-side (cost/ms/rating/tokens), run live or manual, star-rate, set winner. Verified: A($0.045 opus)/B($0.027 sonnet) manual runs, rate, decide=A, cascade delete.
- ✅ **A4 commit/PR/CI ↔ task bridge:** migration `085` `dev_task_links` (link_type commit|pr|ci, ref, title, url, status, branch, repo, author, external_at; unique (task,type,ref); NOT force-RLS, route-gated like `dev_prompt_history`). Service: `scanRepoTaskLinks` (parses `[A-Z]+-\d+` from commit subjects + branch-on-HEAD, upserts commit links), `getTaskLinks`, `upsertTaskLink`, `deleteTaskLink`. Routes: `POST /ops/scan-commits` (path-allowlisted), `GET`/`POST /tasks/:id/links`, `DELETE /task-links/:id`. UI: **Git & CI** tab on task detail (commit/PR/CI rows + status badges + scan button + add-link form; CI can POST status). Verified: temp repo scan linked VIBE-11/VIBE-12, ignored keyless commit + nonexistent VIBE-999; PR+CI upsert → latestCi=success.
- ⚠️ **Seed gap fixed (RLS):** `dev_tasks`/`dev_sprints` enforce **FORCE** member-scope RLS via `dev_project_members`, but the seed never populated that table → board/tasks/ROI were empty for everyone once RLS was on (the earlier launch test only worked because RLS was disabled). Seed `005` now enrolls all 12 members on the project (idempotent, `onConflict.ignore`). **Any new project-scoped reads need a `dev_project_members` row, not just `devAuth`.** See BUGFIX_HISTORY 2026-06-01.

## Next Steps
1. **Seed idempotency** — task seed appends on re-run; make it upsert or guard.
2. Mobile app (Expo/EAS) · `assets/icon.ico` + code signing · seed idempotency. (Done: Cost Tracker #6 — capture + usage UI + budget caps + A7 ROI + monthly rollups; A4 commit/PR/CI bridge; A3 prompt A/B lab; A5 PII redaction; live IDE Monitor SSE watcher.)

## Session log
- 2026-05-31 → `.claude/sessions/2026-05-31-standalone-and-studio-buildout.md` (full) · `.claude/sessions/latest-session.md` (start-here summary).