# sessions/  — Session Memory module

One file per working session. Captures what happened so future sessions
(and the Local AI Layer) have continuity.

**Suggested file:** `YYYY-MM-DD-<slug>.md`

```markdown
---
date: 2026-05-31
project: vibestudio
participants: [you, claude]
---
## Goal
## What changed
## Decisions  (link to ../bug-history, ../prompts, or memory.md)
## Open threads / next session
```

Backed at runtime by `dev_activity_log` + `dev_prompt_history`. The
Context Engineering module can roll these up into `PROJECT_PLAN.md` notes.
