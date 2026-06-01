# projects/ — managed-project context packs

Vibe Engineering Studio manages **many** developer projects. The app is
already multi-project at the data layer (`dev_projects`, and 80+ of the API's
endpoints are `/projects/:projectId/...`). This folder is the **filesystem
mirror** of that: one context pack per managed project, so each project keeps
its own docs, memory, prompts, bug history, sprint, and cost log.

> The host repo (VibeStudio, the tool itself) keeps its own pack at the **repo
> root** (`/PROJECT_PLAN.md`, `/ARCHITECTURE.md`, `/memory.md`, …). Projects a
> developer *adds* live here under `projects/<slug>/`.

## Per-project pack layout

```
projects/<slug>/
├─ project.json            # metadata (maps to a dev_projects row)
├─ PROJECT_PLAN.md         # vision, modules, build order
├─ PRD.md                  # product requirements
├─ ARCHITECTURE.md         # system design
├─ DESIGN_SYSTEM.md        # UI standards
├─ DATABASE_DESIGN.md      # data model
├─ API_CONTRACT.md         # endpoints
├─ TASKS.md                # backlog
├─ SPRINT_BOARD.md         # current sprint
├─ PROMPTS.md              # reusable prompts (index of prompts/)
├─ BUGFIX_HISTORY.md       # bug + fix log
├─ TOKEN_COST_LOG.md       # spend log
├─ CLAUDE.md  AGENTS.md  .cursorrules   # per-project assistant rules
├─ memory.md               # long-term project memory
├─ sessions/  prompts/  bug-history/  cost-tracking/  sprint/
```

This is exactly the skill's **standard output package** (see
`.claude/skills/vibe-engineering-studio/SKILL.md`), scoped per project.

## Adding a project

1. **In the app:** create a project (writes a `dev_projects` row). The
   multi-project picker in `DevPortalLayout` switches active project; all
   `/projects/:projectId/*` data (tasks, sprints, prompts, wiki, activity) is
   already scoped by project.
2. **On disk:** create its context pack —
   ```bash
   python .claude/skills/vibe-engineering-studio/scripts/create_project_pack.py projects/<slug>
   # or: cp -r projects/_template projects/<slug>
   ```
3. **Link them:** put the pack path + repo path in `dev_projects.settings`
   (JSONB), e.g. `{ "docs_path": "projects/<slug>", "repo_path": "C:/code/<slug>" }`,
   and fill `project.json`.

## project.json

```json
{
  "slug": "my-app",
  "name": "My App",
  "repo_path": "C:/code/my-app",
  "stack": ["next", "express", "postgres"],
  "status": "active",
  "dev_project_id": "<uuid from dev_projects>"
}
```

## Context isolation rule

When working on a project, load ONLY that project's pack (its `memory.md`,
`sessions/latest-session.md`, `prompts/`, `bug-history/`, `sprint/`) plus the
reusable studio method (`references/01`–`10`). Never bleed one project's
context into another. The Local AI Layer indexes each pack separately.
