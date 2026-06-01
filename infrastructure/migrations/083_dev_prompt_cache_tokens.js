/**
 * 083_dev_prompt_cache_tokens
 *
 * Adds prompt-cache token accounting to dev_prompt_history so the Cost Tracker
 * can attribute cache savings. `callAnthropic` returns cacheReadTokens /
 * cacheWriteTokens (prompt caching, GA); persist them alongside prompt/response
 * tokens. Idempotent via hasColumn guards.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('dev_prompt_history'))) return;
  const hasRead = await knex.schema.hasColumn('dev_prompt_history', 'cache_read_tokens');
  const hasWrite = await knex.schema.hasColumn('dev_prompt_history', 'cache_write_tokens');
  if (hasRead && hasWrite) return;
  await knex.schema.alterTable('dev_prompt_history', (t) => {
    if (!hasRead) t.integer('cache_read_tokens').notNullable().defaultTo(0);
    if (!hasWrite) t.integer('cache_write_tokens').notNullable().defaultTo(0);
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('dev_prompt_history'))) return;
  const hasRead = await knex.schema.hasColumn('dev_prompt_history', 'cache_read_tokens');
  const hasWrite = await knex.schema.hasColumn('dev_prompt_history', 'cache_write_tokens');
  await knex.schema.alterTable('dev_prompt_history', (t) => {
    if (hasRead) t.dropColumn('cache_read_tokens');
    if (hasWrite) t.dropColumn('cache_write_tokens');
  });
};
