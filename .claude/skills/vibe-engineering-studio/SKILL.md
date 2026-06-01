---
name: vibe-engineering-studio
description: end-to-end vibe coding planning and design studio for software engineering teams. use when starting, auditing, or managing ai-assisted projects with claude, cursor, codex, chatgpt, windsurf, or local ai; creating prds, architecture, database design, ui flows, prompts, bug-fix sessions, memory.md, claude.md, agents.md, token/cost logs, ide monitoring plans, sprint boards, jira-style activities, context engineering files, or multi-project ai development workflows.
---

# Vibe Engineering Studio

## Purpose
Guide engineers from idea to controlled AI-assisted implementation without skipping software engineering standards. Produce project plans, design artifacts, prompts, memory files, bug-fix logs, token/cost tracking, IDE monitoring instructions, sprint activities, and local-AI memory workflows.

## Operating rule
Treat vibe coding as an engineering workflow, not only prompt writing. Always connect the user request to: goal, requirements, design, implementation prompt, validation, bug history, cost tracking, and memory update.

## Workflow decision tree
1. **New project**: use `references/01-project-intake.md`, then `02-design-architecture.md`, then `03-prompt-playbooks.md`.
2. **Existing project folder or repo**: use `references/08-ide-project-monitoring.md` and `references/09-context-engineering.md` before generating prompts.
3. **Bug fix or failed AI session**: use `references/04-bugfix-session-history.md` and update `memory.md` using `references/05-memory-md.md`.
4. **Cost/token question**: use `references/06-token-cost-tracking.md`.
5. **Multiple projects or sprint planning**: use `references/07-sprint-jira-management.md`.
6. **Local/private AI memory**: use `references/10-local-ai-memory.md`.

## Standard output package for a project
When the user asks to set up a project, create or update these files unless they ask for less:
- `PROJECT_PLAN.md`
- `PRD.md`
- `ARCHITECTURE.md`
- `DESIGN_SYSTEM.md`
- `DATABASE_DESIGN.md`
- `API_CONTRACT.md`
- `TASKS.md`
- `SPRINT_BOARD.md`
- `PROMPTS.md`
- `BUGFIX_HISTORY.md`
- `TOKEN_COST_LOG.md`
- `memory.md`
- `CLAUDE.md`
- `AGENTS.md`
- `.cursorrules` or `.cursor/rules/project.mdc`

## Prompt generation rules
Every generated prompt must include:
- project context and current repository state
- exact target file(s)
- task goal
- constraints and engineering standards
- acceptance criteria
- test command or validation steps
- instruction to summarize changed files and update memory

Use `templates/prompt-template.md` as the default format.

## Engineering standards checklist
Before suggesting implementation, ensure the plan covers:
- requirements and user stories
- architecture and module boundaries
- database/data model where relevant
- API contracts where relevant
- security, privacy, and secrets handling
- testing strategy
- error handling and logging
- deployment/configuration assumptions
- documentation and memory updates
- rollback or recovery plan for risky changes

## Session memory standard
After each meaningful AI coding session, require a short update to `memory.md` and `BUGFIX_HISTORY.md` when applicable. Record decisions, successful prompts, failed prompts, root causes, changed files, commands run, and next tasks.

## Cost awareness standard
When prompts involve model usage, encourage logging model name, estimated input/output tokens, tool used, subscription/API mode, and result quality. Never invent exact token counts if unavailable; mark them as estimated or unknown.

## Use bundled templates
Use files in `templates/` when the user asks for ready-to-copy project files. Use `scripts/create_project_pack.py` only when creating a folder of starter markdown files is helpful.

## Reference layers
Two layers of `references/`:
- **`01`–`10` — reusable studio method.** Generic, project-agnostic guidance
  for any AI-assisted project (intake → design → prompts → bugfix → memory →
  cost → sprint → IDE monitoring → context engineering → local AI).
- **`11`–`17` — VibeStudio project pack (THIS repo).** Concrete reference for
  the VibeStudio codebase itself — read these when editing this repo.

| Ref | Read when… |
|---|---|
| `11-vibestudio-architecture.md` | editing pages/router/service/layout; need the page + module map, ports |
| `12-vibestudio-auth.md` | login, `useDevAuth`, `devAuth`/`requireRole`, cookies/tokens |
| `13-vibestudio-database.md` | schema, `dev_*` tables, migrations (next 082), seeds, RLS |
| `14-vibestudio-ionos-deploy.md` | IONOS deploy, the SSH tunnel, systemd/nginx |
| `15-vibestudio-prompt-builder.md` | the AI Prompt Builder (tasks pages) + its module context |
| `16-vibestudio-vibe-coding.md` | the 7-step prompt-to-production flow |
| `17-vibestudio-modernisation-roadmap.md` | "what next?" — Tier 0 = desktop/mobile/Claude + the 9 modules |

When working in THIS repo, start from `CLAUDE.md` + `memory.md` + `PROJECT_PLAN.md`,
then pull the relevant `11`–`17` ref. The `01`–`10` method still governs *how*
you work (context loop, prompt structure, engineering standards).
