---
date: 2026-05-31
project: vibestudio
status: closed
next_session: pick up from "Start here" below
---

# Latest session — START HERE next time

Read this + `memory.md` + `PROJECT_PLAN.md` before coding (per CLAUDE.md
operating rules). Full log: `.claude/sessions/2026-05-31-standalone-and-studio-buildout.md`.

## Where the project stands (2026-06-01)
VibeStudio is a standalone **Vibe Engineering Studio**, fully de-ACCA'd, with a
**built & validated** desktop `.exe` and several modules. The skill
`vibe-engineering-studio` is the operating mode (5-step loop; refs 01–10 method,
11–17 this repo).

**2026-06-01 — build validated:** `npm install` + `npm run desktop:build` PASS →
`apps/desktop/release/` (NSIS installer + portable + win-unpacked). Bundled API
boots (`/health` ok). Fixed 7 first-run blockers (BUGFIX_HISTORY 2026-06-01).
Windows winCodeSign workaround documented in `memory.md`. Not yet done: full app
launch against a real DB, icon, signing.

## Completed (this session)
- ✅ Independence from ACCA (config/DB/ports, AI knowledge, frontend, seed, skills) + migration `081`
- ✅ Desktop `.exe` shell + self-contained packaging (Next standalone + esbuild API)
- ✅ Skill consolidated to `vibe-engineering-studio` (refs 01–17, templates, scripts)
- ✅ Full standard doc package at root + `projects/<slug>/` multi-project packs + add-project flow
- ✅ Ollama local provider (#9)
- ✅ Deep Claude integration (Opus 4.8 default, prompt caching, adaptive thinking)
- ✅ A2 local memory search + Prompt Builder "Attach memory"
- ✅ IDE Monitor (#5) git snapshot + Git Monitor modal
- ✅ Auto bug-capture (A6): bug-history entry + fix prompt

## Open / next steps (priority order)
1. ✅ **Build validated** (2026-06-01). ✅ **Full app launch validated** (2026-06-01,
   local PostgreSQL 17): bundled API+web run, DB-backed login, CORS/cookie/proxy
   OK, authed reads return seeded data, 20/20 health. Fixed a critical missing
   middleware (`data-isolation.ts` → `withRlsTransaction`) + rebranded the default
   project (migration 082). ✅ **Installer rebuilt + verified** (packaged API authed
   read = 12 members; gotcha: `npm i -w` pruned electron → plain `npm install` fixes).
   See BUGFIX_HISTORY 2026-06-01.
2. ✅ **Migration 083** done — `cache_read_tokens`/`cache_write_tokens` on
   `dev_prompt_history`; persisted via `/ai/chat`→`createPrompt`; usage returns
   `totalCacheRead`/`totalCacheWrite`.
3. ✅ **Cost Tracker UI** in `usage.tsx` (cache read/write + est. cost) + migration 084 (missing `actor_email`/`provider`/`ai_origin`/`actor_role` on `dev_prompt_history`; `/me/usage` verified). ✅ **One-command seeder** `npm run db:seed:local` (migrate→RLS off→seed→RLS on) + ACTION_PLAN local-DB section; reads validated with RLS ENABLED.
4. ✅ **Budget caps + per-model cost:** `budget.json` + `GET /ops/budget` (`getBudget`) + `usage.tsx` per-model **$** rows + budget bar (alert past `alert_at_percent`); verified with a real prompt row (opus ≈ $0.148).
5. ✅ **A7 cost-per-feature ROI:** `getProjectCostRoi` + `GET /projects/:id/cost-roi` (spend→tasks/sprints, cost-per-point, untracked bucket) + Project **Cost ROI** tab. ⚠️ Found+fixed a seed gap: `dev_project_members` was empty so FORCE-RLS on `dev_tasks`/`dev_sprints` hid all tasks (board/ROI empty under RLS); seed `005` now enrolls all members. Verified under RLS (VIBE-11 $0.6088, $0.0468/pt; total $0.6288). See BUGFIX_HISTORY.
6. ✅ **Monthly cost rollups:** `getMonthlyRollup`/`writeMonthlyRollup` + `GET`/`POST /ops/cost-rollup` (writes `.claude/cost-tracking/YYYY-MM.md`: spend per model/provider/member/project) + manager **Monthly cost rollup** card on `usage.tsx`. Pricing centralized in `_costEngine(budget)`. Verified (June test = $0.8065, markdown correct). **Cost Tracker #6 now fully done.**
7. ✅ **A4 commit/PR/CI ↔ task bridge:** migration `085` `dev_task_links` + `scanRepoTaskLinks`/`getTaskLinks`/`upsertTaskLink`/`deleteTaskLink` + `POST /ops/scan-commits`, `GET`/`POST /tasks/:id/links`, `DELETE /task-links/:id` + **Git & CI** tab on task detail. Commit-key parse (`VIBE-11`), PR/CI status badges, CI can POST status. Verified end-to-end (temp repo scan + PR/CI upsert).
8. ✅ **A3 prompt A/B lab:** migration `086` (`dev_prompt_experiments` + `dev_prompt_variants`) + create/list/get/run/rate/decide/delete service & routes + **Prompt A/B Lab** page (`/dev-portal/experiments`) + sidebar link. `runVariant` is live (provider) or manual paste; costs via `_costEngine`, logs to `dev_prompt_history`. Verified end-to-end (A=$0.045/B=$0.027, rate, decide, cascade delete).
9. ✅ **A5 PII redaction:** `_redactText` engine + `previewRedaction`/`redactPrompt`/`setPromptShared` (share blocked until redacted) + `POST /redact/preview`, `POST /prompts/:id/{redact,share}` + **🛡 Scan secrets** in Prompt Builder + **Sharing & PII** card on prompt detail. Verified (preview 8 types, share-block→redact→share). No migration.
10. ✅ **Live IDE Monitor watcher:** `watchRepo` (poll + fs.watch, signature-dedup) → **SSE** `GET /ops/monitor/stream` via new `devAuthNoTx` (no DB trx held) + **Go live** toggle in the Git Monitor modal (EventSource). Verified: 3 snapshots auto-pushed (clean → changed → new commit). Web + desktop.
11. ✅ **Fully unlink ACCA** (2026-06-01): finished the incomplete de-ACCA extraction. Removed the sidebar "Platform Ops ↗" links to ACCA's host admin + the login "Back to ACCA Platform" link; rebranded all ~10 web pages to VibeStudio (web app now has **0** ACCA refs); converted every sidebar section to a collapsible **+/−** group (`SidebarGroup`); re-pointed the project's `linked_paths` `D:\ACCA`→`D:\VibeStudio`; `MEMORY_DIR` now derives from `cwd()`; watchdog ports `3000/4000`→`3100/4100`. See BUGFIX_HISTORY 2026-06-01 (top).
12. Seed idempotency (tasks append) · mobile app (Expo) · icon + signing · **deploy to IONOS**.

## Known caveats
- Desktop packaged build still needs a reachable Postgres (`userData/db.env`); embedded DB is future.
- Next monorepo-standalone trace + esbuild externals are the likely first thing to debug on the real build.
- `next.config` `transpilePackages` lists `@vibestudio/dev-portal` but the pkg is `@vibestudio/domain-dev-portal` (harmless today; web doesn't import it).

## Useful prompts / endpoints to remember
- Memory: `POST /api/v1/dev-portal/memory/index` then `/memory/search { query }`.
- IDE Monitor: `GET /api/v1/dev-portal/ops/monitor?path=<allowlisted>`.
- Bug capture: `POST /api/v1/dev-portal/ops/bug-capture { repo_path, title, error }`.
- Reusable prompts live in `PROMPTS.md` (P1 feature, P2 bugfix, P3 context-pack).

## How to resume
Run the `vibe-engineering-studio` skill, read `memory.md`, then take item 1 or 2 above.
