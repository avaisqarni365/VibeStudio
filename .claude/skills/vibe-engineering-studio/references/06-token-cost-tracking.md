# 06 Token and Cost Tracking

Use this file when the user wants to monitor token usage, prompt spending, subscription usage, or API costs.

## Log file
Create `TOKEN_COST_LOG.md` with a table:
- Date
- Project
- Tool
- Model
- Prompt type
- Input tokens
- Output tokens
- Total tokens
- Cost
- Subscription/API
- Result quality
- Notes

## Rules
- Never invent exact token or cost numbers.
- If exact data is unavailable, mark as `unknown` or `estimated`.
- Encourage copying usage data from Claude/Cursor/Codex/OpenAI dashboards where possible.
- Track result quality so the team can compare cheap vs expensive prompts.

## Cost-control prompt tactics
- Ask for a file list before loading many files.
- Use summaries for old context.
- Split large work into small tasks.
- Keep stable project knowledge in `memory.md`.
- Use local AI for summarization when privacy and cost matter.
