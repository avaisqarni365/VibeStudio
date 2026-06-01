#!/usr/bin/env python3
"""Create starter markdown files for a Vibe Engineering Studio project."""
from __future__ import annotations

import argparse
from pathlib import Path

FILES = {
    "PROJECT_PLAN.md": "# PROJECT_PLAN.md\n\n## Executive summary\n\n## Users and roles\n\n## MVP scope\n\n## Risks\n\n## First implementation tasks\n",
    "PRD.md": "# PRD.md\n\n## Problem\n\n## Users\n\n## Requirements\n\n## Acceptance criteria\n",
    "ARCHITECTURE.md": "# ARCHITECTURE.md\n\n## System overview\n\n## Modules\n\n## Integrations\n\n## Security\n",
    "DESIGN_SYSTEM.md": "# DESIGN_SYSTEM.md\n\n## Screens\n\n## Components\n\n## States\n\n## Accessibility\n",
    "DATABASE_DESIGN.md": "# DATABASE_DESIGN.md\n\n## Entities\n\n## Relationships\n\n## Indexes\n",
    "API_CONTRACT.md": "# API_CONTRACT.md\n\n## Endpoints\n\n## Request/response examples\n\n## Errors\n",
    "TASKS.md": "# TASKS.md\n\n## Next tasks\n\n- [ ] ",
    "SPRINT_BOARD.md": "# SPRINT_BOARD.md\n\n## Backlog\n\n## Ready\n\n## In Progress\n\n## AI Coding\n\n## Review\n\n## Testing\n\n## Done\n\n## Blocked\n",
    "PROMPTS.md": "# PROMPTS.md\n\n## Reusable prompts\n",
    "BUGFIX_HISTORY.md": "# BUGFIX_HISTORY.md\n\n| Date | Tool | Model | Problem | Root Cause | Files Changed | Result |\n|---|---|---|---|---|---|---|\n",
    "TOKEN_COST_LOG.md": "# TOKEN_COST_LOG.md\n\n| Date | Tool | Model | Input Tokens | Output Tokens | Cost | Notes |\n|---|---|---|---:|---:|---:|---|\n",
    "memory.md": "# memory.md\n\n## Project summary\n\n## Tech stack\n\n## Current sprint goal\n\n## Lessons learned\n",
    "CLAUDE.md": "# CLAUDE.md\n\nInspect relevant files first. Propose a plan before risky edits. Keep changes focused. Summarize changed files and suggest memory updates.\n",
    "AGENTS.md": "# AGENTS.md\n\nFollow project architecture. Use minimal diffs. Run available tests. Do not expose secrets.\n",
    ".cursorrules": "Use small, file-scoped prompts. Follow existing conventions. Do not change unrelated files. Always include validation steps.\n",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create Vibe Engineering Studio starter files.")
    parser.add_argument("output_dir", help="Target project directory")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files")
    args = parser.parse_args()

    root = Path(args.output_dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)

    created = []
    skipped = []
    for name, content in FILES.items():
        path = root / name
        if path.exists() and not args.overwrite:
            skipped.append(name)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        created.append(name)

    print(f"Created {len(created)} files in {root}")
    if skipped:
        print(f"Skipped {len(skipped)} existing files: {', '.join(skipped)}")


if __name__ == "__main__":
    main()
