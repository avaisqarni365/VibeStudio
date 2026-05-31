/**
 * Migration 079 — Re-enable RLS on dev_portal tables (now actually works).
 *
 * Migration 078 dropped the broken RLS policies on 8 dev_* tables because the
 * dev-portal middleware never set `app.current_dev_member_id` correctly — the
 * helper used `SET LOCAL` under knex autocommit, which doesn't persist past
 * the SET statement itself, so every subsequent insert failed the policy.
 *
 * Now that `apps/api/src/middleware/data-isolation.ts:withRlsTransaction`
 * wraps each authenticated request in an explicit knex transaction, sets
 * `app.current_dev_member_id` via `set_config(..., true)` inside it, and
 * routes all `db(...)` calls through that trx via AsyncLocalStorage, the
 * RLS policy can be reinstated and will be evaluated against the real member
 * id on every dev_* mutation.
 *
 * Policy semantics: a row is visible / writable iff it belongs to a project
 * the current dev member is on, via dev_project_members. Tables that don't
 * carry project_id directly are joined through the obvious owner column.
 */

const POLICIES = [
  // table, project_id-bearing column expression. Use direct project_id where
  // available, otherwise sub-select via the table's natural foreign key.
  {
    table: "dev_tasks",
    expr:
      "project_id IN (SELECT project_id FROM dev_project_members WHERE member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid)",
  },
  {
    table: "dev_sprints",
    expr:
      "project_id IN (SELECT project_id FROM dev_project_members WHERE member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid)",
  },
  {
    table: "dev_wiki_pages",
    expr:
      "project_id IN (SELECT project_id FROM dev_project_members WHERE member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid)",
  },
  // Per-member tables: row.member_id must equal the current dev member.
  {
    table: "dev_bookmarks",
    expr:
      "member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid",
  },
  {
    table: "dev_favorites",
    expr:
      "member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid",
  },
  {
    table: "dev_code_notes",
    expr:
      "member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid",
  },
  {
    table: "dev_prompt_history",
    expr:
      "member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid",
  },
  // Channel members: a member can see their own membership rows.
  {
    table: "dev_channel_members",
    expr:
      "member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid",
  },
];

async function tableExists(knex, name) {
  return knex.schema.hasTable(name);
}

async function columnExists(knex, table, col) {
  return knex.schema.hasColumn(table, col);
}

exports.up = async function (knex) {
  for (const { table, expr } of POLICIES) {
    if (!(await tableExists(knex, table))) continue;

    // Skip a row-scoped expression if the named column isn't on this table.
    // (Defensive: the schema has evolved over many migrations.)
    if (expr.startsWith("project_id") && !(await columnExists(knex, table, "project_id"))) continue;
    if (expr.startsWith("member_id") && !(await columnExists(knex, table, "member_id"))) continue;

    await knex.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);

    const policyName = `${table}_member_scope`;
    // DROP first to keep the migration idempotent.
    await knex.raw(`DROP POLICY IF EXISTS "${policyName}" ON "${table}"`);
    await knex.raw(
      `CREATE POLICY "${policyName}" ON "${table}" AS PERMISSIVE FOR ALL USING (${expr}) WITH CHECK (${expr})`,
    );
  }
};

exports.down = async function (knex) {
  for (const { table } of POLICIES) {
    if (!(await tableExists(knex, table))) continue;
    const policyName = `${table}_member_scope`;
    await knex.raw(`DROP POLICY IF EXISTS "${policyName}" ON "${table}"`);
    await knex.raw(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
  }
};
