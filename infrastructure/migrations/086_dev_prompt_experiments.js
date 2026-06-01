/**
 * 086_dev_prompt_experiments
 *
 * A3 — prompt A/B testing. An experiment holds 2+ prompt variants; each variant
 * accumulates run stats (tokens, cost, latency, ratings) so you can compare and
 * pick a winner. Runs go through the AI provider (or are recorded manually when
 * pasting results from elsewhere) and are also logged to dev_prompt_history.
 *
 * RLS: route-gated via the experiment's project (same precedent as
 * dev_task_links / dev_prompt_history — not force-scoped here). Idempotent.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('dev_prompt_experiments'))) {
    await knex.schema.createTable('dev_prompt_experiments', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('project_id').references('id').inTable('dev_projects').onDelete('CASCADE');
      t.uuid('task_id').references('id').inTable('dev_tasks').onDelete('SET NULL');
      t.text('name').notNullable();
      t.text('hypothesis');
      t.string('status', 16).notNullable().defaultTo('open'); // open | decided
      t.uuid('winner_variant_id');
      t.uuid('created_by').references('id').inTable('dev_team_members').onDelete('SET NULL');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      t.index(['project_id'], 'idx_dev_prompt_experiments_project');
    });
  }
  if (!(await knex.schema.hasTable('dev_prompt_variants'))) {
    await knex.schema.createTable('dev_prompt_variants', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('experiment_id').notNullable().references('id').inTable('dev_prompt_experiments').onDelete('CASCADE');
      t.string('label', 24).notNullable(); // A, B, C...
      t.text('prompt').notNullable();
      t.string('provider', 50);
      t.string('model', 120);
      t.integer('runs').notNullable().defaultTo(0);
      t.bigInteger('total_prompt_tokens').notNullable().defaultTo(0);
      t.bigInteger('total_response_tokens').notNullable().defaultTo(0);
      t.bigInteger('total_cache_read').notNullable().defaultTo(0);
      t.bigInteger('total_cache_write').notNullable().defaultTo(0);
      t.decimal('total_cost', 12, 6).notNullable().defaultTo(0);
      t.bigInteger('total_duration_ms').notNullable().defaultTo(0);
      t.integer('rating_sum').notNullable().defaultTo(0);
      t.integer('rating_count').notNullable().defaultTo(0);
      t.text('last_response');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
      t.index(['experiment_id'], 'idx_dev_prompt_variants_experiment');
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('dev_prompt_variants')) await knex.schema.dropTable('dev_prompt_variants');
  if (await knex.schema.hasTable('dev_prompt_experiments')) await knex.schema.dropTable('dev_prompt_experiments');
};
