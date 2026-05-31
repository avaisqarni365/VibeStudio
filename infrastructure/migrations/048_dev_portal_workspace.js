/**
 * Migration 048: Dev Portal Workspace — ClickUp-style upgrade
 *
 * Adds: dev_spaces, dev_lists, dev_favorites, dev_docs, dev_channels,
 * dev_channel_members, dev_messages, dev_inbox, dev_bookmarks,
 * dev_task_dependencies, dev_views
 * Alters: dev_tasks (add list_id, space_id, start_date, time_estimate, time_spent, watchers)
 * Alters: dev_projects (add space_id)
 */

exports.up = async function(knex) {
  // ── Spaces (top-level containers) ──
  await knex.schema.createTable('dev_spaces', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('icon', 10).defaultTo('🚀');
    table.string('color', 7).defaultTo('#7c3aed');
    table.text('description');
    table.uuid('owner_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.string('visibility', 20).defaultTo('public');
    table.integer('position').defaultTo(0);
    table.jsonb('settings').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Lists (within spaces, containers for tasks) ──
  await knex.schema.createTable('dev_lists', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('space_id').notNullable().references('id').inTable('dev_spaces').onDelete('CASCADE');
    table.uuid('project_id').references('id').inTable('dev_projects').onDelete('SET NULL');
    table.string('name', 255).notNullable();
    table.string('icon', 10).defaultTo('📋');
    table.string('color', 7);
    table.integer('position').defaultTo(0);
    table.jsonb('status_config').defaultTo('[]');
    table.uuid('default_assignee_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['space_id']);
  });

  // ── Favorites ──
  await knex.schema.createTable('dev_favorites', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    table.string('target_type', 30).notNullable();
    table.uuid('target_id').notNullable();
    table.string('target_name', 255);
    table.integer('position').defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['member_id']);
  });

  // ── Docs ──
  await knex.schema.createTable('dev_docs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('space_id').references('id').inTable('dev_spaces').onDelete('SET NULL');
    table.uuid('parent_id').references('id').inTable('dev_docs').onDelete('SET NULL');
    table.string('title', 255).notNullable();
    table.text('content');
    table.string('icon', 10).defaultTo('📄');
    table.string('cover_image_url', 500);
    table.uuid('created_by').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.uuid('last_edited_by').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.boolean('is_template').defaultTo(false);
    table.boolean('is_pinned').defaultTo(false);
    table.string('visibility', 20).defaultTo('public');
    table.integer('position').defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['space_id']);
  });

  // ── Channels ──
  await knex.schema.createTable('dev_channels', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable();
    table.text('description');
    table.string('type', 20).defaultTo('channel');
    table.string('icon', 10).defaultTo('#');
    table.uuid('created_by').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Channel Members ──
  await knex.schema.createTable('dev_channel_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('channel_id').notNullable().references('id').inTable('dev_channels').onDelete('CASCADE');
    table.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    table.string('role', 20).defaultTo('member');
    table.timestamp('last_read_at');
    table.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['channel_id', 'member_id']);
  });

  // ── Messages ──
  await knex.schema.createTable('dev_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('channel_id').notNullable().references('id').inTable('dev_channels').onDelete('CASCADE');
    table.uuid('author_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    table.text('content').notNullable();
    table.string('type', 20).defaultTo('text');
    table.uuid('reply_to_id').references('id').inTable('dev_messages').onDelete('SET NULL');
    table.jsonb('reactions').defaultTo('{}');
    table.jsonb('attachments').defaultTo('[]');
    table.boolean('is_edited').defaultTo(false);
    table.boolean('is_pinned').defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['channel_id', 'created_at']);
  });

  // ── Inbox (notifications) ──
  await knex.schema.createTable('dev_inbox', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    table.string('type', 30).notNullable();
    table.string('title', 500).notNullable();
    table.text('body');
    table.string('source_type', 30);
    table.uuid('source_id');
    table.uuid('actor_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.boolean('is_read').defaultTo(false);
    table.boolean('is_archived').defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['member_id', 'is_read']);
  });

  // ── Bookmarks ──
  await knex.schema.createTable('dev_bookmarks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    table.uuid('space_id').references('id').inTable('dev_spaces').onDelete('SET NULL');
    table.string('title', 255).notNullable();
    table.string('url', 1000).notNullable();
    table.string('icon', 10).defaultTo('🔗');
    table.integer('position').defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['member_id']);
  });

  // ── Task Dependencies (for Gantt) ──
  await knex.schema.createTable('dev_task_dependencies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable().references('id').inTable('dev_tasks').onDelete('CASCADE');
    table.uuid('depends_on_id').notNullable().references('id').inTable('dev_tasks').onDelete('CASCADE');
    table.string('type', 20).defaultTo('blocks');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['task_id', 'depends_on_id']);
  });

  // ── Saved Views ──
  await knex.schema.createTable('dev_views', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('space_id').references('id').inTable('dev_spaces').onDelete('CASCADE');
    table.uuid('list_id').references('id').inTable('dev_lists').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('type', 20).notNullable();
    table.jsonb('filters').defaultTo('{}');
    table.string('group_by', 50);
    table.jsonb('sort_by').defaultTo('[]');
    table.jsonb('columns').defaultTo('[]');
    table.uuid('created_by').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Alter dev_tasks: add workspace fields ──
  await knex.schema.alterTable('dev_tasks', (table) => {
    table.uuid('list_id').references('id').inTable('dev_lists').onDelete('SET NULL');
    table.uuid('space_id').references('id').inTable('dev_spaces').onDelete('SET NULL');
    table.date('start_date');
    table.integer('time_estimate');
    table.integer('time_spent').defaultTo(0);
    table.jsonb('watchers').defaultTo('[]');
  });

  // ── Alter dev_projects: add space_id ──
  await knex.schema.alterTable('dev_projects', (table) => {
    table.uuid('space_id').references('id').inTable('dev_spaces').onDelete('SET NULL');
  });

  // ── Seed default workspace data ──
  const ceo = await knex('dev_team_members').where({ role: 'ceo' }).first();
  if (!ceo) return;

  // Create default space
  const [space] = await knex('dev_spaces').insert({
    name: 'Team Space',
    icon: '🚀',
    color: '#7c3aed',
    description: 'Main development workspace for the ACCA platform team.',
    owner_id: ceo.id,
    position: 0,
  }).returning('id');
  const spaceId = space.id || space;

  // Link existing project to space
  await knex('dev_projects').where({}).update({ space_id: spaceId });

  // Create default lists
  const listDefs = [
    { name: 'Backlog', icon: '📥', color: '#6b7280', position: 0 },
    { name: 'Sprint Tasks', icon: '🏃', color: '#3b82f6', position: 1 },
    { name: 'Bugs', icon: '🐛', color: '#ef4444', position: 2 },
    { name: 'Infrastructure', icon: '🔧', color: '#f59e0b', position: 3 },
    { name: 'Documentation', icon: '📖', color: '#10b981', position: 4 },
  ];
  const listIds = {};
  for (const def of listDefs) {
    const [list] = await knex('dev_lists').insert({ space_id: spaceId, ...def }).returning('id');
    listIds[def.name] = list.id || list;
  }

  // Assign existing tasks to the Sprint Tasks list
  await knex('dev_tasks').where({}).update({ space_id: spaceId, list_id: listIds['Sprint Tasks'] });

  // Create default channels
  const [welcome] = await knex('dev_channels').insert({
    name: 'Welcome', description: 'Welcome to the ACCA dev team!', type: 'channel', icon: '👋', created_by: ceo.id, is_default: true,
  }).returning('id');
  const [general] = await knex('dev_channels').insert({
    name: 'General', description: 'General discussion for the team.', type: 'channel', icon: '💬', created_by: ceo.id, is_default: true,
  }).returning('id');

  // Add all team members to default channels
  const allMembers = await knex('dev_team_members').select('id');
  for (const member of allMembers) {
    await knex('dev_channel_members').insert([
      { channel_id: welcome.id || welcome, member_id: member.id, role: member.id === ceo.id ? 'admin' : 'member' },
      { channel_id: general.id || general, member_id: member.id, role: member.id === ceo.id ? 'admin' : 'member' },
    ]).onConflict(['channel_id', 'member_id']).ignore();
  }

  // Seed welcome messages
  await knex('dev_messages').insert([
    { channel_id: welcome.id || welcome, author_id: ceo.id, content: 'Welcome to the ACCA Dev Portal! This is our team workspace for managing development. 🎉', type: 'text' },
    { channel_id: general.id || general, author_id: ceo.id, content: 'Use this channel for general development discussions, questions, and updates.', type: 'text' },
  ]);

  // Migrate wiki pages to docs
  const wikiPages = await knex('dev_wiki_pages').select('*');
  for (const page of wikiPages) {
    await knex('dev_docs').insert({
      space_id: spaceId,
      title: page.title,
      content: page.content,
      icon: page.icon || '📄',
      created_by: page.last_edited_by || ceo.id,
      last_edited_by: page.last_edited_by || ceo.id,
      position: page.position || 0,
    });
  }

  // Add some seed tasks across lists
  const project = await knex('dev_projects').where({ key: 'ACCA' }).first();
  const projectId = project?.id;
  const codingAgent = await knex('dev_team_members').where({ agent_type: 'coding' }).first();

  if (projectId) {
    const seedTasks = [
      { title: 'Setup CI/CD pipeline with GitHub Actions', type: 'task', status: 'done', priority: 'high', list_id: listIds['Infrastructure'], story_points: 5 },
      { title: 'Add E2E tests for invoice flow', type: 'task', status: 'todo', priority: 'high', list_id: listIds['Sprint Tasks'], story_points: 8 },
      { title: 'Fix VAT calculation rounding error', type: 'bug', status: 'in_progress', priority: 'critical', list_id: listIds['Bugs'], story_points: 3 },
      { title: 'Write API documentation for payroll endpoints', type: 'task', status: 'backlog', priority: 'medium', list_id: listIds['Documentation'], story_points: 5 },
      { title: 'Implement real-time WebSocket for dev portal', type: 'story', status: 'backlog', priority: 'medium', list_id: listIds['Backlog'], story_points: 13 },
      { title: 'Desktop app: implement offline sync queue', type: 'story', status: 'todo', priority: 'high', list_id: listIds['Sprint Tasks'], story_points: 8, is_ai_generated: true, ai_agent_id: codingAgent?.id },
      { title: 'Add dark mode to main platform', type: 'improvement', status: 'backlog', priority: 'low', list_id: listIds['Backlog'], story_points: 5 },
      { title: 'Security audit: review RLS policies', type: 'task', status: 'todo', priority: 'high', list_id: listIds['Sprint Tasks'], story_points: 5 },
    ];

    const existingCount = await knex('dev_tasks').where({ project_id: projectId }).count('id as cnt').first();
    let seq = parseInt(existingCount?.cnt || '0') + 1;

    for (const t of seedTasks) {
      await knex('dev_tasks').insert({
        project_id: projectId,
        space_id: spaceId,
        list_id: t.list_id,
        task_key: `ACCA-${seq++}`,
        title: t.title,
        type: t.type,
        status: t.status,
        priority: t.priority,
        story_points: t.story_points,
        assignee_id: t.is_ai_generated ? t.ai_agent_id : (Math.random() > 0.5 ? ceo.id : null),
        reporter_id: ceo.id,
        is_ai_generated: t.is_ai_generated || false,
        ai_agent_id: t.ai_agent_id || null,
        labels: JSON.stringify(t.type === 'bug' ? ['bug', 'urgent'] : []),
        start_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + Math.random() * 14 * 86400000).toISOString().split('T')[0],
      });
    }
  }
};

exports.down = async function(knex) {
  // Remove added columns from dev_tasks
  await knex.schema.alterTable('dev_tasks', (table) => {
    table.dropColumn('list_id');
    table.dropColumn('space_id');
    table.dropColumn('start_date');
    table.dropColumn('time_estimate');
    table.dropColumn('time_spent');
    table.dropColumn('watchers');
  });
  await knex.schema.alterTable('dev_projects', (table) => {
    table.dropColumn('space_id');
  });
  await knex.schema.dropTableIfExists('dev_views');
  await knex.schema.dropTableIfExists('dev_task_dependencies');
  await knex.schema.dropTableIfExists('dev_bookmarks');
  await knex.schema.dropTableIfExists('dev_inbox');
  await knex.schema.dropTableIfExists('dev_messages');
  await knex.schema.dropTableIfExists('dev_channel_members');
  await knex.schema.dropTableIfExists('dev_channels');
  await knex.schema.dropTableIfExists('dev_docs');
  await knex.schema.dropTableIfExists('dev_favorites');
  await knex.schema.dropTableIfExists('dev_lists');
  await knex.schema.dropTableIfExists('dev_spaces');
};
