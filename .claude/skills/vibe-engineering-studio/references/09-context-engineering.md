# 09 Context Engineering

Use this file to improve project context quality for AI coding tools.

## Context layers
1. Stable project memory: `memory.md`
2. Tool-specific rules: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`
3. Current task: prompt
4. Evidence: error logs, test results, screenshots, diffs
5. Acceptance criteria: expected behavior and tests

## Context compression
When context is too large:
- summarize old sessions
- keep only current target files
- include interfaces/contracts instead of full files
- include exact error text
- move repeated facts to memory files

## Required context files
Create:
- `CLAUDE.md` for Claude Code rules
- `AGENTS.md` for Codex/agent behavior
- `.cursorrules` or `.cursor/rules/project.mdc` for Cursor
- `PROMPTS.md` for reusable prompts

## Context quality score
Rate context from 1 to 5:
1. vague idea only
2. has goal but no files/tests
3. has files and goal
4. has files, constraints, tests, memory
5. has full architecture, target files, acceptance criteria, logs, tests, and rollback note
