# VibeStudio — Migration Guide

How to take this staging copy from "files-on-disk" to "running app",
plus how to remove the dev portal from ACCA once you've switched.

## Phase 0 — Verify the copy

```bash
cd D:/VibeStudio

# Confirm file counts
find apps/web/src/pages/dev-portal -type f | wc -l       # 28
find apps/web/src/components -type f | wc -l             # 4 (3 dev + PasswordInput)
find apps/web/src/hooks -type f | wc -l                  # 2
find apps/api/src/routes -type f | wc -l                 # 1 (dev-portal.ts)
find domains/dev-portal -type f | wc -l                  # 6 (5 .ts + package.json)
find infrastructure/migrations -type f | wc -l           # 11 (047-080)
find infrastructure/seeds -type f | wc -l                # 1
find .claude/skills -type f | wc -l                      # 4
```

If any count is off, re-run the copy steps from this session's
conversation log.

## Phase 1 — Rename `@acca/*` → `@vibestudio/*`

Every file uses `@acca/database`, `@acca/config`, `@acca/logging`,
`@acca/utils`. Rename them so they resolve against the local
`packages/*` via the tsconfig path map.

```bash
cd D:/VibeStudio

# TS / TSX sources
grep -rl "@acca/" apps domains packages 2>/dev/null \
  | xargs sed -i 's|@acca/|@vibestudio/|g'

# package.json files — careful, don't blow away meaningful @acca/ literals
grep -l "@acca/" apps/*/package.json domains/*/package.json packages/*/package.json \
  | xargs sed -i 's|"@acca/|"@vibestudio/|g'

# Verify zero remain
grep -r "@acca/" apps domains packages 2>/dev/null
# expected: 0 hits (or only in comments / docstrings — review)
```

The TS path map in `tsconfig.json` is already configured for
`@vibestudio/*`.

## Phase 2 — Install + Postgres

```bash
cd D:/VibeStudio
npm install     # turbo, next, express, knex, pg, …

# Create database (assumes Postgres running on :5432)
createdb -U postgres vibestudio
createuser -U postgres -P vibestudio   # use the password from .env

cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT_SECRET, AI keys
```

## Phase 3 — Migrate + seed

```bash
npm run db:migrate
# Runs migrations 047, 048, 049, 052, 053, 054, 070, 074, 078, 079, 080
# Creates 29 dev_* tables

npm run db:seed
# Inserts CEO + 5 humans + 6 AI agents (per 005_dev_portal_data.js)
# Sample projects, spaces, channels, sprints
```

The seed file logs default credentials at the end. Note them.

## Phase 4 — Boot

```bash
# Uncomment the route mount in apps/api/src/index.ts:
# import devPortalRouter from "./routes/dev-portal";
# app.use("/api/v1/dev-portal", devPortalRouter);

npm run dev:api    # Express on :4100
# in another terminal:
npm run dev:web    # Next.js on :3100

# Visit http://localhost:3100/dev-portal/login
```

## Phase 5 — Smoke-test the surface

| URL | Should render |
|---|---|
| `/dev-portal/login` | login form |
| `/dev-portal` (after login) | spaces overview |
| `/dev-portal/board` | kanban |
| `/dev-portal/team` | team member directory |
| `/dev-portal/prompts` | prompt history |
| `/dev-portal/wiki` | wiki list |

If something 404s: check the route mount in `apps/api/src/index.ts`.
If a page hangs at API call: check `NEXT_PUBLIC_API_URL` in `.env`.

## Phase 6 — Remove from ACCA

Once VibeStudio is running and you've verified the data parity (and
optionally exported the live dev_* tables and re-imported into the
VibeStudio DB), you can delete from ACCA. Run from `D:/ACCA`:

```bash
cd D:/ACCA

# 1. Frontend — pages + dev-portal layout + hooks
git rm -r apps/web-platform/src/pages/dev-portal
git rm    apps/web-platform/src/components/layouts/DevPortalLayout.tsx
git rm -r apps/web-platform/src/components/dev-portal
git rm    apps/web-platform/src/hooks/useDevAuth.ts
git rm    apps/web-platform/src/hooks/useActiveProject.ts

# 2. Backend route
git rm    apps/api/src/routes/dev-portal.ts

# 3. Domain
git rm -r domains/dev-portal

# 4. Migrations — KEEP these. Dropping tables in a migration would
#    break any historical replay. The dev_* tables can stay in ACCA's
#    DB as dormant tables, or you can write a fresh "drop_dev_portal"
#    migration NNN_drop_dev_portal.js for new envs only. Document
#    the decision either way.
#
#    DO NOT delete: 047, 048, 049, 052, 053, 054, 070, 074, 078, 079, 080

# 5. Seed
git rm    infrastructure/seeds/005_dev_portal_data.js
# (or keep + gate by NODE_ENV check)

# 6. Skills (in C:/Users/jamav/.claude/skills/)
# Optional: rename to vibestudio-* now that they describe a different project
mv  C:/Users/jamav/.claude/skills/acca-dev-portal-architecture.md \
    C:/Users/jamav/.claude/skills/vibestudio-architecture.md
# (repeat for the other 3)

# 7. Remove the dev-portal route mount from apps/api/src/index.ts
#    (search for `dev-portal` in that file)

# 8. Commit
git add -A
git commit -m "chore: remove dev portal — extracted to VibeStudio standalone repo"
git push
```

## Phase 7 — Initialize VibeStudio as own git repo

```bash
cd D:/VibeStudio
git init
git add .
git commit -m "Initial commit — extracted from ACCA dev portal at 2026-05-31"
# Create the remote on GitHub / GitLab, then:
git remote add origin git@github.com:<your_org>/vibestudio.git
git push -u origin main
```

## What was deliberately NOT copied

| Item | Why |
|---|---|
| `infrastructure/integrations/elster-*` | ACCA tax filing — irrelevant |
| `packages/database/src/posting-accounts.ts` | ACCA accounting — irrelevant |
| `data/skr-catalogs.js` | German chart of accounts — irrelevant |
| `docs/INVOICE_PROCESS_GUIDE.md` (now a skill) | ACCA accounting — irrelevant |
| Any `domains/{accounting,vat,invoicing,…}` | core ACCA — irrelevant |
| Compiled `*.js` / `*.d.ts` files in `packages/*/src/` | TS sources are authoritative |

## Known gotchas

1. **`require("@acca/...")` inside dev-portal.ts uses CommonJS.** After
   the @acca/ → @vibestudio/ rename it still works (ts-node-dev
   handles CJS), but if you switch to native ESM you'll need
   `import` statements. See ACCA's `docs/TEST_STATUS.md` for the same
   class of issue.

2. **Dev portal auth uses an `httpOnly` cookie named `dev_portal_token`.**
   In production, set `Secure` flag and `SameSite=Lax`. Already
   handled by `setDevAuthCookie()` based on `NODE_ENV`.

3. **AI provider keys.** Without at least one of
   `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` /
   `MOONSHOT_API_KEY`, the AI-prompt features return 503.

4. **Mobile deploy** (`mobile-deploy-service.ts`) needs Expo + EAS
   credentials. If you don't use mobile, disable the `/dev-portal/deployments`
   page in the sidebar.

5. **RLS state.** Migrations 070/078/079 toggled RLS on dev_* tables.
   For a fresh VibeStudio DB, the final state is RLS-enabled per
   migration 079. Set `app.current_org_id` (or rename to a VibeStudio-
   appropriate `app.current_member_id`) per transaction.

## Next steps for modernisation

This is your blank-slate moment. Ideas:

- Replace Next.js Pages Router with App Router (or move to Remix / SolidStart)
- Convert all CJS to ESM
- Add Playwright e2e
- Rebuild the prompt library as a real version-controlled artefact (git-backed)
- Per-model A/B testing UI
- Cross-team prompt sharing with attribution
- First-class spec/scratchpad/PR linking
- Dark mode by default + design-system rebuild
- Replace bcryptjs with argon2id
- Move from JWT to PASETO if you want
- Add SSE/WebSocket for live activity feed
- TSE-compliant audit log (immutable log table)

All these are out-of-scope of THIS migration — you wanted a clean
staging copy first, and this is it.
