# BUGFIX_HISTORY.md — VibeStudio

Bug + fix log (skill ref `04`). Newest first. Fields: date · tool/model ·
problem · root cause · fix (files) · result · regression risk · follow-up.

---

### 2026-06-01 · Multi-project workspaces + CEO super-admin (design "the right way")
- **Tool/model:** Claude Code (Opus 4.8). Local PostgreSQL 17, RLS enabled. Verified via the live API + psql.
- **Problem / need:** the studio's access model was wrong. `listProjects()`/`getPortfolioStats()` returned **every** project to **everyone** (no "projects I belong to"), while FORCE-RLS (079) scoped `dev_tasks`/`dev_sprints`/`dev_wiki_pages` to `dev_project_members` with **no super-admin** — so the CEO opened any non-member workspace to an **empty** board. Desired: regular users see/land on only their linked projects; the `ceo` role sees all projects and can enter any workspace.
- **Design (role-aware RLS bypass, not CEO auto-enrolment):**
  1. **Migration 087** recreates the `member_scope` policies on the 3 project tables as `(current_setting('app.current_dev_member_role',true)='ceo') OR <079 membership expr>` for both USING + WITH CHECK. Per-member tables (prompt history, bookmarks, favorites, code notes, channel members) left strictly per-member.
  2. **Middleware** (`data-isolation.ts`) sets the new GUC `app.current_dev_member_role` from `req.devUser.role` alongside the member id.
  3. **Route guard** `requireProjectMembership(projectId, memberId, res, role)` short-circuits for `ceo`; all ~22 call sites pass `req.devUser.role`.
  4. **Service** `listProjects`/`getPortfolioStats` take `(viewerId, role)` → membership-scoped unless `ceo`; new `resolveActiveProjectId`/`visibleProjectIds`. `GET /active-project` resolves to a visible project (login lands in a real workspace); `PUT /active-project` 403s on an invisible project.
  5. **Frontend** project switcher shows an "All projects · admin" label for `ceo`.
- **Result:** ✅ verified end-to-end with a throwaway `ALPHA` project (member `alex`, excluding CEO + `maria`): CEO `/projects` = {ALPHA, VIBE} and reads ALPHA's task; `maria` `/projects` = {VIBE} only, `PUT /active-project ALPHA` → 403, ALPHA tasks empty. WITH CHECK proven at the SQL layer as the non-superuser `vibestudio` role: ceo-GUC insert into ALPHA **succeeds**, developer-GUC insert **rejected** by RLS. All test data removed; CEO active project reset to VIBE.
- **Regression risk:** medium (touches RLS + ~22 guard call sites). Mitigated: bypass is additive (membership path unchanged), per-member tables untouched, idempotent migration with a clean `down`. **When adding a project-scoped route, pass `req.devUser.role` to `requireProjectMembership`.**
- **Follow-up:** seed a 2nd demo project with limited membership to showcase the model; optional dedicated `admin` role later.

### 2026-06-01 · "Linked to ACCA" — incomplete de-ACCA extraction (branding + admin links + project link)
- **Tool/model:** Claude Code (Opus 4.8). Local PostgreSQL 17. Verified against the running dev stack (web :3100, api :4100) + Electron desktop shell.
- **Problem:** running the desktop app, the user landed on an **invoice / AR-AP / OCR screen** and reported VibeStudio "still linked to ACCA / project management + link-of-projects only shows ACCA". VibeStudio is meant to be a fully independent product with no accounting concepts.
- **Root cause (three couplings, all leftovers from the extraction):**
  1. **Sidebar** (`DevPortalLayout`) had a whole **"Platform Ops ↗"** section linking to ACCA's host admin panel (`/admin/{organizations,email-providers,email-queue,comm-adapters,insights}`); `login.tsx` had a literal **"← Back to ACCA Platform Login"** link (`href=/login`). ACCA runs on `:3000/:4000` on the same machine, so following either link drops you into the real accounting app (the invoice screen the user saw). The VibeStudio page itself was clean (`<title>VibeStudio</title>`, zero invoice markup).
  2. **Project Explorer link** — the seeded VibeStudio project's `settings.linked_paths` pointed at **`D:\ACCA`**, so the explorer/code-viewer browsed ACCA's source. This is the "link of projects" the user meant.
  3. **Branding + runtime paths** — ~10 web pages hardcoded "ACCA" (titles, AI assistant, design system, git-convention examples with `D:/ACCA` + VAT/invoice). `routes/dev-portal.ts` `MEMORY_DIR` read `~/.claude/projects/D--ACCA/memory`; `tunnel-watchdog.js` watched ACCA's `3000/4000`; `mobile-deploy-service.ts` salt/app-name said `acca`.
- **Fix:** (1) Removed the Platform Ops section + the back-to-ACCA link; rebranded sidebar/login/title to VibeStudio; converted every sidebar section into a **collapsible `+`/`−` group** (new `SidebarGroup`). (2) Re-pointed the live DB row's `linked_paths` → `D:\VibeStudio` (jsonb_set). (3) Rebranded all ACCA strings across the web app to zero; `MEMORY_DIR` now derives `<slug>` from `process.cwd()` (`D:\VibeStudio` → `D--VibeStudio`); watchdog watches `3100/4100`; mobile salt/app-name → vibestudio (verified 0 stored creds first).
- **Result:** ✅ web app has **0** ACCA references; all 9 changed pages compile clean; `GET /code-files/projects` resolves only `D:\VibeStudio`; API healthy. ACCA (`D:\ACCA`, `:3000/:4000`) left untouched per V6.
- **Regression risk:** low — branding/UI + one data row. `linked_paths` is user-managed (not seeded), so a reseed won't reintroduce the ACCA link.
- **Follow-up:** docs/skills still mention ACCA as the origin story (intentional/historical); `next.config` `transpilePackages` pkg-name mismatch (pre-existing).

### 2026-06-01 · A7 Cost ROI surfaced empty task/sprint rows — seed never enrolled members
- **Tool/model:** Claude Code (Opus 4.8). Local PostgreSQL 17.
- **Problem:** new `GET /projects/:projectId/cost-roi` returned the correct **untracked** spend but **zero tasks/sprints**, even with task-linked prompts in the DB. (Also: a first cut gated the route on `requireProjectMembership` → `NOT_PROJECT_MEMBER` for the CEO.)
- **Root cause:** `dev_project_members` was **empty** — seed `005` joins members to channels but never to the project. `dev_tasks`/`dev_sprints` enforce **FORCE** member-scope RLS (`dev_tasks_member_scope`) keyed on `dev_project_members`, so the ROI task-join returned 0 rows. `dev_prompt_history` is *not* force-RLS, so the untracked prompt aggregation still worked — which is why only that bucket showed. The earlier "full app launch" only saw tasks because RLS was **disabled** for that test. (Diagnosed by reproducing as the `vibestudio` role with the GUC set: prompt agg = 3 groups, but `dev_tasks` join = 0; `relforcerowsecurity=true` on `dev_tasks`.)
- **Fix:** (1) seed `005_dev_portal_data.js` now enrolls all 12 members into `dev_project_members` for the project (role owner/lead/member, idempotent `onConflict(['project_id','member_id']).ignore()`). (2) dropped the membership gate on `/cost-roi` to match the sibling `/prompt-stats` (project analytics = `devAuth` + DB RLS only). Re-ran `db:seed:local` to backfill memberships.
- **Result:** ✅ under RLS, ROI returns task **VIBE-11** = $0.6088 (opus $0.42875 + sonnet $0.18), 13 pts → **$0.0468/pt**; Sprint 2 rolls it up; untracked haiku $0.02; total $0.6288 — all arithmetic confirmed. Test rows cleaned up.
- **Regression risk:** low — seed change is additive + idempotent; it *unblocks* board/tasks/ROI under RLS (previously broken with RLS on). **Any new project-scoped read needs a `dev_project_members` row.**
- **Follow-up:** seed still appends tasks on re-run (idempotency); ROI monthly rollups.

### 2026-06-01 · Cost Tracker UI + `/me/usage` schema gap
- **Tool/model:** Claude Code (Opus 4.8). Local PostgreSQL 17.
- **Problem:** wiring cache/cost into `usage.tsx`, `/me/usage` 500'd: `column "actor_email" does not exist`.
- **Root cause:** `dev_prompt_history` was missing `provider`/`ai_origin`/`actor_email`/`actor_role` — they came from ACCA migration 130, never extracted (VibeStudio has 047–083). `createPrompt` + `/me/usage` reference them.
- **Fix:** migration `084_dev_prompt_actor_columns.js` adds the 4 columns (+ index on `actor_email`). Dropped the dead `actor_org_id` reference (single-tenant) from the `/me/usage` select + `usage.tsx`. `usage.tsx` now shows Cache read / Cache write / Est. cost (public list prices; cache read ≈0.1× in, write ≈1.25×; local models $0).
- **Result:** `/me/usage` returns OK with `cache_read_tokens`/`cache_write_tokens`; verified against the local DB with RLS enabled (reads return data via `withRlsTransaction`).
- **Note:** the task seed is not idempotent (re-running `db:seed` appends tasks).

### 2026-06-01 · Full app launch test (local Postgres) — 3 fixes
- **Tool/model:** Claude Code (Opus 4.8). Local PostgreSQL 17 on :5432.
- **Setup:** created `vibestudio` role + DB (as `postgres`/`postgres`), `db:migrate` (12) + `db:seed`.
- **Fixes:**
  1. **CRITICAL — missing middleware broke ALL authed requests.** `devAuth` does `require('../middleware/data-isolation')` + `withRlsTransaction(...)`, but `apps/api/src/middleware/data-isolation.ts` was never extracted from ACCA. esbuild left it as a runtime require (warning, not error) → it threw on every authed request → caught → misleading `INVALID_TOKEN` (login worked, but every authed read came back empty). **Fix:** created the middleware using `knexBase` + `dbStore` (AsyncLocalStorage) from `@vibestudio/database` — opens a per-request trx, `SET LOCAL app.current_dev_member_id`, routes queries via ALS, commits on response finish. Rebuilt the API bundle.
  2. **Seed vs RLS (V4).** `db:seed` failed inserting `dev_channel_members` — RLS policy blocked it because the seed doesn't set `app.current_dev_member_id`. **Fix (local):** disabled RLS on `dev_*` for the test DB (mirrors migration 078). Seed is a forward bug to fix (set the GUC, or seed as superuser).
  3. **ACCA default project.** Migration 047 seeds project "ACCA Platform" (key ACCA, accounting desc) — visible in the app. **Fix:** migration `082_rebrand_default_project.js` → "VibeStudio" (key VIBE, ⚡).
- **Doc fix:** RLS GUC is `app.current_dev_member_id` (migrations 070/078/079), NOT `app.current_member_id` as CLAUDE.md V4 / skills stated → corrected.
- **Result:** ✅ stack stable. Login DB-backed (CEO `ceo@codes-ai.uk`), CORS + httpOnly cookie correct, web serves UI (HTTP 200), web→API `/api/v1` proxy works, authed reads return seeded data (12 members, 1 project, 29 tasks), 20/20 health.
- **Follow-up:** rebuild the installer `.exe` to embed the middleware fix (win-unpacked was hot-patched + validated); fix the seed's RLS-context; add a local-DB setup note to ACTION_PLAN.

### 2026-06-01 · First real `npm run desktop:build` — 7 blockers fixed
- **Tool/model:** Claude Code (Opus 4.8). Env: Node v22.16.0, npm 11.6.3, Windows.
- **Context:** first end-to-end build/run of the desktop pipeline (was unrun).
- **Fixes:**
  1. `next.config.js` — `outputFileTracingRoot` is invalid top-level on Next 14.2 → moved under `experimental`.
  2. `team.tsx` — `Object.entries(...).map` value typed `unknown` under `next build` → cast `as [string, any[]][]`.
  3. `packages/database/src/index.ts` — dead `export * from "./posting-accounts"` (ACCA accounting leftover, file never extracted) broke the esbuild API bundle → removed.
  4. `electron-builder.yml` — electron hoisted to workspace root → electron-builder couldn't detect version → pinned `electronVersion: 31.7.7`.
  5. `7zip-bin` + `app-builder-bin` + `app-builder-lib/templates` — initial `npm install` left these electron-builder sub-packages partially populated (missing binaries/templates) → reinstalled each (`npm i <pkg> -w @vibestudio/desktop`).
  6. **winCodeSign** archive contains macOS `.dylib` symlinks Windows can't extract without Developer-Mode/admin → pre-extracted `winCodeSign-2.6.0` into electron-builder's cache excluding `*.dylib` (signing tooling kept). Built with `CSC_IDENTITY_AUTO_DISCOVERY=false` (no signing).
  7. `packages/logging/src/index.ts` — logger `defaultMeta.service` was `"acca"` → `"vibestudio"`.
- **Result:** `release/VibeStudio Setup 0.0.1.exe` (NSIS, 129MB) + `VibeStudio 0.0.1.exe` (portable) + `win-unpacked/`. Bundled `resources/api/api.cjs` + `resources/web/.../server.js` present. The bundled API **boots** and `/health` returns ok.
- **Regression risk:** low — fixes are config/leftover removals. The winCodeSign cache step is host-specific (document for other Windows machines without Dev Mode).
- **Follow-up:** add `assets/icon.ico` (default Electron icon used); validate the *web* standalone server + full app launch against a real DB; consider code signing.

### 2026-05-31 · Web build blocker: missing `@vibestudio/i18n`
- **Tool/model:** Claude Code (Opus 4.8)
- **Problem:** `apps/web/src/lib/i18n.tsx` imported `@vibestudio/i18n`, a package that was never extracted from ACCA → `next build` (and the desktop standalone build) would fail to resolve it.
- **Root cause:** leftover from ACCA's 6-language i18n; the package isn't part of VibeStudio (English-only).
- **Fix:** rewrote `apps/web/src/lib/i18n.tsx` as a self-contained English-only shim keeping every export/signature (`useI18n`, `useLocale`, `useTranslation`, `useLb`, `I18nProvider`, `LANGUAGES`, …).
- **Result:** import removed; 0 diagnostics; build unblocked.
- **Regression risk:** low — call sites unchanged; non-English strings now resolve to English.
- **Follow-up:** reintroduce a real i18n package only if multi-language is wanted.

### 2026-05-31 · `apps/desktop/` would be untracked by git
- **Problem:** root `.gitignore` had a blanket `desktop/` rule (+ no `dist-bundle/`/`dist-electron/`).
- **Root cause:** inherited ignore pattern; matches `apps/desktop/` at any depth.
- **Fix:** removed `desktop/`; added `dist-bundle/`, `dist-electron/`; renamed the desktop buildResources dir `build/`→`assets/` to dodge the global `build/` ignore.
- **Result:** desktop workspace is tracked; build artifacts ignored.
- **Regression risk:** none.

### 2026-05-31 · Ops endpoints queried non-existent ACCA tables
- **Problem:** `GET /ops/db-stats` + `/ops/health` queried `users` / `organizations` → 500 at runtime (VibeStudio has neither).
- **Root cause:** leftover ACCA schema assumptions.
- **Fix:** repointed to `dev_team_members` / `dev_projects` (counts → members/projects); updated `deployments.tsx` consumers.
- **Result:** ops endpoints return VibeStudio data.
- **Regression risk:** low — response keys renamed (`users`→`members`, `organizations`→`projects`); frontend updated in lockstep.

### 2026-05-31 · Project-explorer scanned the wrong pages dir
- **Problem:** `scanProject()` scanned `apps/web-platform/src/pages` (ACCA path) → 0 pages found.
- **Fix:** → `apps/web/src/pages` in `domains/dev-portal/src/dev-portal-service.ts`.
- **Result:** explorer/wiki page counts correct.

### 2026-05-31 · Config defaulted to ACCA's database
- **Problem:** `knexfile.js` / `config` defaulted `DB_NAME=accadb`, user `acca` → a missing env would target ACCA's DB on the shared VM.
- **Fix:** defaults → `vibestudio`/`vibestudio`; ports → 4100/3100; dropped dead German-tax config.
- **Result:** safe standalone defaults.
- **Regression risk:** medium — anyone relying on old defaults must set `DB_*`. Documented in `.env.example`.
