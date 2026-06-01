# PRD.md — Vibe Engineering Studio

## Executive summary
A unified planning + execution layer for AI-assisted software teams:
plan → design → prompt → build → debug → track → remember, across Claude /
Cursor / Codex / ChatGPT / Windsurf / local models. Replaces the stitched-
together combo of Pieces + Cursor + Jira + a token tracker + a folder watcher.
Ships as web + a standalone desktop `.exe` (mobile next).

## Target users
- **Solo / indie developer** doing AI-assisted "vibe coding" who needs
  discipline (context, history, cost control) without heavyweight process.
- **Small engineering team / lead** managing multiple projects, sprints, and
  shared prompt/decision libraries.
- **AI agents** (coding/QA/security/ops) participating as first-class members.

## User roles
`ceo` · `lead` · `product_owner` · AI agents (`agent_*`). Route-level gating;
single-tenant (scope by member + RLS).

## Feature list

### MVP (Tier 0 + already-built)
- Multi-project workspace (add projects, per-project context + docs).
- AI Prompt Builder → structured prompts for Claude/Cursor/Codex/ChatGPT.
- Sprint board + tasks + sprints (Kanban, gantt, calendar).
- Prompt library + AI chat (multi-provider; Claude default).
- Standalone desktop `.exe` (self-contained: bundled web + API).
- Context Engineering output pack (PROJECT_PLAN/ARCHITECTURE/TASKS/… generator).

### v1
- IDE Monitor (folder watch, git diffs, error capture → bug-history).
- Cost Tracker (token/$ per model, budgets, cost-per-feature ROI).
- Design Studio (architecture/DB/API/UI + security checklist + "ready-to-code" gate).
- Jira/Linear + GitHub sync.

### Later
- Local AI Layer (Ollama + local vector index) for private summaries + memory search.
- Prompt A/B + eval harness; repo-aware RAG context; secret/PII redaction; mobile app.

## Non-functional requirements
- Works offline-capable on desktop; data in Postgres (remote via tunnel today).
- Secrets never sent to cloud models (redaction; local summarization option).
- All tables `dev_*`, RLS-scoped; auditable (`dev_activity_log`).
- Any one AI provider key enables AI features (graceful 503 otherwise).

## Success criteria
- A developer can add a project, generate its context pack, produce a prompt,
  paste it into their assistant, ship the change, and have the prompt + bug +
  decision + cost recorded — in one tool.
- Desktop `.exe` boots its own API + web with no manual server steps.

## Engineering risks
- Next monorepo-standalone + esbuild externals need validation (packaging).
- Remote-DB dependency on desktop until an embedded DB lands.
- Multi-assistant prompt portability (each tool has quirks — see ref `03`).

## Module map & build order
See `PROJECT_PLAN.md` (9 modules ↔ skill refs 01–10 + added A1–A10) and `TASKS.md`.
