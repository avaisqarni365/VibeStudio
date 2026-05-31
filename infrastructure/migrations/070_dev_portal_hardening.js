/**
 * Migration 070 — Dev Portal Hardening
 *
 * 1. Add missing columns to dev_prompt_history:
 *    - is_shared         boolean default false
 *    - expires_at        timestamptz nullable
 *    - is_pii_redacted   boolean default false
 *
 * 2. Add refresh_token_hash column to dev_team_members (JWT refresh mechanism).
 *
 * 3. Enable Row Level Security on dev_* tables that carry project_id or member_id.
 *    Policies use app.current_dev_member_id session variable set by setDevRlsContext middleware.
 */

exports.up = async function (knex) {
  // ── 1. dev_prompt_history extra columns ──────────────────────────────────
  const hasPromptHistory = await knex.schema.hasTable('dev_prompt_history');
  if (hasPromptHistory) {
    const cols = await knex('information_schema.columns')
      .where({ table_name: 'dev_prompt_history', table_schema: 'public' })
      .pluck('column_name');

    if (!cols.includes('is_shared')) {
      await knex.schema.alterTable('dev_prompt_history', t => {
        t.boolean('is_shared').defaultTo(false).notNullable();
      });
    }
    if (!cols.includes('expires_at')) {
      await knex.schema.alterTable('dev_prompt_history', t => {
        t.timestamp('expires_at', { useTz: true }).nullable();
      });
    }
    if (!cols.includes('is_pii_redacted')) {
      await knex.schema.alterTable('dev_prompt_history', t => {
        t.boolean('is_pii_redacted').defaultTo(false).notNullable();
      });
    }
  }

  // ── 2. dev_team_members refresh_token_hash ───────────────────────────────
  const hasTeamMembers = await knex.schema.hasTable('dev_team_members');
  if (hasTeamMembers) {
    const cols = await knex('information_schema.columns')
      .where({ table_name: 'dev_team_members', table_schema: 'public' })
      .pluck('column_name');

    if (!cols.includes('refresh_token_hash')) {
      await knex.schema.alterTable('dev_team_members', t => {
        t.text('refresh_token_hash').nullable();
      });
    }
  }

  // ── 3. RLS on dev_* tables ───────────────────────────────────────────────
  //
  // Tables with project_id → allow access when the member is in dev_project_members.
  // Tables with member_id only → allow access when member_id matches session variable.
  //
  // We do this via raw SQL because Knex has no RLS DSL.

  const projectScopedTables = [
    'dev_tasks',
    'dev_wiki_pages',
    'dev_prompt_history',
    'dev_sprints',
    'dev_activity_logs',
    'dev_code_notes',
  ];

  const memberScopedTables = [
    'dev_channel_members',
    'dev_messages',
    'dev_favorites',
    'dev_bookmarks',
  ];

  for (const tbl of projectScopedTables) {
    const exists = await knex.schema.hasTable(tbl);
    if (!exists) continue;
    const cols = await knex('information_schema.columns')
      .where({ table_name: tbl, table_schema: 'public' })
      .pluck('column_name');
    if (!cols.includes('project_id')) continue;

    await knex.raw(`ALTER TABLE "${tbl}" ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`DROP POLICY IF EXISTS dev_member_project_policy ON "${tbl}"`);
    await knex.raw(`
      CREATE POLICY dev_member_project_policy ON "${tbl}"
      USING (
        project_id IN (
          SELECT project_id FROM dev_project_members
          WHERE member_id = current_setting('app.current_dev_member_id', true)::uuid
        )
      )
    `);
    // Allow bypass for superuser / service roles
    await knex.raw(`ALTER TABLE "${tbl}" FORCE ROW LEVEL SECURITY`);
  }

  for (const tbl of memberScopedTables) {
    const exists = await knex.schema.hasTable(tbl);
    if (!exists) continue;
    const cols = await knex('information_schema.columns')
      .where({ table_name: tbl, table_schema: 'public' })
      .pluck('column_name');
    if (!cols.includes('member_id')) continue;

    await knex.raw(`ALTER TABLE "${tbl}" ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`DROP POLICY IF EXISTS dev_member_self_policy ON "${tbl}"`);
    await knex.raw(`
      CREATE POLICY dev_member_self_policy ON "${tbl}"
      USING (
        member_id = current_setting('app.current_dev_member_id', true)::uuid
      )
    `);
    await knex.raw(`ALTER TABLE "${tbl}" FORCE ROW LEVEL SECURITY`);
  }
};

exports.down = async function (knex) {
  // Disable RLS (reverse of up)
  const allTables = [
    'dev_tasks', 'dev_wiki_pages', 'dev_prompt_history', 'dev_sprints',
    'dev_activity_logs', 'dev_code_notes', 'dev_channel_members', 'dev_messages',
    'dev_favorites', 'dev_bookmarks',
  ];
  for (const tbl of allTables) {
    const exists = await knex.schema.hasTable(tbl);
    if (!exists) continue;
    await knex.raw(`ALTER TABLE "${tbl}" DISABLE ROW LEVEL SECURITY`).catch(() => {});
  }

  // Remove added columns
  const hasPromptHistory = await knex.schema.hasTable('dev_prompt_history');
  if (hasPromptHistory) {
    await knex.schema.alterTable('dev_prompt_history', t => {
      t.dropColumn('is_shared');
      t.dropColumn('expires_at');
      t.dropColumn('is_pii_redacted');
    }).catch(() => {});
  }
  const hasTeamMembers = await knex.schema.hasTable('dev_team_members');
  if (hasTeamMembers) {
    await knex.schema.alterTable('dev_team_members', t => {
      t.dropColumn('refresh_token_hash');
    }).catch(() => {});
  }
};
