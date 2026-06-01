# SPRINT_BOARD.md — VibeStudio

Columns (per skill ref `07`): **Backlog · Ready · In Progress · AI Coding ·
Review · Testing · Done · Blocked.** Live data lives in `dev_sprints` /
`dev_tasks`; this file is the human-readable plan. Detailed backlog: `TASKS.md`.

## Sprint 1 — "Standalone + Studio foundation" (active)
Goal: independent repo + self-contained desktop + studio scaffold validated.

| Item | Type | Column |
|---|---|---|
| De-ACCA the codebase (config, frontend, seed, skills) | Story | ✅ Done |
| Migration `081_rebrand_ceo_email.js` | Task | ✅ Done |
| Desktop shell `apps/desktop/` (Electron) | Story | ✅ Done |
| Self-contained packaging (Next standalone + esbuild API) | Story | ✅ Done |
| Studio docs/context scaffold + multi-project `projects/` | Story | ✅ Done |
| Add-project → generate context pack (`POST /projects/:id/pack` + UI) | Story | ✅ Done |
| Per-project pack surface (path chip + generate/regenerate on cards) | Task | ✅ Done |
| Validate build + full app launch (local DB) + installer rebuild | Task | ✅ Done |
| Migrations 082 (rebrand project) + 083 (cache-token cost tracking) | Task | ✅ Done |
| Add Ollama local provider (#9) | Story | ✅ Done |
| Deep Claude integration (Opus 4.8 default, prompt caching, adaptive thinking) | Story | ✅ Done |
| Generate remaining standard-package docs | Task | ✅ Done |

## Backlog (next sprints — from TASKS.md phases)
- Context-pack generator + export (#7/A1) · Prompt Builder per-target output (#3)
- IDE Monitor fs/git watcher (#5) → auto bug capture (A4/A6)
- Cost Tracker (#6): ✅ DONE — cache capture (083) + `usage.tsx` surfacing + `budget.json`/`/ops/budget` caps + per-model **$** + budget bar + **A7 cost-per-feature ROI** (`/projects/:id/cost-roi` + Project "Cost ROI" tab) + **monthly rollups** (`/ops/cost-rollup` → `.claude/cost-tracking/YYYY-MM.md` + manager card on `usage.tsx`). (Seed `005` now enrolls `dev_project_members` — FORCE-RLS prerequisite.)
- Jira/Linear + GitHub sync (#8/A4) · Design standards gate (A10)
- Local AI RAG memory (A2) — ✅ service + endpoints + Prompt Builder "Attach memory"
- IDE Monitor (#5) ✅ — git snapshot + Git Monitor modal + **live watcher** (`watchRepo` → SSE `/ops/monitor/stream` via `devAuthNoTx` + Go-live EventSource toggle; web + desktop)
- Auto bug-capture — A6 ✅ (entry + fix prompt)
- A4 commit/PR/CI ↔ task bridge ✅ — migration 085 `dev_task_links` + `/ops/scan-commits` + `/tasks/:id/links` + **Git & CI** tab on task detail (commit-key parse, PR/CI status badges, CI can POST status)
- A3 prompt A/B lab ✅ — migration 086 (`dev_prompt_experiments` + `dev_prompt_variants`) + **Prompt A/B Lab** page (`/dev-portal/experiments`): variant cards (cost/latency/rating/tokens), live or manual runs, set winner
- A5 PII redaction guard ✅ — `_redactText` + `/redact/preview` + `/prompts/:id/{redact,share}` (share gated) + 🛡 Scan secrets in Prompt Builder + Sharing & PII card on prompt detail
- Next: mobile app (Expo/EAS) · icon + code signing · seed idempotency

## Blocked
- (none)

## Story format (use for new stories)
Title · role · goal · business value · acceptance criteria · technical notes ·
target files/modules · prompt reference · test command.
