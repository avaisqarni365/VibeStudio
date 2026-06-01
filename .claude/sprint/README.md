# sprint/  — Sprint Board artifacts

Planning artifacts for the Jira-like Sprint Board (epics → stories →
bugs → tasks). The live data is in `dev_sprints` / `dev_tasks`; files
here are human-authored plans, retros, and (optionally) a Jira/Linear
sync mapping.

**Suggested files:**
- `sprint-NN.md` — goal, scope, capacity, retro
- `backlog.md` — epics/stories not yet scheduled
- `jira-map.json` — `{ devTaskId: "JIRA-123" }` for two-way sync

```markdown
---
sprint: 1
status: active        # planned | active | completed
capacity_points: 55
---
## Goal
## Committed   (VIBE-1, VIBE-2 …)
## Retro       (after close)
```
