/**
 * 082_rebrand_default_project
 *
 * Migration 047 seeded a default project "ACCA Platform" (key ACCA, a German
 * accounting description) — surfaced in the standalone app's project list during
 * the 2026-06-01 launch test. Rebrand it forward to VibeStudio (047 is a shipped
 * migration and stays immutable). Idempotent: only touches the ACCA-keyed row.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('dev_projects'))) return;
  await knex('dev_projects').where({ key: 'ACCA' }).update({
    name: 'VibeStudio',
    key: 'VIBE',
    description: 'Vibe Engineering Studio — standalone Turborepo (web + desktop + mobile) for AI-assisted development.',
    icon: '⚡',
    updated_at: knex.fn.now(),
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('dev_projects'))) return;
  await knex('dev_projects').where({ key: 'VIBE' }).update({
    name: 'ACCA Platform',
    key: 'ACCA',
    description: 'German Cloud Accounting SaaS — Multi-tenant, domain-driven TypeScript monorepo. Web + Desktop + Mobile.',
    icon: '🏦',
    updated_at: knex.fn.now(),
  });
};
