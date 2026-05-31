/**
 * Migration 054: Project Members + Project enhancements
 * Explicit team assignment to projects, project health tracking
 */
exports.up = async function(knex) {
  // Project membership — who works on which project
  await knex.schema.createTable('dev_project_members', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('project_id').notNullable().references('id').inTable('dev_projects').onDelete('CASCADE');
    t.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    t.text('role').notNullable().defaultTo('member');  // owner, lead, member, viewer
    t.integer('allocation_percent').defaultTo(100);     // 0-100 how much of their time
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.timestamp('left_at').nullable();
    t.unique(['project_id', 'member_id']);
  });

  // Enhance dev_projects with portfolio fields
  await knex.schema.alterTable('dev_projects', t => {
    t.text('priority').defaultTo('medium');        // critical, high, medium, low
    t.text('category').defaultTo('internal');       // internal, client, research, maintenance
    t.date('start_date').nullable();
    t.date('target_date').nullable();
    t.integer('progress').defaultTo(0);             // 0-100
    t.text('health').defaultTo('on_track');         // on_track, at_risk, behind, blocked
    t.text('repository_url').nullable();
    t.text('tech_stack').nullable();                // comma-separated: React, Node, etc.
    t.text('client_name').nullable();               // for client projects
  });

  await knex.schema.raw('CREATE INDEX idx_proj_members_project ON dev_project_members (project_id)');
  await knex.schema.raw('CREATE INDEX idx_proj_members_member ON dev_project_members (member_id)');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('dev_project_members');
  await knex.schema.alterTable('dev_projects', t => {
    t.dropColumn('priority');
    t.dropColumn('category');
    t.dropColumn('start_date');
    t.dropColumn('target_date');
    t.dropColumn('progress');
    t.dropColumn('health');
    t.dropColumn('repository_url');
    t.dropColumn('tech_stack');
    t.dropColumn('client_name');
  });
};
