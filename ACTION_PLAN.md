# VibeStudio — Standalone-Ready Action Plan

> Read this in VS Code first. Every step below has either ALREADY BEEN
> EXECUTED by Claude (✅) or is a manual step you need to run (⏳).
> Steps in order. Don't skip.

## State at hand-off

- Code: every dev-portal file copied from ACCA `D:\ACCA\` into `D:\VibeStudio\`
- Renames + wiring: ✅ done by Claude before this hand-off
- Skills: 4 dev-portal skills inside `D:\VibeStudio\.claude\skills\` (project-local)
- Skills, accounting flavour: REMOVED from `C:\Users\jamav\.claude\skills\` so they no longer auto-load in ACCA
- Git: ✅ initialised on 2026-05-31 (commits `57ffd9c` + `0f07ea7`); ⏳ remote not added yet — you'll run `git remote add origin <url>` + `git push -u origin main`
- Postgres: ⏳ database not yet created on IONOS — you'll do that (Step 4)
- `node_modules`: ⏳ not installed — you'll run `npm install` (Step 5)

## The 13 steps

### 1. ✅ Verify the checkout

```bash
cd D:/VibeStudio
ls
# Expect: apps, packages, domains, infrastructure, scripts, docs,
#         .claude, .github, .gitignore, .editorconfig, .prettierrc,
#         .env.example, README.md, MIGRATION_GUIDE.md, ACTION_PLAN.md,
#         CLAUDE.md, package.json, tsconfig.json, turbo.json,
#         next-env.d.ts (will appear after first `next dev` run)

find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l
# Expect: ~110 files (88 code + scaffold)
```

### 2. ✅ Verify package rename worked

```bash
grep -r "@acca/" --include="*.ts" --include="*.tsx" --include="package.json" .
# Expect: 0 matches
```

If any matches: they're inside string literals (templates, docstrings).
Review case-by-case; most can be ignored.

### 3. ⏳ Create the Postgres database on IONOS VM

You already have IONOS VM `212.227.54.250` running Postgres for ACCA
(database `accadb`). VibeStudio uses a **separate database** on the same
instance so the two projects are isolated.

**SSH into the VM and create the DB + role:**

```bash
ssh root@212.227.54.250    # or your VM user
sudo -u postgres psql

CREATE USER vibestudio WITH PASSWORD '__choose_a_strong_password__';
CREATE DATABASE vibestudio OWNER vibestudio;
GRANT ALL PRIVILEGES ON DATABASE vibestudio TO vibestudio;
\q
```

Test the connection from your local machine via the same SSH tunnel
pattern ACCA uses (Step 4 sets up VibeStudio's own tunnel on a
different local port so the two don't clash).

### 4. ⏳ Configure `.env` (single source of truth)

```bash
cd D:/VibeStudio
cp .env.example .env
```

Edit `.env`:

```bash
# Database — IONOS via local SSH tunnel
DB_HOST=127.0.0.1
DB_PORT=5545                          # local tunnel port (ACCA uses 5544)
DB_NAME=vibestudio
DB_USER=vibestudio
DB_PASSWORD=<the password from Step 3>

# Remote target the tunnel forwards to (used by scripts/ensure-db-tunnel.js)
TUNNEL_REMOTE_HOST=212.227.54.250
TUNNEL_REMOTE_PORT=5432
TUNNEL_LOCAL_PORT=5545
TUNNEL_SSH_USER=root                  # or your VM user
TUNNEL_SSH_KEY=C:\Users\jamav\.ssh\id_ed25519   # adjust

# Server
PORT=4100
WEB_PORT=3100
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:4100

# Auth
JWT_SECRET=<run: openssl rand -hex 32>
JWT_REFRESH_SECRET=<run: openssl rand -hex 32>
MOBILE_DEPLOY_KEY=<run: openssl rand -hex 32>

# AI providers — set the keys you actually use
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
MOONSHOT_API_KEY=
GROQ_API_KEY=

# Mobile deploy (Expo / EAS) — optional
EXPO_TOKEN=
```

### 5. ⏳ Install + start the tunnel + verify

```bash
cd D:/VibeStudio
npm install                       # turbo, next, express, knex, pg, …
node scripts/tunnel-status.js     # verify ssh agent + key
node scripts/ensure-db-tunnel.js  # opens tunnel on 127.0.0.1:5545
psql -h 127.0.0.1 -p 5545 -U vibestudio -d vibestudio -c "SELECT 1;"
# Expect: 1
```

### 6. ⏳ Migrate + seed

```bash
npm run db:migrate
# Creates the dev_* tables (migrations 047-084)

npm run db:seed
# Inserts CEO + 5 humans + 6 AI agents — logs default credentials
```

> ⚠️ `db:seed` alone FAILS once RLS is enabled (FORCE RLS on some `dev_*` tables;
> the seed doesn't set `app.current_dev_member_id`). Use the one-command helper
> below for local dev — it toggles RLS around the seed.

#### Local development DB (no IONOS) — one command

1. **One-time (superuser)** — create the role + database on your local Postgres:
   ```bash
   psql -U postgres -c "CREATE ROLE vibestudio LOGIN PASSWORD 'postgres';"
   psql -U postgres -c "CREATE DATABASE vibestudio OWNER vibestudio;"
   ```
2. Point `.env` (or env) at it: `DB_HOST=localhost DB_PORT=5432 DB_NAME=vibestudio DB_USER=vibestudio DB_PASSWORD=postgres`.
3. **Seed in one command:**
   ```bash
   npm run db:seed:local   # migrate → RLS off → seed → RLS on
   ```
   Login: `ceo@codes-ai.uk` / `DevPortal@2024` (change on first login).
   Note: the task seed is not idempotent — re-running appends tasks; drop & recreate the DB for a clean slate.

### 7. ⏳ First boot

```bash
npm run dev
# Boots api on :4100 + web on :3100 via Turbo
# Background — leave running
```

Visit **<http://localhost:3100/dev-portal/login>** and sign in with the
CEO credentials from Step 6.

### 8. ⏳ Smoke-test 6 surfaces

| URL | Should render |
|---|---|
| `/dev-portal/login` | login form |
| `/dev-portal` (after login) | spaces overview |
| `/dev-portal/board` | kanban |
| `/dev-portal/team` | team directory |
| `/dev-portal/prompts` | prompt history |
| `/dev-portal/wiki` | wiki list |

If a page hangs at API call → check `NEXT_PUBLIC_API_URL` matches the
api port.
If a page 404s → check `apps/api/src/index.ts` mounts the dev-portal
router (✅ Claude already did this).

### 9. ✅ Initialize git repo (Claude did this on 2026-05-31)

Two commits on `main` already:
- `57ffd9c` Initial commit — 113 files, 21,755 insertions
- `0f07ea7` docs: clean up CLAUDE.md + README.md references

⏳ Remote still to add (you do this):

```bash
cd D:/VibeStudio
git remote add origin git@github.com:<your_org>/vibestudio.git
git push -u origin main
```

### 10. ⏳ (optional) Deploy to IONOS VM

`deploy/` directory has:
- `deploy/systemd/vibestudio-api.service` — systemd unit for API
- `deploy/systemd/vibestudio-web.service` — systemd unit for Next.js
- `deploy/nginx/vibestudio.conf` — reverse-proxy config
- `deploy/deploy.sh` — script that pulls main, installs, migrates, restarts both services

```bash
# On the IONOS VM
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo cp deploy/nginx/vibestudio.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/vibestudio.conf /etc/nginx/sites-enabled/
sudo systemctl daemon-reload
sudo systemctl enable vibestudio-api vibestudio-web
sudo systemctl start vibestudio-api vibestudio-web
sudo nginx -t && sudo systemctl reload nginx
```

DNS: point `vibestudio.codes-ai.uk` (or your chosen domain) at the
IONOS VM IP. Then `certbot --nginx -d vibestudio.codes-ai.uk` for TLS.

### 11. ⏳ (later) Remove dev portal from ACCA

Now that VibeStudio is running, free ACCA from the dev portal. See
`MIGRATION_GUIDE.md` Phase 6 for the full delete list.

### 12. ⏳ Off you go — modernise

Open `D:\VibeStudio` in a fresh VS Code window. Claude auto-loads:
- `CLAUDE.md` (project-level instructions)
- `.claude/skills/*.md` (8 VibeStudio-native skill files)

Direction (Tier 0 — set 2026-05-31, top priority):
- **Standalone desktop app (.exe)** — `apps/desktop/` (Electron/Tauri)
- **Mobile app** — `apps/mobile/` (Expo/EAS)
- **Deep Claude integration** — default provider, model picker, prompt caching
- **Prompt-engineering & context tooling** — git-backed prompt library + A/B

Supporting modernisation tasks:
- Convert all CJS `require()` to ESM `import`
- Replace bcryptjs with argon2id
- Add Playwright e2e
- Pages Router → App Router (optional; behind the desktop/mobile shells)
- Dark mode by default + design-system rebuild

### 13. ⏳ Maintain the action plan

When you finish a step, change `⏳` → `✅` here and commit the doc.
Doc rots otherwise.

---

## What Claude already did (so you don't need to)

| Already ✅ | What | Where |
|---|---|---|
| 1 | Copied 28 pages + 4 components + 2 hooks + lib | `apps/web/src/**` |
| 2 | Copied 1 backend route (1479 lines) | `apps/api/src/routes/dev-portal.ts` |
| 3 | Copied 5 domain services | `domains/dev-portal/src/` |
| 4 | Copied 11 migrations | `infrastructure/migrations/` |
| 5 | Copied 1 seed | `infrastructure/seeds/005_dev_portal_data.js` |
| 6 | Slim-copied 4 shared packages | `packages/{config,logging,utils,database}/` |
| 7 | Renamed `@acca/*` → `@vibestudio/*` in every TS / TSX / package.json | sweep |
| 8 | Wrote `package.json`, `tsconfig.json`, `turbo.json`, `.gitignore`, `.env.example`, `.editorconfig`, `.prettierrc` | root |
| 9 | Wrote `apps/web/package.json`, `tsconfig.json`, `next.config.js`, `_app.tsx`, `_document.tsx`, `globals.css`, `tailwind.config.js`, `postcss.config.js` | apps/web |
| 10 | Wrote `apps/api/package.json`, `tsconfig.json`, `src/index.ts` with route mount + middleware | apps/api |
| 11 | Copied + adapted IONOS tunnel scripts (port 5545 to avoid clash with ACCA's 5544) | `scripts/tunnel-*.js`, `scripts/ensure-db-tunnel.js` |
| 12 | Wrote `CLAUDE.md` (project-level Claude instructions) | root |
| 13 | Wrote 4 VibeStudio-native skill files | `.claude/skills/vibestudio-*.md` |
| 14 | Replaced the 4 inherited `acca-dev-portal-*` skills with VibeStudio-native ones (`vibestudio-architecture/auth/prompt-builder/vibe-coding`) | skills |
| 15 | Wrote deployment files | `deploy/systemd/*.service`, `deploy/nginx/vibestudio.conf`, `deploy/deploy.sh`, `deploy/env.production.example` |
| 16 | Wrote `.github/workflows/ci.yml` | CI |
| 17 | Wrote `README.md`, `MIGRATION_GUIDE.md`, this `ACTION_PLAN.md` | docs |

## Skills inside `D:\VibeStudio\.claude\skills\` (8 total)

| File | Purpose |
|---|---|
| `vibestudio-session-bootstrap.md` | First thing Claude reads — orients to the project |
| `vibestudio-ionos-deploy.md` | Deployment + tunnel + systemd recipes |
| `vibestudio-database.md` | Schema overview of 29 dev_* tables |
| `vibestudio-modernisation-roadmap.md` | The "what to refactor next" backlog (Tier 0 = desktop/mobile/Claude) |
| `vibestudio-architecture.md` | Pages, router, service layout, ports |
| `vibestudio-auth.md` | dev_portal_token auth + httpOnly cookie + Bearer fallback |
| `vibestudio-prompt-builder.md` | AI Prompt Builder — VibeStudio modules + templates |
| `vibestudio-vibe-coding.md` | The 7-step prompt-to-production flow |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm install` slow | first run downloads turbo + next + 100 deps | be patient; one-time |
| `psql ... role does not exist` | DB user not yet created | re-run Step 3 SQL |
| `psql ... could not connect` | tunnel not running | `node scripts/ensure-db-tunnel.js` |
| 404 on `/api/v1/dev-portal/auth/login` | route not mounted | verify line 30+ of `apps/api/src/index.ts` |
| Login form blank / 500 | DB not migrated | `npm run db:migrate` |
| Login OK but board empty | not seeded | `npm run db:seed` |
| Tailwind classes don't style | tailwind not built | `cd apps/web && npx tailwindcss build` once |
| Page hangs at API call | wrong API URL | edit `NEXT_PUBLIC_API_URL` in `.env`, restart `npm run dev` |
| Migrations crash with "column already exists" | DB has stale rows | drop + recreate the database (Step 3) |

## Hand-off checklist (verify before saying "done")

- [ ] `npm install` succeeded
- [ ] `node scripts/ensure-db-tunnel.js` connects
- [ ] `npm run db:migrate` ran clean
- [ ] `npm run db:seed` ran clean
- [ ] `npm run dev` boots both api + web
- [ ] Login page renders
- [ ] CEO login works
- [ ] At least 3 of 6 smoke-test URLs render
- [ ] `git init` + first commit done
- [ ] `git remote add` + first push done
