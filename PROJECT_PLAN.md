# PROJECT_PLAN.md — Vibe Engineering Studio

The master context-engineering doc. What we're building, how the 9 modules
map onto this repo, the extra features we're adding, and the build order.
(Companions: `ARCHITECTURE.md` deep-dive lives in the skill references;
`TASKS.md` = actionable backlog; `AGENTS.md` = agent roles; `CLAUDE.md` /
`.cursorrules` = assistant rules.)

## Vision

One unified planning + execution layer for AI-assisted software teams:
**plan → design → prompt → build → debug → track → remember**, across
Claude / Cursor / Codex / ChatGPT / Windsurf / local models — combining what
today takes Pieces + Cursor + Jira + a token tracker + a folder watcher.

## The 9 modules → repo mapping

Much of this is already scaffolded (VibeStudio = the extracted dev-portal).
"Have" = exists today, "Add" = to build.

| # | Module | What it does | Maps to (have / add) |
|---|---|---|---|
| 1 | **Project Intake** | PRD, users, roles, features, tech stack, risks | *Have:* `dev_projects`, tasks. *Add:* intake form + PRD doc type in `dev_docs`; `prompts/`/intake templates |
| 2 | **Design Studio** | Architecture, DB, API, UI flow, security checklist + **design standards** | *Have:* `architecture.tsx`, `project-explorer.tsx`, `scanProject()`. *Add:* standards/checklist gate + ADR log |
| 3 | **Prompt Builder** | Generates prompts for Claude/Cursor/Codex/ChatGPT | *Have:* `tasks/[id].tsx` builder, `prompts.tsx`, `dev_prompt_history`. *Add:* per-target output + `.claude/prompts/` sync |
| 4 | **Session Memory** | Prompt history, bug fixes, `memory.md`, decisions, lessons | *Have:* `dev_prompt_history`, `dev_activity_log`. *Add:* `memory.md` + `.claude/{sessions,bug-history}/` (done: scaffold) |
| 5 | **IDE Monitor** | Link VS Code / project folder, watch errors, git diffs, logs | *Add:* the **desktop shell** (`apps/desktop/`) is the host — fs watcher + git diff + log tail |
| 6 | **Cost Tracker** | Tokens, model usage, subscription/API spend | *Have:* `usage.tsx`, token fields in `dev_prompt_history`. *Add:* `budget.json`, alerts, cost-per-feature |
| 7 | **Context Engineering** | Generate `PROJECT_PLAN.md`, `ARCHITECTURE.md`, `TASKS.md`, `.cursorrules`, `CLAUDE.md`, `AGENTS.md` | *Have:* `generateProjectWikiPages()`/`scanProject()`. *Add:* the context-pack generator + export |
| 8 | **Sprint Board** | Jira-like epics, stories, bugs, sprint status | *Have:* `board.tsx`, `sprints.tsx`, `gantt.tsx`, `dev_sprints`/`dev_tasks`. *Add:* Jira/Linear sync (`.claude/sprint/jira-map.json`) |
| 9 | **Local AI Layer** | Optional Ollama/local model for private summaries + memory search | *Add:* `ollama` provider in `ai-provider-service.ts` + semantic search over `.claude/` + `memory.md` |

## Added features (proposed — beyond the 9)

- **A1 · Context Pack export** — one-click bundle of the Context-Engineering files (`PROJECT_PLAN/ARCHITECTURE/TASKS/.cursorrules/CLAUDE/AGENTS`) to drop into any repo. *(extends #7)*
- **A2 · Repo-aware smart context (RAG)** — index code + docs so the Prompt Builder auto-attaches the most relevant files, and Local AI does semantic memory search. *(#3 + #9)*
- **A3 · Prompt A/B + eval harness** — run one prompt across Claude/Cursor/Codex/GPT, score by rubric, track win-rate + cost per model. *(#3 + #6)*
- **A4 · Git/PR + CI bridge** — link commits/PRs to tasks, auto-move sprint cards on merge, surface CI failures into `bug-history/`, PR-review assistant. *(#5 + #8)*
- **A5 · Secret/PII redaction guard** — scrub secrets before any cloud prompt; pairs with Local AI for fully-private summaries. *(cross-cutting / #9)*
- **A6 · Decision log / ADRs** — structured, versioned architecture decisions in Session Memory. *(#2 + #4)*
- **A7 · Estimation & velocity analytics** — AI story-point estimates, burndown, **cost-per-feature ROI** (joins spend to tasks). *(#6 + #8)*
- **A8 · Global capture hotkey + command palette** — capture a prompt / bug / decision from anywhere in the desktop app (Pieces-like). *(#5)*
- **A9 · Templates & playbooks library** — shareable PRD / architecture / prompt templates with fork + star. *(#1 + #3)*
- **A10 · Quality gates ("ready-to-code")** — Design-Standards checklist that must pass before a story moves to in-progress. *(#2 + #8)*

## Build order (tied to the roadmap Tier 0)

1. **Foundation (now):** desktop shell + self-contained packaging *(done — validate the build)*; Local AI provider stub (#9); deep Claude integration.
2. **Context layer:** Context Engineering generator + Context Pack export (A1), git-backed Prompt Library + per-target output (#3/#7), `.claude/` module wiring (#4).
3. **Loop-closers:** IDE Monitor fs/git watcher (#5) → auto bug capture (A4) → fix prompts (#3); Cost Tracker budgets + ROI (#6/A7).
4. **Team layer:** Sprint Board + Jira/Linear sync (#8/A4), Design Standards gates (A10), templates library (A9).
5. **Privacy/scale:** redaction guard (A5), RAG smart context (A2), prompt A/B harness (A3), mobile app.

## Conventions

- New tables: `dev_*`, migrations `NNN_<slug>.js` (next **082**).
- `.claude/` folders are the on-disk backing for modules 3/4/6/8 — see each folder's README for the file format.
- Per-session: read `memory.md` + `.claude/sessions/latest-session.md` first; write a session summary + update `memory.md` at close.
