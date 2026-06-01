/**
 * Migration 087 — CEO super-admin bypass for project-scoped RLS.
 *
 * Migration 079 put FORCE row-level security on dev_tasks / dev_sprints /
 * dev_wiki_pages, scoping every row to the projects the current dev member
 * belongs to (via dev_project_members). That is correct for regular members,
 * but it left no way for a super-admin to see across projects: the CEO, if not
 * a member of a project, opened that workspace to an EMPTY board.
 *
 * This migration recreates the same `<table>_member_scope` policies with an
 * added bypass: if the request's role GUC `app.current_dev_member_role` is
 * 'ceo', the row is visible/writable regardless of membership. The role GUC is
 * set per-request by withRlsTransaction (apps/api/src/middleware/data-isolation.ts)
 * alongside app.current_dev_member_id.
 *
 * Only the three project-scoped tables change. The per-member tables from 079
 * (dev_bookmarks, dev_favorites, dev_code_notes, dev_prompt_history,
 * dev_channel_members) are deliberately untouched — they stay strictly
 * per-member even for the CEO (your prompt history is yours alone).
 *
 * Idempotent (DROP POLICY IF EXISTS + hasTable/hasColumn guards). down()
 * reverts to the membership-only policy exactly as 079 created it.
 */

// The membership predicate from migration 079 (unchanged).
const MEMBERSHIP_EXPR =
  "project_id IN (SELECT project_id FROM dev_project_members " +
  "WHERE member_id = NULLIF(current_setting('app.current_dev_member_id', true), '')::uuid)";

// CEO bypass clause — reads the per-request role GUC set by withRlsTransaction.
const CEO_BYPASS = "current_setting('app.current_dev_member_role', true) = 'ceo'";

const TABLES = ["dev_tasks", "dev_sprints", "dev_wiki_pages"];

async function setPolicy(knex, table, expr) {
  if (!(await knex.schema.hasTable(table))) return;
  if (!(await knex.schema.hasColumn(table, "project_id"))) return;
  await knex.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  const policyName = `${table}_member_scope`;
  await knex.raw(`DROP POLICY IF EXISTS "${policyName}" ON "${table}"`);
  await knex.raw(
    `CREATE POLICY "${policyName}" ON "${table}" AS PERMISSIVE FOR ALL USING (${expr}) WITH CHECK (${expr})`,
  );
}

exports.up = async function up(knex) {
  // membership OR ceo-role bypass
  const expr = `(${CEO_BYPASS}) OR (${MEMBERSHIP_EXPR})`;
  for (const table of TABLES) await setPolicy(knex, table, expr);
};

exports.down = async function down(knex) {
  // Revert to membership-only (exactly migration 079's policy).
  for (const table of TABLES) await setPolicy(knex, table, MEMBERSHIP_EXPR);
};
