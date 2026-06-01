# _template — new managed-project pack

Copy this folder to `projects/<slug>/` (or run
`python .claude/skills/vibe-engineering-studio/scripts/create_project_pack.py projects/<slug>`),
then:

1. Fill `project.json` (slug, name, repo_path, stack, dev_project_id).
2. Generate the standard docs via the `vibe-engineering-studio` skill —
   start with `references/01-project-intake.md` → `PROJECT_PLAN.md` + `PRD.md`,
   then `02-design-architecture.md` → `ARCHITECTURE/DESIGN_SYSTEM/DATABASE_DESIGN/API_CONTRACT`.
3. Per-session: read this pack's `memory.md` + `sessions/latest-session.md`
   first; save prompts/bugs/decisions back into this pack only.

The 15-file standard package is listed in `project.json.docs`.
