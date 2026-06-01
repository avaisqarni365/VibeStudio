# 04 Bug Fix Session History

Use this file when tracking bug fixes, failed prompts, regressions, and AI coding sessions.

## Bugfix log fields
Store each bug fix in `BUGFIX_HISTORY.md`:
- Date/time
- Project
- Tool used
- Model used if known
- Problem summary
- Error message or failing behavior
- Root cause
- Prompt used
- Files changed
- Commands run
- Result
- Regression risk
- Follow-up task

## Bugfix workflow
1. Capture the exact error.
2. Identify whether it is frontend, backend, database, environment, dependency, test, or prompt issue.
3. Ask AI to inspect before editing.
4. Make the smallest safe change.
5. Run validation.
6. Record successful prompt and lesson learned.
7. Update `memory.md`.

## Anti-patterns
Avoid:
- repeated blind retries
- pasting huge context without target files
- changing multiple systems in one prompt
- skipping test commands
- not recording the successful fix prompt
