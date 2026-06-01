# bug-history/  — Session Memory: bugs & fixes

A durable log of bugs and how they were fixed, so the same class of bug
gets a ready answer next time (and the Local AI Layer can search it).

**Suggested file:** `YYYY-MM-DD-<slug>.md`

```markdown
---
date: 2026-05-31
severity: high
area: board            # module / file area
status: fixed
---
## Symptom
## Root cause
## Fix  (file:line, diff link)
## Repro / test added
## Fix prompt   (the prompt that produced the fix — link to ../prompts)
```

The IDE Monitor can auto-draft an entry from a detected error +
recent git diff; the Prompt Builder turns it into a fix prompt.
