# 05 memory.md Standard

Use this file to create or analyze project memory files for AI coding tools.

## Purpose
`memory.md` is the project memory layer. It keeps stable context that future prompts should reuse.

## Recommended sections
- Project summary
- Tech stack
- Architecture decisions
- Folder structure
- Coding conventions
- Important commands
- Environment notes
- Current sprint goal
- Active bugs
- Recent successful prompts
- Known failed prompts
- Important constraints
- Do-not-change list
- Lessons learned

## Memory update rules
Update memory after:
- architecture decisions
- major bug fixes
- new dependencies
- changed commands
- changed folder structure
- repeated AI mistakes
- useful prompt discoveries

## Boost tricks for memorizing AI tools
Use short, repeated tags:
- `TOOL_RULE: cursor uses small file-scoped prompts`
- `TOOL_RULE: claude should inspect then plan then edit`
- `TOOL_RULE: codex needs tests and minimal diff instruction`
- `BUG_RULE: always paste exact error and command`
- `COST_RULE: log model, tool, estimated tokens, result quality`

Keep memory concise. Move long session details to `BUGFIX_HISTORY.md` or `PROMPTS.md`.
