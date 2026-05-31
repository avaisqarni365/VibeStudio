/**
 * Migration 049: Dev Prompt History
 * Tracks all AI prompts sent by team members with device identification.
 * Tables: dev_prompt_history
 */

exports.up = async function(knex) {
  await knex.schema.createTable('dev_prompt_history', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('author_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.uuid('task_id').references('id').inTable('dev_tasks').onDelete('SET NULL');
    table.uuid('project_id').references('id').inTable('dev_projects').onDelete('CASCADE');
    table.string('template', 50); // new_feature, bug_fix, api_endpoint, page, migration, refactor, i18n, custom
    table.string('title', 500);
    table.text('prompt').notNullable(); // full prompt text
    table.text('response_summary'); // optional — summary of what was done
    table.string('status', 30).defaultTo('sent'); // sent, in_progress, completed, failed
    table.string('model', 100); // claude-opus-4, gpt-4, etc.
    table.integer('prompt_tokens');
    table.integer('response_tokens');
    table.integer('duration_seconds'); // how long the session took
    // Device identification
    table.string('device_name', 100); // "Jawad's Windows", "Build Server"
    table.string('device_type', 30); // desktop, laptop, server, ci
    table.string('os', 50); // Windows 11, macOS 14, Ubuntu 22
    table.string('browser', 100); // user-agent parsed
    table.string('ip_address', 45);
    table.string('hostname', 100);
    // Context
    table.jsonb('labels').defaultTo('[]'); // domain tags
    table.jsonb('metadata').defaultTo('{}'); // extra context: files changed, lines added, etc.
    table.integer('rating'); // 1-5 star rating by author
    table.text('notes'); // author notes on the result
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');

    table.index(['author_id']);
    table.index(['task_id']);
    table.index(['project_id', 'created_at']);
    table.index(['status']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('dev_prompt_history');
};
