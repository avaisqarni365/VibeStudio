# 03 Prompt Playbooks

Use this file to generate prompts for Claude, Cursor, Codex, ChatGPT, Windsurf, or other vibe-coding tools.

## Universal prompt pattern
Use this structure:
1. Role: senior engineer, architect, QA, debugger, or refactor specialist
2. Project context
3. Current state
4. Exact task
5. Files to inspect/change
6. Constraints
7. Acceptance criteria
8. Tests/commands
9. Required summary
10. Memory update instruction

## Claude Code prompt style
Ask Claude to inspect relevant files first, propose a plan, then make changes. Include `CLAUDE.md` rules and request a final summary.

## Cursor prompt style
Reference specific files and ask for small atomic changes. Use `.cursorrules` or `.cursor/rules/project.mdc`. Avoid broad vague prompts like "fix everything".

## Codex prompt style
State the target behavior, repo commands, and tests. Ask for minimal diffs and clear explanation.

## ChatGPT planning style
Use ChatGPT for architecture, PRD, test planning, prompt generation, and code review. Avoid relying on it for live repo state unless files are pasted or uploaded.

## Prompt quality checklist
A good prompt includes:
- exact outcome
- relevant context only
- target files
- constraints
- test command
- success criteria
- what not to change
- how to report results
