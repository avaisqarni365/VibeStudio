# 08 IDE and Project Folder Monitoring

Use this file when the user links a VS Code workspace, local folder, repo, or wants monitoring of errors and project state.

## Monitoring goals
Track:
- git diffs
- changed files
- terminal errors
- test failures
- lint errors
- dependency changes
- TODO/FIXME comments
- environment/config issues

## Recommended local watchers
For a real implementation, create watchers for:
- file changes
- git status
- package manager logs
- test output
- build output
- VS Code problem matcher output

## AI workflow
Before editing, the AI tool should know:
- repo structure
- current branch
- recent diffs
- failing command
- exact error
- target module
- project memory

## Safety rules
- Never send `.env`, keys, secrets, private customer data, or credentials to cloud AI.
- Summarize sensitive logs locally before sharing.
- Ask before modifying database migrations, auth, payments, or production config.
