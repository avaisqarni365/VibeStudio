# AGENTS.md — Vibe Engineering Studio

Operating contract for AI coding agents (Claude, Cursor, Codex, ChatGPT,
Windsurf) and the in-app AI agents. Companion to `CLAUDE.md` (rules) and
`.cursorrules` (Cursor mirror). Read `memory.md` + `PROJECT_PLAN.md` first.

## Ground rules (all assistants)

- This is **VibeStudio / Vibe Engineering Studio** — a dev-tooling studio.
  **No accounting concepts** (no SKR03/journal/VAT/DATEV). It is NOT ACCA.
- Ports: web **3100**, API **4100**, DB tunnel **5545**.
- Auth is `dev_portal_token` only. No `acca_token`, no `resolveOrgId`, no
  `organization_id` (single-tenant; scope by `member_id` + RLS).
- DB: all tables `dev_*`, snake_case, UUID PKs. Never edit a shipped
  migration — add `NNN_<slug>.js` (next **082**).
- API responses: `{ success, data, error }`. Frontend calls go through
  `useDevAuth().devApi`. Pages use `DevPortalLayout`.
- Prefer the latest Claude models. AI provider keys are optional (503 if none).
- Context engineering first: state what context you used; save reusable
  prompts → `.claude/prompts/`, bugs+fixes → `.claude/bug-history/`,
  decisions → `memory.md`, session summaries → `.claude/sessions/`.

## In-app agent roles (seeded `dev_team_members`, `is_ai_agent=true`)

| Agent | Scope | Typical tasks |
|---|---|---|
| **coding** | full-stack | migrations (`dev_*`), `/api/v1/dev-portal` routes, `DevPortalLayout` pages, the Prompt Builder context |
| **ops** | infra | IONOS deploy (`deploy.sh`, systemd), the SSH tunnel, backups |
| **qa** | quality | API contract checks, auth/RLS verification, Playwright e2e (planned), a11y |
| **security** | security | auth/RLS audit, dependency + secret scans (AES-256-GCM keys), PII redaction (A5) |
| **analytics** | insight | AI usage + token/cost trends, sprint throughput, cost-per-feature (A7) |
| **release** | shipping | desktop `.exe` / mobile (EAS) builds, versioning, auto-update |

Agents use the `agent_*` role namespace; keep them out of the human role
set (ceo/lead/product_owner). Agent work is assignable on the board and
recorded in `dev_activity_log`.

## How a task flows (Vibe Coding)

Describe → create `dev_tasks` row → AI Prompt Builder composes a prompt
(module context + these rules) → paste into the chosen assistant → review
→ deploy. Every prompt should link to a task so prompt history + activity
trace back. See the `vibe-engineering-studio` skill for details.
