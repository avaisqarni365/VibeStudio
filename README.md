# VibeStudio

**Vibe Code Prompt Studio** — a standalone project-management +
sprint-board + AI prompt library + wiki + activity feed for
vibe-coding teams. Extracted from the ACCA monorepo's `/dev-portal/`
on **2026-05-31** so it can be modernised independently of the
German-accounting host.

## Status

🟡 **Staging copy.** Every dev-portal file from ACCA has been verbatim-
copied here. Nothing has been renamed, no imports rewired, no DB
created. See `MIGRATION_GUIDE.md` for the boot sequence.

## What's inside

```
D:\VibeStudio\
├── apps/
│   ├── web/                     Next.js front-end (28 pages)
│   │   ├── src/pages/dev-portal/   the 28 page files
│   │   ├── src/components/         3 dev-portal components + PasswordInput
│   │   ├── src/hooks/              useDevAuth, useActiveProject
│   │   ├── src/lib/                i18n
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── next.config.js
│   └── api/                     Express back-end
│       ├── src/routes/dev-portal.ts   1479 lines, 70+ endpoints
│       ├── src/index.ts               boots Express; uncomment route after rename
│       ├── package.json
│       └── tsconfig.json
├── domains/
│   └── dev-portal/              ai-provider-service, ai-call-logger,
│                                mobile-deploy-service, dev-portal-service (2008 lines)
├── packages/
│   ├── database/                shared Knex db handle
│   ├── config/                  env loader
│   ├── logging/                 pino-style logger
│   └── utils/                   generateId, etc.
├── infrastructure/
│   ├── knexfile.js              points at .env DB config
│   ├── migrations/              10 dev-portal migrations (047-080)
│   └── seeds/                   005_dev_portal_data.js (CEO + AI agents)
├── .claude/skills/              4 dev-portal skill files
├── docs/                        (your modernisation notes go here)
├── scripts/                     (your scripts go here)
├── package.json                 Turborepo root
├── turbo.json
├── tsconfig.json                root TS config + @vibestudio/* path map
├── .gitignore
└── .env.example                 env template — DB, JWT, AI keys
```

## Quick-start (after migration)

```bash
cp .env.example .env
# fill in DB + JWT + AI keys

npm install
createdb vibestudio
npm run db:migrate
npm run db:seed                  # seeds CEO + 6 AI agent users
npm run dev                      # boots api on :4100 + web on :3100
```

Visit **http://localhost:3100/dev-portal/login** — default credentials
are seeded in `005_dev_portal_data.js`.

## Why was this extracted?

The dev portal was structurally orthogonal to ACCA's accounting core
— no shared business logic, separate auth, separate tables — but it
was held back by:

- ACCA's accounting-domain conventions (SKR03, GoBD, journal_entries)
- The 347-file CJS `require("@acca/database")` pattern that blocks
  Vitest's ESM loader (see ACCA's `docs/TEST_STATUS.md`)
- The accounting roadmap dominating the merge queue

Extracting unlocks independent modernisation:
- Switch to ESM imports throughout
- Rebuild as a real Vibe-Code Prompt Studio with first-class AI prompt
  library, version-controlled prompt templates, cross-team prompt sharing,
  per-model A/B testing
- Add Playwright e2e (no blocker here)
- Consider Remix or SolidStart vs Next.js
- Native dark mode + design system rebuild

## Skills (auto-loaded by Claude Code)

`.claude/skills/` contains 4 inherited skills from ACCA — your starting
point for understanding the existing architecture before modernising.

You'll want to write VibeStudio-native replacements as you change
architecture; the inherited ones describe how the dev portal worked
INSIDE ACCA, not how it works in VibeStudio.

## License

(your choice — was AGPL-3.0 inside ACCA)

## See also

- **MIGRATION_GUIDE.md** — how to make this boot, in 6 steps
- **ARCHITECTURE.md** — what each module does (to-write — start with
  `.claude/skills/acca-dev-portal-architecture.md`)
