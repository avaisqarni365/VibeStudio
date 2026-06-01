# TOKEN_COST_LOG.md — VibeStudio

Spend log (skill ref `06`). **Never invent token/cost numbers** — mark
`unknown` or `estimated` when exact data isn't available; copy real figures
from the Claude/Cursor/Codex/OpenAI dashboards. Live per-call data is in
`dev_prompt_history`; budgets in `.claude/cost-tracking/budget.json`.

| Date | Project | Tool | Model | Prompt type | In tok | Out tok | Total | Cost | Sub/API | Quality | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-05-31 | vibestudio | Claude Code | claude-opus-4-8 | independence + desktop + studio setup | unknown | unknown | unknown | unknown | subscription | high | multi-turn session; see `.claude/sessions/latest-session.md` |

## Rules
- Ask for a file list before loading many files.
- Summarize old context; keep stable facts in `memory.md`.
- Split large work into small tasks; prefer local AI for summarization when
  privacy/cost matter.
- Track **result quality** so cheap vs expensive prompts can be compared.

## Budget (move concrete caps to `.claude/cost-tracking/budget.json`)
- Monthly cap: TBD · Alert at: 80% · Per-model rates: fill from provider pricing.
