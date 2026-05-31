/**
 * Auto-load .env from the monorepo root so that every entry point
 * (CLI `npm run db:migrate`, the admin /run endpoint, tests) sees the
 * same DB credentials without having to inject env vars in the shell.
 *
 * Lookup order (first hit wins):
 *   1. ../.env               (monorepo root — primary)
 *   2. ./.env                (infrastructure/ — secondary)
 *   3. ../apps/api/.env      (api-specific overrides)
 *
 * Existing process.env values are preserved (never overwritten by a file)
 * so explicit shell exports still take precedence — that lets you do
 * `DB_HOST=other-server npm run db:migrate` without editing a file.
 */
(function loadEnv() {
  try {
    const path = require('path');
    const fs = require('fs');
    let dotenv;
    try { dotenv = require('dotenv'); }
    catch {
      // dotenv not installed at this scope — silently skip. Shell-exported
      // env vars still work; only file-based config is unavailable.
      return;
    }
    const candidates = [
      path.resolve(__dirname, '..', '.env'),
      path.resolve(__dirname, '.env'),
      path.resolve(__dirname, '..', 'apps', 'api', '.env'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p, override: false });
      }
    }
  } catch {
    // Never let env loading break the migration runner.
  }
})();

/**
 * DB_PASSWORD must be set via environment variable in production.
 * Never fall back to a hardcoded credential in production.
 */
function requireDbPassword(env) {
  if (process.env.DB_PASSWORD) return process.env.DB_PASSWORD;
  if (env === 'production') {
    throw new Error('DB_PASSWORD environment variable must be set in production');
  }
  return 'postgres'; // safe dev-only default
}

module.exports = {
  development: {
    client: "postgresql",
    connection: {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "vibestudio",
      user: process.env.DB_USER || "vibestudio",
      password: requireDbPassword('development'),
    },
    pool: { min: 2, max: 10 },
    migrations: { directory: "./migrations", tableName: "knex_migrations" },
    seeds: { directory: "./seeds" }
  },
  test: {
    client: "postgresql",
    connection: {
      host: "localhost",
      port: 5432,
      database: process.env.DB_NAME || "vibestudio_test",
      user: process.env.DB_USER || "vibestudio",
      password: requireDbPassword('test'),
    },
    pool: { min: 2, max: 10 },
    migrations: { directory: "./migrations", tableName: "knex_migrations" }
  },
  production: {
    client: "postgresql",
    connection: {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "vibestudio",
      user: process.env.DB_USER || "vibestudio",
      password: requireDbPassword('production'),
      ssl: process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true }
        : process.env.DB_SSL === "false"
          ? false
          : false, // default off; set DB_SSL=true in production
    },
    pool: { min: 2, max: 20 },
    migrations: { directory: "./migrations", tableName: "knex_migrations" }
  }
};
