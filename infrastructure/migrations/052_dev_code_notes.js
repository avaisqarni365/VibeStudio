/**
 * Migration 052: Dev Portal Code Notes
 * Annotations/notes on project source files for team learning
 */
exports.up = async function(knex) {
  await knex.schema.createTable('dev_code_notes', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    t.uuid('project_id').notNullable().references('id').inTable('dev_projects').onDelete('CASCADE');
    t.text('file_path').notNullable();           // relative path e.g. apps/api/src/routes/auth.ts
    t.integer('line_start').nullable();           // null = file-level note
    t.integer('line_end').nullable();
    t.text('content').notNullable();              // markdown
    t.text('note_type').notNullable().defaultTo('annotation');  // annotation, question, todo, explanation, warning, tip
    t.boolean('is_shared').notNullable().defaultTo(true);       // visible to whole team
    t.jsonb('tags').defaultTo('[]');              // labels
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.raw('CREATE INDEX idx_dev_code_notes_file ON dev_code_notes (file_path)');
  await knex.schema.raw('CREATE INDEX idx_dev_code_notes_member ON dev_code_notes (member_id)');
  await knex.schema.raw('CREATE INDEX idx_dev_code_notes_project ON dev_code_notes (project_id)');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('dev_code_notes');
};
