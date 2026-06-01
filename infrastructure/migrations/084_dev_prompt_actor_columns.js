/**
 * 084_dev_prompt_actor_columns
 *
 * dev_prompt_history was missing the platform-wide usage-attribution columns
 * (`provider`, `ai_origin`, `actor_email`, `actor_role`) — they lived in an ACCA
 * migration (130) that was never extracted, but the code (createPrompt + the
 * /me/usage page) references them. Add them here. Idempotent via hasColumn.
 * (`actor_org_id` is intentionally NOT added — VibeStudio is single-tenant.)
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('dev_prompt_history'))) return;
  const cols = ['provider', 'ai_origin', 'actor_email', 'actor_role'];
  const has = {};
  for (const c of cols) has[c] = await knex.schema.hasColumn('dev_prompt_history', c);
  await knex.schema.alterTable('dev_prompt_history', (t) => {
    if (!has.provider) t.string('provider', 50);
    if (!has.ai_origin) t.string('ai_origin', 50).defaultTo('dev_portal_chat');
    if (!has.actor_email) t.string('actor_email', 255);
    if (!has.actor_role) t.string('actor_role', 50);
  });
  // The /me/usage filter matches author_id OR actor_email — index it.
  if (!has.actor_email) {
    await knex.schema.alterTable('dev_prompt_history', (t) => t.index(['actor_email'], 'idx_dev_prompt_history_actor_email'));
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('dev_prompt_history'))) return;
  try { await knex.schema.alterTable('dev_prompt_history', (t) => t.dropIndex(['actor_email'], 'idx_dev_prompt_history_actor_email')); } catch {}
  for (const c of ['provider', 'ai_origin', 'actor_email', 'actor_role']) {
    if (await knex.schema.hasColumn('dev_prompt_history', c)) {
      await knex.schema.alterTable('dev_prompt_history', (t) => t.dropColumn(c));
    }
  }
};
