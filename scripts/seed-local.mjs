#!/usr/bin/env node
/**
 * One-command local DB setup for development.
 *
 *   npm run db:seed:local
 *
 * Runs: migrate:latest → disable RLS on dev_* → seed:run → re-enable RLS.
 *
 * Why toggle RLS: the dev_* tables use FORCE ROW LEVEL SECURITY (migration 079),
 * so even the table owner is subject to RLS — and `db:seed` doesn't set
 * `app.current_dev_member_id`, so cross-member inserts (e.g. dev_channel_members)
 * are rejected. We disable RLS only for the seed, then re-enable it; the ENABLE/
 * DISABLE toggle does NOT touch the FORCE bit or drop policies, so the table
 * returns to its prod-like enforced state. At runtime the API sets the GUC via
 * middleware/data-isolation.ts (withRlsTransaction).
 *
 * Connects with the same env/defaults as infrastructure/knexfile.js
 * (DB_HOST/PORT/NAME/USER/PASSWORD; defaults to the local `vibestudio` DB).
 * The app DB user owns the tables, so it can toggle RLS itself — no superuser
 * needed for seeding (role + database creation is a one-time superuser step,
 * see ACTION_PLAN.md).
 */
import knexLib from "knex";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, "..");
const knexfile = require(path.join(repoRoot, "infrastructure", "knexfile.js"));

const cfg = { ...knexfile.development };
const migDir = path.join(repoRoot, "infrastructure", "migrations");
const seedDir = path.join(repoRoot, "infrastructure", "seeds");
const db = knexLib(cfg);

async function toggleRls(enable) {
  const rows = await db("pg_tables")
    .where({ schemaname: "public" })
    .andWhereRaw("tablename LIKE 'dev\\_%'")
    .select("tablename");
  for (const { tablename } of rows) {
    await db.raw(`ALTER TABLE public.?? ${enable ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY`, [tablename]);
  }
  return rows.length;
}

(async () => {
  try {
    console.log("→ migrate:latest");
    const [, applied] = await db.migrate.latest({ directory: migDir });
    console.log(`  ${applied?.length ? applied.length + " migration(s) applied" : "already up to date"}`);

    console.log("→ disabling RLS on dev_* (for seeding)");
    const n = await toggleRls(false);

    console.log("→ seed:run");
    await db.seed.run({ directory: seedDir });

    console.log(`→ re-enabling RLS on ${n} dev_* table(s)`);
    await toggleRls(true);

    console.log("\n✓ Local DB ready.");
    console.log("  Login: ceo@codes-ai.uk / DevPortal@2024  (change on first login)");
  } catch (err) {
    console.error("\n✗ seed-local failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
