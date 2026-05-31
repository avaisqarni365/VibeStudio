---
name: vibestudio-session-bootstrap
description: "Use at the start of every VibeStudio session. Orients Claude to the project: what it is, what it's NOT (the ACCA accounting host it came from), how to start the IONOS tunnel, port assignments (api 4100, web 3100, db tunnel 5545), and where the action plan + migration guide live."
---

# VibeStudio — Session Bootstrap

## What this project IS

A **Vibe Code Prompt Studio** — project management + sprint board +
AI prompt library + wiki + activity feed for vibe-coding teams.
Standalone Turborepo with Next.js front-end + Express back-end.

## What this project is NOT

The host it came from. ACCA at `D:\ACCA` is a German accounting SaaS
with journal entries, VAT, SKR03, GoBD compliance, debtors,
kreditors. **None of that exists here.** If the user references
"invoice", "VAT", "Steuerberater", "BWA", etc., they have the wrong
project open.

## First-turn checklist

1. Read `CLAUDE.md` (always in context — re-skim).
2. Read `ACTION_PLAN.md` if user is setting up for first time.
3. Confirm port reality:
   ```bash
   # API
   curl -s http://localhost:4100/health || echo "api not running"
   # Web
   curl -s http://localhost:3100 -I | head -1 || echo "web not running"
   # Tunnel
   node scripts/tunnel-status.js | head -3
   ```
4. If the user is doing day-2 work and any of those return errors, the
   first move is `node scripts/ensure-db-tunnel.js` then `npm run dev`.

## Port assignments (memorize)

| Service | Port | Why |
|---|---|---|
| Web (Next.js) | 3100 | 3000 left free for ACCA |
| API (Express) | 4100 | 4000 left free for ACCA |
| DB tunnel (local → IONOS) | 5545 | 5544 used by ACCA |
| Remote Postgres | 5432 | direct on IONOS VM |

## Where things live

- `apps/web/src/pages/dev-portal/` — 30 page files
- `apps/api/src/routes/dev-portal.ts` — single backend router
- `domains/dev-portal/src/dev-portal-service.ts` — service layer
- `infrastructure/migrations/` — 11 migrations creating 29 dev_* tables
- `scripts/` — IONOS tunnel + future utility scripts
- `deploy/` — systemd + nginx + deploy.sh for production
- `.env` — local secrets (NOT committed)
- `.env.example` — template

## Don't reach across to ACCA

If you find yourself opening files at `D:\ACCA`, stop. Either:
- The user wanted ACCA changes (point them at the right project), OR
- You're looking for an extracted file (it's already in VibeStudio — search the local tree)

## Related skills

- [[vibestudio-architecture]]
- [[vibestudio-auth]]
- [[vibestudio-prompt-builder]]
- [[vibestudio-vibe-coding]]
- [[vibestudio-database]]
- [[vibestudio-ionos-deploy]]
- [[vibestudio-modernisation-roadmap]]
