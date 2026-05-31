---
name: vibestudio-modernisation-roadmap
description: "The backlog of architectural improvements VibeStudio was extracted to make possible. Use when the user asks 'what should we modernise first?' or when planning a refactor. Items are independent — pick by impact + appetite. Each has acceptance criteria + estimated effort."
---

# VibeStudio — Modernisation Roadmap

VibeStudio was extracted from ACCA on 2026-05-31 specifically to
unlock changes that ACCA's accounting roadmap was blocking. Here's
the backlog, ranked by my estimate of impact × ease.

## Tier 0 — strategic direction (the reason VibeStudio is standalone)

> Set 2026-05-31 by the project owner: **desktop + mobile are the
> priority**, shipping a standalone `.exe`, fully wired to Claude
> subscriptions / AI provider APIs, with everything a developer needs
> for prompt engineering and context tooling. These come BEFORE the
> Tier 1 cleanups when there's a conflict.

### D1. Standalone desktop app (.exe)
- **Why:** the headline deliverable — VibeStudio as an installable desktop tool, not just a browser app.
- **Where:** new `apps/desktop/` shell (Electron or Tauri) wrapping the Next.js web app + a bundled/edge API, or pointing at a local API.
- **Effort:** 1-2 weeks for a first signed build (Win first, then Mac/Linux).
- **Acceptance:** `npm run desktop:build` produces a runnable `.exe`; login + board + AI Prompt Builder work offline-capable against a local/remote API; auto-update channel wired.
- **Open questions:** Electron vs Tauri; bundle the API or call a remote one; how `dev_portal_token` is stored on desktop (OS keychain vs file).

### D2. Mobile app
- **Why:** second priority shell — the EAS/mobile scaffolding (`dev_mobile_*` tables, mobile-deploy-service) already exists.
- **Where:** new `apps/mobile/` (Expo / React Native), reusing the dev-portal API.
- **Effort:** 2-3 weeks for a usable board + prompt library + AI chat.
- **Acceptance:** EAS build installs on iOS/Android; auth + board + prompts + AI chat work; OTA channel wired via `dev_mobile_ota_updates`.

### D3. Deep Claude integration
- **Why:** make Claude the first-class provider — subscription/login + API connectivity, model picker, prompt caching, context tooling.
- **Where:** `domains/dev-portal/src/ai-provider-service.ts`, `apps/web/src/pages/dev-portal/ai.tsx`, `prompts.tsx`.
- **Effort:** 1-2 weeks.
- **Acceptance:** Claude is the default provider; prefer the latest Claude models; per-model A/B (see M7); usage + token/cost tracking in `dev_prompt_history`; prompt-caching where the SDK supports it.

### D4. Prompt-engineering & context tooling
- **Why:** the core product value — help developers craft, version, and reuse high-quality prompts with project context.
- **Where:** the AI Prompt Builder (`tasks/[id].tsx`) + prompt library (`prompts.tsx`); ties into M6 (git-backed prompts) + M7 (A/B testing).
- **Acceptance:** prompts carry structured project/module context; users can fork, diff, score, and share prompts; context is assembled from a live project scan.

## Tier 1 — high impact, low risk

### M1. CJS `require()` → ESM `import` everywhere
- **Why:** Vitest's loader rejects `const { x } = require("@vibestudio/database")` patterns
- **Where:** Search `grep -rE 'const \{.*\} = require\("@vibestudio' apps/ domains/ packages/`
- **Effort:** 2-3 hrs (smaller than ACCA's 347-file beast — VibeStudio is ~30 files)
- **Acceptance:** `npm run test:int` runs without `SyntaxError: Missing initializer in const declaration`

### M2. bcryptjs → argon2id
- **Why:** bcryptjs is the JavaScript port of bcrypt; ~10x slower than `bcrypt` native, ~100x slower than `argon2` native. Argon2id won the password-hashing competition
- **Where:** `apps/api/src/routes/dev-portal.ts` `bcrypt.compare` + `bcrypt.hash` calls, plus the seed
- **Effort:** 1 hr (add argon2 dep + replace 4 call sites + write migration to re-hash on next login)
- **Acceptance:** new passwords use argon2id; old bcrypt hashes verify + upgrade-on-login

### M3. PASETO / JWE instead of JWT
- **Why:** JWT has well-known footguns (`alg=none`, RS256/HS256 confusion). PASETO v4 has none of them
- **Where:** `setDevAuthCookie` / `extractDevToken` in `dev-portal.ts`
- **Effort:** 2 hrs
- **Acceptance:** old JWTs continue to verify for 14 days then expire; new sessions use PASETO

### M4. Add Playwright e2e
- **Why:** Zero e2e tests today — every refactor is brave
- **Where:** new `tests/e2e/` directory
- **Effort:** 1 day (config + 3-4 smoke specs covering login, board, task create, prompt log)
- **Acceptance:** `npm run test:e2e` passes on a fresh `npm run db:reset`

## Tier 2 — higher impact, more risk

### M5. Pages Router → App Router (or Remix / SolidStart)
- **Why:** Pages Router is in maintenance. App Router brings server components, layouts, parallel routes
- **Where:** every `apps/web/src/pages/dev-portal/*` becomes `apps/web/src/app/dev-portal/*/page.tsx`
- **Effort:** 1-2 weeks (30 pages to convert + auth refactor + data-fetching pattern change)
- **Acceptance:** all 30 pages render under App Router; existing data loaders moved to RSC where sensible
- **Alternative:** Remix or SolidStart entirely. Bigger lift but cleaner break from Next quirks

### M6. Real version-controlled prompt library
- **Why:** Today prompts are inlined in `prompts.tsx`. They should be git-tracked Markdown files with versioning, sharing, attribution
- **Where:** new `prompts/` directory; new sync flow into `dev_prompt_history`
- **Effort:** 2-3 days (file format spec + sync job + UI to browse / fork / star)
- **Acceptance:** every prompt template is a `prompts/<slug>.md` with frontmatter (author, model, version, tags); UI lists + lets users fork

### M7. Per-model A/B testing UI
- **Why:** Compare Claude vs GPT-4o vs DeepSeek on the same prompt
- **Where:** `apps/web/src/pages/dev-portal/prompts.tsx` extension
- **Effort:** 3-5 days (run + collect + score + diff UI)
- **Acceptance:** user can submit one prompt to 2-4 models and see side-by-side outputs with token + cost + latency stats

### M8. Dark mode by default + design-system rebuild
- **Why:** Inherited Tailwind warm-palette is OK but dated. Need design tokens, dark mode, accessibility audit
- **Where:** `apps/web/tailwind.config.js`, `apps/web/src/styles/globals.css`, new `packages/ui/` for tokens
- **Effort:** 1 week
- **Acceptance:** `prefers-color-scheme=dark` works on every page; WCAG AA contrast on text + interactive

## Tier 3 — research / exploratory

### M9. RLS as the security boundary (not just defence-in-depth)
- **Why:** Today RLS is enabled but app code still filters by member_id. Move to RLS-as-primary
- **Where:** `dev-portal-service.ts`, every query
- **Effort:** 1-2 weeks (risky — every query needs review)
- **Acceptance:** unscoped queries return zero rows; integration tests verify can-only-see-own-data

### M10. SSE for live activity feed
- **Why:** Today `/dev-portal/activity` polls every 30s. SSE makes it instant
- **Where:** `apps/api/src/routes/dev-portal.ts` activity endpoints
- **Effort:** 3-4 days
- **Acceptance:** active sessions get new activity within 1s of creation

### M11. TSE-style immutable audit log
- **Why:** GoBD-style append-only audit was a strength of ACCA. Re-implement here as the gold standard
- **Where:** new migration creating `dev_audit_log` with hash-chain + signature
- **Effort:** 1 week
- **Acceptance:** any modification to `dev_*` tables logs immutable record; integrity verifiable via hash chain

## Tier 4 — quality of life

### M12. Replace JSON-based labels/components/skills with first-class tables
- Labels are currently arrays in `dev_tasks.labels` — make `dev_labels` table + N-to-N

### M13. Replace `dev_activity_log` (single table for all events) with event-sourced log
- Better querying, replay capability

### M14. Move from `bcrypt` cost 10 to argon2id cost 19+ — see M2

### M15. Drop the mobile-deploy module if not used
- `domains/dev-portal/src/mobile-deploy-service.ts` + migration 053 are ~500 lines you may not need

## Picking order

The **Tier 0** items (D1–D4) are the owner-set direction and lead the
roadmap: standalone desktop `.exe`, mobile app, deep Claude integration,
and prompt-engineering tooling.

Before/alongside the big shell work, do **M1 then M4** — fixing the test
loader and adding e2e gives you a safety net. M2, M3 are quick security
wins. M6 + M7 (git-backed prompt library + per-model A/B) are the
"actual product" work that D3/D4 build on. M5 (App Router) is optional
and can wait behind the desktop/mobile shells.

## Related skills

- [[vibestudio-session-bootstrap]]
- [[vibestudio-ionos-deploy]]
- [[vibestudio-database]]
