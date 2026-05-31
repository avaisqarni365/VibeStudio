/**
 * Migration 047: Developer Portal
 *
 * Separate workspace for development team management.
 * Own auth system (dev_team_members), project management (tasks, sprints, kanban),
 * wiki documentation, activity tracking, and AI agent orchestration.
 */

exports.up = async function(knex) {
  // ── Dev Team Members (separate auth from main users) ──
  await knex.schema.createTable('dev_team_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255).notNullable();
    table.string('display_name', 100);
    table.string('avatar_url', 500);
    table.string('role', 50).notNullable().defaultTo('developer');
    // roles: ceo, lead, developer, designer, qa, devops, ai_agent
    table.string('title', 100); // e.g. 'Senior Backend Developer', 'CEO'
    table.string('department', 50); // engineering, design, qa, management
    table.string('status', 20).notNullable().defaultTo('active');
    // status: active, away, offline, deactivated
    table.string('timezone', 50).defaultTo('Europe/Berlin');
    table.string('github_username', 100);
    table.string('slack_id', 100);
    table.text('bio');
    table.jsonb('skills').defaultTo('[]'); // ['TypeScript', 'React', 'PostgreSQL']
    table.jsonb('preferences').defaultTo('{}'); // theme, notifications, etc.
    table.boolean('is_ai_agent').defaultTo(false); // true for AI agent accounts
    table.string('agent_type', 50); // coding, ops, qa, security, analytics, release
    table.timestamp('last_login_at');
    table.timestamp('last_active_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['email']);
    table.index(['role']);
    table.index(['status']);
  });

  // ── Projects ──
  await knex.schema.createTable('dev_projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('key', 10).notNullable().unique(); // e.g. 'ACCA', 'DESK', 'MOB'
    table.text('description');
    table.string('status', 30).notNullable().defaultTo('active');
    // status: active, paused, completed, archived
    table.string('color', 7).defaultTo('#3b82f6'); // hex color
    table.string('icon', 10).defaultTo('📦'); // emoji icon
    table.uuid('lead_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.jsonb('settings').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Sprints ──
  await knex.schema.createTable('dev_sprints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('project_id').notNullable().references('id').inTable('dev_projects').onDelete('CASCADE');
    table.string('name', 255).notNullable(); // e.g. 'Sprint 14 — Cross-Platform'
    table.integer('sprint_number').notNullable();
    table.text('goal');
    table.string('status', 20).notNullable().defaultTo('planning');
    // status: planning, active, review, completed
    table.date('start_date');
    table.date('end_date');
    table.integer('capacity_points').defaultTo(0); // story points capacity
    table.integer('completed_points').defaultTo(0);
    table.jsonb('retrospective').defaultTo('{}'); // { went_well, improve, action_items }
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['project_id', 'status']);
    table.unique(['project_id', 'sprint_number']);
  });

  // ── Tasks ──
  await knex.schema.createTable('dev_tasks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('project_id').notNullable().references('id').inTable('dev_projects').onDelete('CASCADE');
    table.uuid('sprint_id').references('id').inTable('dev_sprints').onDelete('SET NULL');
    table.uuid('parent_id').references('id').inTable('dev_tasks').onDelete('SET NULL'); // subtasks
    table.string('task_key', 20).notNullable(); // e.g. 'ACCA-142'
    table.string('title', 500).notNullable();
    table.text('description'); // markdown
    table.string('type', 30).notNullable().defaultTo('task');
    // type: epic, story, task, bug, improvement, spike, ai_task
    table.string('status', 30).notNullable().defaultTo('backlog');
    // status: backlog, todo, in_progress, in_review, testing, done, cancelled
    table.string('priority', 20).notNullable().defaultTo('medium');
    // priority: critical, high, medium, low
    table.integer('story_points');
    table.uuid('assignee_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.uuid('reporter_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.uuid('reviewer_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.jsonb('labels').defaultTo('[]'); // ['frontend', 'backend', 'database', 'urgent']
    table.string('component', 50); // api, web-platform, desktop, packages, infrastructure
    table.string('git_branch', 255);
    table.string('git_pr_url', 500);
    table.integer('position').defaultTo(0); // for kanban ordering
    table.date('due_date');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.integer('estimated_hours');
    table.integer('actual_hours');
    // AI Agent fields
    table.boolean('is_ai_generated').defaultTo(false);
    table.uuid('ai_agent_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.string('ai_status', 30); // planning, coding, reviewing, completed, failed
    table.jsonb('ai_context').defaultTo('{}'); // files touched, confidence, approach
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['project_id', 'status']);
    table.index(['sprint_id']);
    table.index(['assignee_id']);
    table.index(['type']);
    table.index(['priority']);
    table.unique(['task_key']);
  });

  // ── Task Comments ──
  await knex.schema.createTable('dev_task_comments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable().references('id').inTable('dev_tasks').onDelete('CASCADE');
    table.uuid('author_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    table.text('content').notNullable(); // markdown
    table.string('type', 20).defaultTo('comment');
    // type: comment, status_change, assignment, code_review, ai_report
    table.jsonb('metadata').defaultTo('{}'); // for status changes: { from, to }, for AI: { files, confidence }
    table.jsonb('reactions').defaultTo('{}'); // { '👍': ['user_id'], '🎉': [...] }
    table.timestamp('edited_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['task_id']);
  });

  // ── Activity Log ──
  await knex.schema.createTable('dev_activity_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('actor_id').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.string('action', 50).notNullable();
    // actions: task_created, task_updated, task_moved, sprint_started, sprint_completed,
    // comment_added, pr_opened, pr_merged, deploy_started, deploy_completed,
    // agent_started, agent_completed, agent_failed, wiki_updated, member_joined
    table.string('entity_type', 30).notNullable(); // task, sprint, project, wiki, deploy, agent
    table.uuid('entity_id');
    table.string('entity_name', 255);
    table.jsonb('details').defaultTo('{}'); // { from_status, to_status, old_value, new_value }
    table.uuid('project_id').references('id').inTable('dev_projects').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['project_id', 'created_at']);
    table.index(['actor_id']);
    table.index(['entity_type', 'entity_id']);
  });

  // ── Wiki Pages ──
  await knex.schema.createTable('dev_wiki_pages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('project_id').notNullable().references('id').inTable('dev_projects').onDelete('CASCADE');
    table.uuid('parent_id').references('id').inTable('dev_wiki_pages').onDelete('SET NULL');
    table.string('title', 255).notNullable();
    table.string('slug', 255).notNullable();
    table.text('content'); // markdown
    table.string('icon', 10).defaultTo('📄');
    table.integer('position').defaultTo(0);
    table.uuid('last_edited_by').references('id').inTable('dev_team_members').onDelete('SET NULL');
    table.boolean('is_pinned').defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['project_id']);
    table.unique(['project_id', 'slug']);
  });

  // ── Seed CEO + AI Agents + ACCA Project ──
  const bcrypt = require('bcryptjs');
  const ceoHash = await bcrypt.hash('DevPortal@2024', 10);
  const agentHash = await bcrypt.hash('Agent@Internal', 10);

  // Insert CEO
  const [ceo] = await knex('dev_team_members').insert({
    email: 'ceo@enviree.de',
    password_hash: ceoHash,
    name: 'Jawad (CEO)',
    display_name: 'Jawad',
    role: 'ceo',
    title: 'CEO & Founder',
    department: 'management',
    status: 'active',
    skills: JSON.stringify(['Product Strategy', 'Architecture', 'Full Stack', 'AI/ML']),
  }).returning('id');

  // Insert AI Agents
  const agentDefs = [
    { email: 'coding-agent@acca.internal', name: 'Coding Agent', display_name: 'Claude Coder', role: 'ai_agent', title: 'AI Coding Agent', department: 'engineering', is_ai_agent: true, agent_type: 'coding', skills: JSON.stringify(['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Express']) },
    { email: 'ops-agent@acca.internal', name: 'Ops Agent', display_name: 'DevOps Bot', role: 'ai_agent', title: 'AI Operations Agent', department: 'engineering', is_ai_agent: true, agent_type: 'ops', skills: JSON.stringify(['Docker', 'Kubernetes', 'CI/CD', 'Monitoring', 'Nginx']) },
    { email: 'qa-agent@acca.internal', name: 'QA Agent', display_name: 'Test Bot', role: 'ai_agent', title: 'AI QA Agent', department: 'qa', is_ai_agent: true, agent_type: 'qa', skills: JSON.stringify(['Testing', 'Playwright', 'Vitest', 'API Testing', 'Accessibility']) },
    { email: 'security-agent@acca.internal', name: 'Security Agent', display_name: 'SecBot', role: 'ai_agent', title: 'AI Security Agent', department: 'engineering', is_ai_agent: true, agent_type: 'security', skills: JSON.stringify(['RLS', 'JWT', 'OWASP', 'Audit', 'Data Isolation']) },
    { email: 'analytics-agent@acca.internal', name: 'Analytics Agent', display_name: 'DataBot', role: 'ai_agent', title: 'AI Analytics Agent', department: 'engineering', is_ai_agent: true, agent_type: 'analytics', skills: JSON.stringify(['Reporting', 'Forecasting', 'SQL', 'Data Analysis']) },
    { email: 'release-agent@acca.internal', name: 'Release Agent', display_name: 'ReleaseBot', role: 'ai_agent', title: 'AI Release Agent', department: 'engineering', is_ai_agent: true, agent_type: 'release', skills: JSON.stringify(['Electron Builder', 'Docker', 'GitHub Actions', 'Code Signing']) },
  ];

  for (const agent of agentDefs) {
    await knex('dev_team_members').insert({ ...agent, password_hash: agentHash, status: 'active' });
  }

  // Insert ACCA Project
  const [project] = await knex('dev_projects').insert({
    name: 'ACCA Platform',
    key: 'ACCA',
    description: 'German Cloud Accounting SaaS — Multi-tenant, domain-driven TypeScript monorepo. Web + Desktop + Mobile.',
    status: 'active',
    color: '#3b82f6',
    icon: '🏦',
    lead_id: ceo.id || ceo,
  }).returning('id');

  const projectId = project.id || project;

  // Insert Sprint 1
  await knex('dev_sprints').insert({
    project_id: projectId,
    name: 'Sprint 1 — Cross-Platform Foundation',
    sprint_number: 1,
    goal: 'Extract shared packages (api-client, i18n, ui-shared, domain-logic), create Electron desktop shell, setup deployment infrastructure.',
    status: 'completed',
    start_date: '2026-03-21',
    end_date: '2026-04-04',
    capacity_points: 40,
    completed_points: 40,
  });

  // Insert initial wiki pages
  const wikiPages = [
    { title: 'Getting Started', slug: 'getting-started', content: '# Getting Started\n\nWelcome to the ACCA development team!\n\n## Setup\n1. Clone the repo\n2. `npm install`\n3. `npm run db:setup && npm run db:migrate && npm run db:seed`\n4. `npm run dev`\n\n## Key URLs\n- Frontend: http://localhost:3000\n- API: http://localhost:4000\n- Dev Portal: http://localhost:3000/dev-portal', icon: '🚀', position: 1 },
    { title: 'Architecture', slug: 'architecture', content: '# Architecture\n\n## 5-Layer Cross-Platform\n- Layer 5: Platform Shells (web, desktop, mobile)\n- Layer 4: UI Libraries (ui, ui-shared)\n- Layer 3: API Client SDK (api-client)\n- Layer 2: Business Logic (domains, domain-logic)\n- Layer 1: Core (types, auth, database, config, logging, i18n)', icon: '🏗', position: 2 },
    { title: 'Coding Conventions', slug: 'conventions', content: '# Coding Conventions\n\n- DB columns: snake_case\n- TypeScript: camelCase\n- API responses: `{ success, data, error }`\n- Data isolation: resolveOrgId() on ALL routes\n- Audit: automatic via auditLoggerMiddleware\n- i18n: L(T.key) for shared, L({ en, de }) for inline', icon: '📏', position: 3 },
    { title: 'Data Isolation', slug: 'data-isolation', content: '# Data Isolation — 4 Layers\n\n## Layer 1: Application — resolveOrgId()\n## Layer 2: Staff Scoping — staff_client_assignments\n## Layer 3: Database — PostgreSQL RLS (9 tables)\n## Layer 4: Frontend — getEffectiveOrgId()', icon: '🔒', position: 4 },
  ];

  for (const page of wikiPages) {
    await knex('dev_wiki_pages').insert({ ...page, project_id: projectId });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('dev_wiki_pages');
  await knex.schema.dropTableIfExists('dev_activity_log');
  await knex.schema.dropTableIfExists('dev_task_comments');
  await knex.schema.dropTableIfExists('dev_tasks');
  await knex.schema.dropTableIfExists('dev_sprints');
  await knex.schema.dropTableIfExists('dev_projects');
  await knex.schema.dropTableIfExists('dev_team_members');
};
