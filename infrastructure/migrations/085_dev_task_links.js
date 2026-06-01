/**
 * 085_dev_task_links
 *
 * A4 — commit / PR / CI bridge. Links a task to external VCS/CI refs so the
 * board can show "what code & pipelines touched this task". One flexible table
 * covers all three via `link_type`:
 *   - 'commit' : ref = full SHA,        status = null
 *   - 'pr'     : ref = PR number/URL,   status = open|merged|closed
 *   - 'ci'     : ref = run id/URL,      status = success|failed|pending|running
 *
 * RLS: intentionally NOT force-scoped here (same precedent as dev_prompt_history,
 * which is not directly project-scoped). The app role owns the table and the
 * routes gate every read/write with requireProjectMembership via the task's
 * project. Idempotent via hasTable.
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable('dev_task_links')) return;
  await knex.schema.createTable('dev_task_links', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('dev_tasks').onDelete('CASCADE');
    t.string('link_type', 16).notNullable(); // commit | pr | ci
    t.text('ref').notNullable();             // sha / pr number / run id
    t.text('title');                         // commit subject / PR title / workflow name
    t.text('url');                           // optional external link
    t.string('status', 32);                  // pr/ci state; null for commits
    t.string('branch', 255);
    t.string('repo', 255);
    t.string('author', 255);                 // commit author / PR author / CI actor
    t.timestamp('external_at', { useTz: true }); // commit/PR/CI timestamp
    t.uuid('created_by').references('id').inTable('dev_team_members').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['task_id', 'link_type', 'ref'], 'uq_dev_task_links_task_type_ref');
    t.index(['task_id'], 'idx_dev_task_links_task');
    t.index(['link_type'], 'idx_dev_task_links_type');
  });
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('dev_task_links')) {
    await knex.schema.dropTable('dev_task_links');
  }
};
