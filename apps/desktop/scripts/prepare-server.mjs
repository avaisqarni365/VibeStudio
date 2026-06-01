/**
 * Assemble the self-contained server bundles that ship inside the .exe.
 *
 * Produces:
 *   apps/desktop/resources/web/  — Next.js standalone server (apps/web/server.js + traced node_modules + static)
 *   apps/desktop/resources/api/  — esbuild API bundle (api.cjs) + node_modules for knex/pg
 *
 * electron-builder copies resources/ into the packaged app's resources dir
 * (see electron-builder.yml). The Electron main process spawns both with
 * Electron's bundled Node (ELECTRON_RUN_AS_NODE) — see electron/servers.ts.
 *
 * Run automatically by `npm run desktop:build`; or directly:
 *   node apps/desktop/scripts/prepare-server.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "..");
const repoRoot = join(desktopRoot, "..", "..");
const webRoot = join(repoRoot, "apps", "web");
const apiRoot = join(repoRoot, "apps", "api");
const resources = join(desktopRoot, "resources");

function run(cmd, cwd, extraEnv = {}) {
  console.log(`\n$ ${cmd}\n  (cwd: ${cwd})`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

console.log("→ Cleaning apps/desktop/resources/");
rmSync(resources, { recursive: true, force: true });
mkdirSync(resources, { recursive: true });

// ── 1. Web: build the Next.js standalone server ──────────────────────────
// The client bundle inlines NEXT_PUBLIC_API_URL at build time → point it at
// the bundled API's fixed port.
run("npm run build", webRoot, { NEXT_PUBLIC_API_URL: "http://localhost:4100" });

const standalone = join(webRoot, ".next", "standalone");
if (!existsSync(standalone)) {
  throw new Error(
    "Expected .next/standalone — is `output: 'standalone'` set in apps/web/next.config.js?",
  );
}

const webOut = join(resources, "web");
console.log("→ Assembling web standalone bundle");
cpSync(standalone, webOut, { recursive: true });
// Next standalone does NOT include static assets — copy them in.
cpSync(join(webRoot, ".next", "static"), join(webOut, "apps", "web", ".next", "static"), {
  recursive: true,
});
const pub = join(webRoot, "public");
if (existsSync(pub)) {
  cpSync(pub, join(webOut, "apps", "web", "public"), { recursive: true });
}

// ── 2. API: esbuild bundle + runtime externals (knex, pg) ────────────────
run("npm run bundle", apiRoot);

const apiOut = join(resources, "api");
console.log("→ Assembling API bundle");
cpSync(join(apiRoot, "dist-bundle"), apiOut, { recursive: true });
// Install only the externalised runtime deps next to the bundle.
run("npm install --omit=dev --no-audit --no-fund --no-package-lock", apiOut);

console.log("\n✓ Server bundles ready:");
console.log(`   ${join("resources", "web", "apps", "web", "server.js")}`);
console.log(`   ${join("resources", "api", "api.cjs")}`);
