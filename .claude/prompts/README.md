# prompts/  — Prompt Builder library (git-backed)

Version-controlled prompt templates. This is the on-disk form of the
Prompt Library (roadmap M6): every reusable prompt is a Markdown file
with frontmatter, so prompts are diffable, forkable, and reviewable.

**Suggested file:** `<slug>.md`

```markdown
---
title: New feature (full stack)
target: [claude, cursor, codex, chatgpt]   # which assistant(s)
model: claude-opus-4-8
tags: [backend, migration]
version: 1
author: you@codes-ai.uk
---
<the prompt body, with {{placeholders}} the builder fills from a task>
```

Synced into `dev_prompt_history` for usage/cost attribution. The A/B
harness (roadmap M7) runs a prompt across targets and records win-rate.
