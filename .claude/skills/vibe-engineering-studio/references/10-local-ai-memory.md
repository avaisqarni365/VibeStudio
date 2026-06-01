# 10 Local AI Memory

Use this file when the user wants local AI, private project memory, or training from team experience.

## Recommended approach
Do not fine-tune first. Start with retrieval-augmented memory:
- store prompts, fixes, summaries, logs, decisions
- embed or index them locally
- retrieve relevant lessons per project/task
- generate a compact context pack for Claude/Cursor/Codex

## Local tools that may fit
- Ollama for local models
- local vector database such as Chroma, LanceDB, SQLite vector extension, or Qdrant local
- file watcher for repo changes
- local summarizer for logs and sessions

## Memory objects
Store:
- project profiles
- prompt records
- bug records
- architecture decisions
- coding standards
- tool performance notes
- cost records

## Privacy rule
Use local AI to summarize sensitive data before sending anything to cloud tools. Never store secrets in memory.
