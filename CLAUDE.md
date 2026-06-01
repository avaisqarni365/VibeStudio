# CLAUDE.md — VibeStudio

This file is loaded into every Claude Code conversation in this repo.

## What is VibeStudio?

A standalone **Vibe Code Prompt Studio** — project management +
sprint board + AI prompt library + wiki + activity feed for
vibe-coding teams. Extracted from ACCA's `/dev-portal/` on 2026-05-31
to be modernised independently.

The host (ACCA) is a German accounting SaaS at `D:\ACCA`. VibeStudio
no longer has any accounting concepts — no SKR03, no journal_entries,
no GoBD, no VAT. **If you find yourself reasoning about any of those,
you have the wrong project open.**

## Stack

- Turborepo + npm workspaces
- Node ≥ 20, TypeScript (strict)
- API: Express 4 on `:4100` (`apps/api`)
- Web: Next.js 14 Pages Router on `:3100` (`apps/web`)
- DB: PostgreSQL on IONOS VM (`212.227.54.250`), reached via local SSH
  tunnel on `127.0.0.1:5545`
- Tailwind CSS (no design-system pkg yet — slimmed from ACCA)
- Auth: dev-portal-specific JWT in httpOnly cookie `dev_portal_token`
- AI providers (any one is enough to enable the prompt features):
  Anthropic / OpenAI / DeepSeek / Moonshot / Groq · **Ollama (local, keyless)**

## Layout

```
apps/api/                Express, single route at /api/v1/dev-portal
apps/web/                Next.js, every page under /dev-portal/*
domains/dev-portal/      Business services (1 file: 2008 lines)
packages/{database,config,logging,utils}   Shared TS
infrastructure/migrations/    11 migrations creating 29 dev_* tables
infrastructure/seeds/         005_dev_portal_data.js (CEO + 6 AI agents)
scripts/                 IONOS SSH tunnel scripts
deploy/                  systemd, nginx, deploy.sh
.claude/skills/vibe-engineering-studio/   SKILL.md + references/ (architecture, auth, db, deploy, prompt-builder, vibe-coding, roadmap) + scripts/
.claude/{sessions,prompts,bug-history,cost-tracking,sprint}/   studio module folders
```

## Common commands

```bash
# First-time setup (see ACTION_PLAN.md for full steps)
cp .env.example .env       # then fill in DB password + JWT secrets + AI keys
npm install
node scripts/ensure-db-tunnel.js   # opens 127.0.0.1:5545 → IONOS
npm run db:migrate
npm run db:seed

# Daily
npm run dev                # turbo: api on :4100 + web on :3100
npm run dev:api            # api only
npm run dev:web            # web only
npm run typecheck
npm run build

# DB
npm run db:migrate
npm run db:rollback
npm run db:seed
npm run db:reset           # rollback all + migrate + seed
```

## Hard rules

| ID | Rule |
|---|---|
| V1 | All packages are `@vibestudio/*`. There must be ZERO `@acca/*` references — if you find one, it's a leftover, fix it |
| V2 | Database is on IONOS, reached via SSH tunnel on `127.0.0.1:5545`. ACCA uses `5544` on the same machine — these MUST NOT clash |
| V3 | The `dev_portal_token` cookie is httpOnly + `SameSite=Lax` + `Secure` in production. Set by `setDevAuthCookie()` based on `NODE_ENV` |
| V4 | RLS on `dev_*` tables: disabled per 078, re-enabled per 079. The GUC the policies read is **`app.current_dev_member_id`**. Set via `SELECT set_config('app.current_dev_member_id','<uuid>',true)` in a trx. The API does this in `middleware/data-isolation.ts` (`withRlsTransaction`); `db:seed` does NOT — seed under RLS needs it set or a superuser |
| V5 | AI provider keys are optional in dev (returns 503 if none set). Always check `process.env.<PROVIDER>_API_KEY` before calling out |
| V6 | NEVER copy back from ACCA without checking — that project drifts on its own schedule |
| V7 | The 4 inherited `acca-dev-portal-*` skills have been REPLACED by VibeStudio-native ones (`vibestudio-architecture`, `vibestudio-auth`, `vibestudio-prompt-builder`, `vibestudio-vibe-coding`). Keep all `.claude/skills/` VibeStudio-native — no `acca-*` skills should reappear |

## Project direction (top priority)

Set 2026-05-31 by the owner: **desktop + mobile are the priority.** Ship a
standalone `.exe`, fully wired to **Claude subscriptions / AI provider APIs**,
with everything a developer needs for **prompt engineering and context
tooling**. These lead the backlog — see Tier 0 (D1–D4) in
`.claude/skills/vibe-engineering-studio/references/17-vibestudio-modernisation-roadmap.md`.

## Modernisation backlog (open items)

See `.claude/skills/vibe-engineering-studio/references/17-vibestudio-modernisation-roadmap.md` for the full list. Highlights:

- **Standalone desktop app (.exe)** — `apps/desktop/` (Electron/Tauri) [Tier 0]
- **Mobile app** — `apps/mobile/` (Expo/EAS) [Tier 0]
- **Deep Claude integration** — default provider, model picker, prompt caching [Tier 0]
- **Prompt-engineering & context tooling** — git-backed prompt library + A/B [Tier 0]
- CJS → ESM throughout
- bcryptjs → argon2id
- Add Playwright e2e
- Pages Router → App Router (optional; behind the desktop/mobile shells)
- Dark mode by default

## When something goes wrong

`ACTION_PLAN.md` has a Troubleshooting table. The most frequent
issues are:

| Symptom | Fix |
|---|---|
| `npm install` slow | first run only — be patient |
| `psql ... could not connect` | tunnel not running → `node scripts/ensure-db-tunnel.js` |
| 404 on dev-portal API call | route not mounted in `apps/api/src/index.ts` |
| Tailwind classes don't style | `cd apps/web && npx tailwindcss build` once |
| Login OK but board empty | not seeded → `npm run db:seed` |

## When you ship a change

- Update relevant skills in `.claude/skills/`
- Update `ACTION_PLAN.md` checkboxes
- If you touch the DB schema, ship a new migration (`NNN_<slug>.js`) — never edit an existing one
- If you change auth flow, update `.claude/skills/vibe-engineering-studio/references/12-vibestudio-auth.md`
# Project AI Operating Rules

Always use context engineering before every output.

Before coding:
- Read memory.md
- Read .claude/sessions/latest-session.md if available
- Check .claude/prompts/
- Check .claude/bug-history/
- Understand current sprint from .claude/sprint/

For every response:
- Explain what context was used
- Improve the project structure if needed
- Save reusable decisions into memory.md
- Save important prompts into .claude/prompts/
- Save bugs and fixes into .claude/bug-history/

At session close:
- Create a session summary in .claude/sessions/
- Update memory.md
- List completed tasks, open tasks, bugs, next steps, and useful prompts