# @vibestudio/desktop

The standalone **desktop shell** for VibeStudio — an Electron app that
wraps the VibeStudio web UI in a native window and packages to a Windows
`.exe` (plus macOS `.dmg` / Linux `AppImage`).

This is the **D1** deliverable from the modernisation roadmap
([[vibestudio-modernisation-roadmap]]). It is a working scaffold — see
**Status / next steps** for what is intentionally left for the next pass.

## Why Electron (not Tauri)

VibeStudio is a pure-JS Turborepo (Next.js + Express). Electron wraps the
existing app with zero extra toolchains, and the team's release-agent
profile already assumed an Electron build. Tauri would give a smaller
binary but needs a Rust toolchain and makes wrapping the Next.js server
harder. Electron is the pragmatic first shell; revisiting with Tauri is a
future option.

## How it works

The packaged `.exe` is **self-contained**: it bundles the web app and the
API and spawns them with Electron's own Node on fixed ports, then loads the
local URL.

| Mode | What runs | URL loaded |
|---|---|---|
| `npm run desktop:dev` (dev) | you run `npm run dev` separately | `http://localhost:3100/dev-portal` |
| packaged `.exe` | bundled API (:4100) + Next.js standalone (:3100), spawned by the shell | `http://127.0.0.1:3100/dev-portal` |

Set `VIBESTUDIO_WEB_URL` to skip the bundled servers and point at a remote
instance instead (e.g. `https://vibestudio.codes-ai.uk`).

### Packaging pipeline (`npm run desktop:build`)

1. `scripts/prepare-server.mjs`:
   - `next build` (with `output: 'standalone'`) → copies `.next/standalone` +
     `.next/static` into `resources/web/`.
   - `npm run bundle -w @vibestudio/api` (esbuild → `api.cjs`, inlining the
     `@vibestudio/*` TS packages) → `resources/api/`, then installs the
     externalised runtime deps (`knex`, `pg`) there.
2. `tsc` compiles `electron/` → `dist-electron/`.
3. `electron-builder` packages `dist-electron` (asar) + `resources/{api,web}`
   (extraResources) into the installer.

### First-run configuration (database)

The bundled API still needs a Postgres connection. Auth secrets
(`JWT_SECRET`, `SESSION_SECRET`, …) are generated and persisted automatically
in the app's `userData` dir on first launch. Provide DB credentials by
creating `<userData>/db.env`:

```
DB_HOST=127.0.0.1
DB_PORT=5545
DB_NAME=vibestudio
DB_USER=vibestudio
DB_PASSWORD=...
```

(`userData` is `%APPDATA%/VibeStudio` on Windows.) Without it the app loads but
data calls fail until the DB is reachable. A fully-embedded local DB is a
future item — see **Status**.

Security defaults: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. A minimal `window.vibestudio` API is exposed via the
preload so the web app can detect it's running in the desktop shell.
Off-origin links open in the user's default browser.

## Develop

From the repo root:

```bash
npm install            # first time (installs electron + electron-builder)
npm run dev            # terminal 1 — starts API :4100 + web :3100
npm run desktop:dev    # terminal 2 — compiles + launches the Electron window
```

The window retries the URL for ~60s, so start order is forgiving.

## Build the .exe

```bash
npm run desktop:build      # → apps/desktop/release/ (NSIS installer + portable .exe)
# platform-specific:
npm run dist:win   -w @vibestudio/desktop
npm run dist:mac   -w @vibestudio/desktop
npm run dist:linux -w @vibestudio/desktop
```

Output lands in `apps/desktop/release/`. Drop an `assets/icon.ico` to brand it.

## Layout

```
apps/desktop/
├── electron/
│   ├── main.ts        # main process: window, menu, single-instance, server orchestration
│   ├── servers.ts     # spawns bundled API + web (ELECTRON_RUN_AS_NODE), waits for ports
│   └── preload.ts     # safe window.vibestudio bridge (contextIsolation on)
├── scripts/
│   └── prepare-server.mjs  # builds + assembles resources/{api,web} before packaging
├── electron-builder.yml
├── tsconfig.json      # compiles electron/ → dist-electron/ (CommonJS)
├── assets/            # optional icons / installer assets
├── resources/         # generated server bundles (gitignored)
├── dist-electron/     # compiled output (gitignored)
└── release/           # packaged installers (gitignored)
```

## Status / next steps

- ✅ Native window wrapping the web app; Windows `.exe` packaging wired.
- ✅ Single-instance, external-link handling, secure webPreferences, app menu.
- ✅ **Self-contained packaging** — bundles the Next.js standalone server + the
  esbuild'd API and spawns them locally with Electron's Node. Auth secrets
  auto-generated in `userData`.
- ⏳ **Validate the build** — needs one real `npm install && npm run desktop:build`
  run to confirm the Next monorepo-standalone trace + esbuild externals.
- ⏳ **Embedded database** — the API still needs a reachable Postgres (via
  `userData/db.env`). A bundled/local DB is future work.
- ⏳ **Auto-update** — wire `electron-updater` against a release feed.
- ⏳ **Token storage** — move `dev_portal_token` into the OS keychain. See [[vibestudio-auth]].
- ⏳ **Icon + code signing** — add `assets/icon.*` and signing certs.
