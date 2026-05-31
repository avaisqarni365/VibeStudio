/**
 * Migration 078 — Drop broken RLS on dev_portal tables.
 *
 * Eight dev_* tables had FORCE ROW LEVEL SECURITY with a policy that depended on
 * the Postgres session variable `app.current_dev_member_id`. The middleware
 * helper `setDevRlsContext` in apps/api/src/routes/dev-portal.ts uses
 * `SET LOCAL`, which only persists within an explicit transaction — knex's
 * connection pool runs each statement under autocommit, so the variable is
 * gone before the next query. The helper is also never invoked from devAuth.
 *
 * Net effect: every INSERT/UPDATE on dev_tasks, dev_sprints,
 * dev_channel_members, dev_bookmarks, dev_favorites, dev_code_notes,
 * dev_prompt_history, dev_wiki_pages was failing with
 *   "new row violates row-level security policy"
 *
 * App-layer enforcement (`requireProjectMembership`, `requireChannelMembership`)
 * already gates every mutation, so dropping the unusable RLS layer brings the
 * dev portal to a consistent state matching dev_projects / dev_channels which
 * never had RLS.
 *
 * If RLS is reintroduced later, it must be paired with a per-request explicit
 * transaction that sets `app.current_dev_member_id` via
 * `SELECT set_config('app.current_dev_member_id', ?, true)` before any service
 * code runs — the existing `set_config(..., true)` pattern only works inside
 * `db.transaction(async (trx) => { ... })`.
 */

const TABLES = [
  'dev_tasks',
  'dev_sprints',
  'dev_channel_members',
  'dev_bookmarks',
  'dev_favorites',
  'dev_code_notes',
  'dev_prompt_history',
  'dev_wiki_pages',
];

exports.up = async function (knex) {
  for (const t of TABLES) {
    if (!(await knex.schema.hasTable(t))) continue;

    // Drop every policy attached to this table (idempotent).
    const { rows } = await knex.raw(
      `SELECT polname FROM pg_policy WHERE polrelid = ?::regclass`,
      [t],
    );
    for (const { polname } of rows) {
      await knex.raw(`DROP POLICY IF EXISTS "${polname}" ON "${t}"`);
    }

    await knex.raw(`ALTER TABLE "${t}" NO FORCE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE "${t}" DISABLE ROW LEVEL SECURITY`);
  }
};

exports.down = async function (knex) {
  // No automatic reverse — the prior policy was non-functional. If you need
  // RLS back, write a fresh migration paired with proper request-scoped
  // session variable setup in the API layer.
};
