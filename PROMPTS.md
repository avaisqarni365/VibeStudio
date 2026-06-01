# PROMPTS.md — VibeStudio reusable prompts

Index of reusable prompts (skill ref `03`; format = `templates/prompt-template.md`).
Durable, git-tracked prompts also live in `.claude/prompts/<slug>.md`. Every
prompt must carry: context · target files · goal · constraints · acceptance ·
tests · "summarize changed files + update memory".

---

### P1 · New dev-portal feature (full stack)
> **Role:** senior full-stack engineer on VibeStudio.
> **Context:** Turborepo; web :3100 (Next 14 Pages Router, `DevPortalLayout`,
> `useDevAuth().devApi`), API :4100 (`/api/v1/dev-portal`), Postgres `dev_*`
> tables (RLS), auth = `dev_portal_token`. NO accounting / `resolveOrgId` /
> `organization_id`. Read `memory.md` + `ARCHITECTURE.md` first.
> **Task:** add **{{feature}}**.
> **Files:** migration `infrastructure/migrations/082_dev_{{slug}}.js` (up/down +
> hasTable guard); route in `apps/api/src/routes/dev-portal.ts` (`devAuth` +
> `requireRole` as needed, Zod, `{ success, data, error }`, `logActivity`);
> service method in `domains/dev-portal/src/dev-portal-service.ts`; page
> `apps/web/src/pages/dev-portal/{{slug}}.tsx` + sidebar entry in `DevPortalLayout`.
> **Constraints:** snake_case `dev_*`; project-scope via `/projects/:projectId/…`
> if applicable; no new npm dep without noting it.
> **Acceptance:** {{behavior}}. **Tests:** `npm run typecheck` clean; manual smoke on the page.
> **Report:** summarize changed files; update `memory.md` + `.claude/sessions/`.

### P2 · Fix a bug (inspect → plan → minimal diff)
> **Role:** debugger. **Context:** paste the EXACT error + the command that
> produced it + the failing file:line. Read `BUGFIX_HISTORY.md` for prior art.
> **Task:** inspect the relevant files FIRST and propose a plan; then make the
> **smallest safe change**. Don't change unrelated systems.
> **Acceptance:** error gone; add/adjust a test if feasible.
> **Report:** root cause + fix + files; append an entry to `BUGFIX_HISTORY.md`
> and the successful prompt here.

### P3 · Generate a project context pack (Context Engineering)
> **Role:** context engineer. **Task:** for project **{{slug}}**, produce the
> standard package (`PROJECT_PLAN/PRD/ARCHITECTURE/DESIGN_SYSTEM/DATABASE_DESIGN/
> API_CONTRACT/TASKS/SPRINT_BOARD/PROMPTS/BUGFIX_HISTORY/TOKEN_COST_LOG/memory/
> CLAUDE/AGENTS/.cursorrules`) under `projects/{{slug}}/`, derived from its repo.
> **Constraints:** accurate to the actual code (inventory routes/tables first).
> **Report:** list files created; note context-quality score (ref `09`).

## Per-tool reminders (TOOL_RULE)
- **Claude:** inspect → plan → edit; include `CLAUDE.md`; ask for a final summary.
- **Cursor:** small file-scoped prompts; cite exact files; `.cursorrules` applies.
- **Codex:** state target behavior + repo commands + tests; minimal diff.
- **ChatGPT:** planning/PRD/review; paste files (no live repo state).
