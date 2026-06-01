# TASKS.md — Vibe Engineering Studio

Actionable backlog generated from `PROJECT_PLAN.md`. Status: ☐ todo ·
◐ in progress · ✅ done. Module refs (#n) and feature refs (An) point at
`PROJECT_PLAN.md`. Mirror committed work into `dev_tasks` on the board.

## Phase 0 — Independence + shell (mostly done)
- ✅ De-ACCA the codebase (config, frontend, seed, service, skills)
- ✅ Migration `081_rebrand_ceo_email.js`
- ✅ Desktop shell `apps/desktop/` (Electron)
- ✅ Self-contained packaging (Next standalone + esbuild API, spawned by shell)
- ✅ **Validated** `npm install && npm run desktop:build` → runnable `.exe` (NSIS + portable); full app launch tested vs local PostgreSQL 17 (login, CORS, proxy, authed reads). Fixed missing `data-isolation.ts` middleware; migrations 082 (rebrand project) + 083 (cache tokens).
- ☐ English-only i18n stub verified across all pages (`apps/web/src/lib/i18n.tsx`)

## Phase 1 — Foundation
- ✅ #9 Add `ollama` provider to `domains/dev-portal/src/ai-provider-service.ts` (local, no key)
- ✅ Deep Claude integration: Opus 4.8 default, prompt caching, adaptive thinking, sampling-param handling, cache-usage surfacing
- ☐ A8 Global capture hotkey + command palette in the desktop shell

## Phase 2 — Context layer
- ☐ #7 Context-pack generator → `PROJECT_PLAN/ARCHITECTURE/TASKS/.cursorrules/CLAUDE/AGENTS` (extend `scanProject()`/`generateProjectWikiPages()`)
- ☐ A1 Context Pack export (zip/drop-in)
- ☐ #3 Prompt Builder: per-target output (Claude/Cursor/Codex/ChatGPT) + sync to `.claude/prompts/` + `dev_prompt_history`
- ☐ #1 Project Intake form (PRD/users/roles/features/tech-stack/risks) → `dev_docs` doc type + templates

## Phase 3 — Loop-closers
- ✅ #5 IDE Monitor: `getRepoStatus()` + `GET /ops/monitor` + Git Monitor modal (pull) **and live watcher** — `watchRepo()` + SSE `GET /ops/monitor/stream` (via `devAuthNoTx`, no DB trx) + **Go live** EventSource toggle in the Git Monitor modal (web + desktop)
- ✅ A4 Git/PR + CI bridge: IDE Monitor git state + **migration 085 `dev_task_links`** + `POST /ops/scan-commits` (commit-key→task) + `GET/POST /tasks/:id/links` + `DELETE /task-links/:id` + **Git & CI** tab on task detail (commit/PR/CI rows, status badges, CI can POST status)
- ✅ A6 Auto bug capture → `captureBug()` + `POST /ops/bug-capture` + Git Monitor "Capture bug" form (writes `.claude/bug-history/` entry + fix prompt)
- ✅ #6 Cost Tracker (DONE): cache-token capture (083) + `usage.tsx` surfacing + migration 084 + `db:seed:local` + `budget.json` caps + `/ops/budget` + per-model **$** rows + budget bar w/ alert + **A7 cost-per-feature ROI** (`/projects/:id/cost-roi` + Project "Cost ROI" tab) + **monthly rollups** (`GET`/`POST /ops/cost-rollup` → `.claude/cost-tracking/YYYY-MM.md` + manager card on `usage.tsx`; shared `_costEngine`)
- ⚠️ Seed fix: `005` now enrolls members into `dev_project_members` (FORCE RLS on `dev_tasks`/`dev_sprints` requires it — board/tasks/ROI were empty under RLS without it)

## Phase 4 — Team layer
- ☐ #8 Sprint Board: Jira/Linear sync (`.claude/sprint/jira-map.json`)
- ☐ #2 Design Studio: security checklist + design standards; A10 "ready-to-code" gate; A6 ADR log
- ☐ A9 Templates & playbooks library (fork/star)

## Phase 5 — Privacy / scale
- ✅ A5 Secret/PII redaction guard — `_redactText` (keys/tokens/JWT/email/IP/CC/secret-assignments) + `POST /redact/preview`, `/prompts/:id/redact`, `/prompts/:id/share` (share blocked until redacted) + **🛡 Scan secrets** in Prompt Builder + Sharing & PII card on prompt detail
- ✅ A2 Local AI memory search — `memory-search-service` (Ollama embeddings + JSON cosine index + lexical fallback) + `/memory/{index,search}` + Prompt Builder "Attach memory" hookup (`tasks/[id].tsx`)
- ✅ A3 Prompt A/B lab — migration 086 (`dev_prompt_experiments` + `dev_prompt_variants`) + experiment/variant/run/rate/decide routes + **Prompt A/B Lab** page (`/dev-portal/experiments`): variant cards with avg cost/latency/rating/tokens, live or manual runs, set winner. Eval angle = cost-per-model comparison built in.
- ☐ Mobile app (`apps/mobile/`, Expo/EAS)

## Always-on (from CLAUDE.md operating rules)
- ☐ Each session: read `memory.md` + `.claude/sessions/latest-session.md`; write a session summary + update `memory.md` at close
- ☐ Save reusable prompts → `.claude/prompts/`; bugs+fixes → `.claude/bug-history/`
