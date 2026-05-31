/**
 * Seed: Dev Portal comprehensive data
 * Populates all dev portal tables with realistic project management data.
 */

exports.seed = async function(knex) {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('DevPortal@2024', 10);

  const ceo = await knex('dev_team_members').where({ role: 'ceo' }).first();
  if (!ceo) { console.log('No CEO found — skip dev portal seed'); return; }
  const codingAgent = await knex('dev_team_members').where({ agent_type: 'coding' }).first();
  const qaAgent = await knex('dev_team_members').where({ agent_type: 'qa' }).first();
  const secAgent = await knex('dev_team_members').where({ agent_type: 'security' }).first();
  const opsAgent = await knex('dev_team_members').where({ agent_type: 'ops' }).first();
  const allAgents = await knex('dev_team_members').where({ is_ai_agent: true });
  const space = await knex('dev_spaces').first();
  const project = await knex('dev_projects').first();
  if (!space || !project) { console.log('No space/project — skip'); return; }
  const lists = await knex('dev_lists').where('space_id', space.id).orderBy('position');
  const backlog = lists.find(l => l.name === 'Backlog');
  const sprintList = lists.find(l => l.name === 'Sprint Tasks');
  const bugsList = lists.find(l => l.name === 'Bugs');
  const infraList = lists.find(l => l.name === 'Infrastructure');
  const docsList = lists.find(l => l.name === 'Documentation');
  const welcomeCh = await knex('dev_channels').where({ name: 'Welcome' }).first();
  const generalCh = await knex('dev_channels').where({ name: 'General' }).first();

  // ── Team Members ──
  const memberDefs = [
    { email: 'sarah@codes-ai.uk', name: 'Sarah Mueller', display_name: 'Sarah', role: 'lead', title: 'Tech Lead', department: 'engineering', skills: ['TypeScript','React','Node.js','PostgreSQL','Architecture'] },
    { email: 'alex@codes-ai.uk', name: 'Alex Weber', display_name: 'Alex', role: 'developer', title: 'Senior Frontend Dev', department: 'engineering', skills: ['React','Next.js','Tailwind','TypeScript','Electron'] },
    { email: 'maria@codes-ai.uk', name: 'Maria Schmidt', display_name: 'Maria', role: 'developer', title: 'Backend Developer', department: 'engineering', skills: ['Node.js','Express','Knex','PostgreSQL','Docker'] },
    { email: 'tom@codes-ai.uk', name: 'Tom Fischer', display_name: 'Tom', role: 'qa', title: 'QA Engineer', department: 'qa', skills: ['Playwright','Testing','API Testing','Accessibility'] },
    { email: 'lisa@codes-ai.uk', name: 'Lisa Braun', display_name: 'Lisa', role: 'designer', title: 'UI/UX Designer', department: 'design', skills: ['Figma','Tailwind','Design Systems','User Research'] },
  ];
  const members = {};
  for (const def of memberDefs) {
    let m = await knex('dev_team_members').where({ email: def.email }).first();
    if (!m) {
      [m] = await knex('dev_team_members').insert({ ...def, password_hash: hash, skills: JSON.stringify(def.skills), status: 'active' }).returning('*');
      if (welcomeCh) await knex('dev_channel_members').insert({ channel_id: welcomeCh.id, member_id: m.id }).onConflict(['channel_id','member_id']).ignore();
      if (generalCh) await knex('dev_channel_members').insert({ channel_id: generalCh.id, member_id: m.id }).onConflict(['channel_id','member_id']).ignore();
    }
    members[def.display_name.toLowerCase()] = m;
  }
  const sarah = members.sarah, alex = members.alex, maria = members.maria, tom = members.tom, lisa = members.lisa;
  const everyone = [ceo, sarah, alex, maria, tom, lisa, ...allAgents];
  console.log('Team members ready:', everyone.length);

  // ── Sprints ──
  let sprint2 = await knex('dev_sprints').where({ project_id: project.id, sprint_number: 2 }).first();
  if (!sprint2) {
    [sprint2] = await knex('dev_sprints').insert({
      project_id: project.id, name: 'Sprint 2 — Dev Portal & Polish', sprint_number: 2,
      goal: 'Build ClickUp-style workspace, polish UI, fix critical bugs, add E2E tests.',
      status: 'active', start_date: '2026-03-21', end_date: '2026-04-04',
      capacity_points: 55, completed_points: 0,
    }).returning('*');
  }
  let sprint3 = await knex('dev_sprints').where({ project_id: project.id, sprint_number: 3 }).first();
  if (!sprint3) {
    [sprint3] = await knex('dev_sprints').insert({
      project_id: project.id, name: 'Sprint 3 — Mobile & Performance', sprint_number: 3,
      goal: 'React Native foundation, API performance optimization, caching layer.',
      status: 'planning', start_date: '2026-04-05', end_date: '2026-04-18',
      capacity_points: 50, completed_points: 0,
    }).returning('*');
  }
  console.log('Sprints ready');

  // ── Tasks ──
  const existingCount = parseInt((await knex('dev_tasks').where({ project_id: project.id }).count('id as cnt').first()).cnt);
  let seq = existingCount + 1;
  const taskDefs = [
    { title: 'Implement real-time WebSocket for channel messages', type: 'story', status: 'in_progress', priority: 'high', list: sprintList, sp: 8, assignee: maria, sprint: sprint2, labels: ['backend','websocket'] },
    { title: 'Add drag-and-drop to Kanban board', type: 'improvement', status: 'in_progress', priority: 'medium', list: sprintList, sp: 5, assignee: alex, sprint: sprint2, labels: ['frontend','ux'] },
    { title: 'Create Gantt chart view component', type: 'story', status: 'todo', priority: 'medium', list: sprintList, sp: 13, assignee: alex, sprint: sprint2, labels: ['frontend','chart'] },
    { title: 'Add Calendar view for task due dates', type: 'story', status: 'todo', priority: 'medium', list: sprintList, sp: 8, assignee: alex, sprint: sprint2, labels: ['frontend'] },
    { title: 'Fix board card reorder losing position', type: 'bug', status: 'in_review', priority: 'critical', list: bugsList, sp: 3, assignee: maria, sprint: sprint2, labels: ['backend','board','urgent'] },
    { title: 'Resolve RLS bypass on /dev-portal/activity', type: 'bug', status: 'done', priority: 'critical', list: bugsList, sp: 5, assignee: maria, sprint: sprint2, labels: ['security','rls'] },
    { title: 'E2E tests: login → board → task create flow', type: 'task', status: 'in_progress', priority: 'high', list: sprintList, sp: 8, assignee: tom, sprint: sprint2, labels: ['testing','e2e'] },
    { title: 'Design mobile app wireframes', type: 'task', status: 'done', priority: 'medium', list: sprintList, sp: 5, assignee: lisa, sprint: sprint2, labels: ['design','mobile'] },
    { title: 'Setup Storybook for @vibestudio/ui', type: 'task', status: 'done', priority: 'low', list: infraList, sp: 3, assignee: alex, sprint: sprint2, labels: ['frontend','tooling'] },
    { title: 'Version-controlled prompt library (git-backed)', type: 'epic', status: 'backlog', priority: 'medium', list: backlog, sp: 21, labels: ['backend','prompts'] },
    { title: 'Per-model A/B testing UI for prompts', type: 'story', status: 'backlog', priority: 'medium', list: backlog, sp: 13, labels: ['frontend','ai'] },
    { title: 'Add 2FA (TOTP) for dev portal', type: 'improvement', status: 'backlog', priority: 'high', list: backlog, sp: 5, labels: ['security'] },
    { title: 'Standalone desktop (.exe) shell', type: 'story', status: 'backlog', priority: 'high', list: backlog, sp: 13, labels: ['desktop','infra'] },
    { title: 'Redis caching for activity feed queries', type: 'improvement', status: 'backlog', priority: 'high', list: backlog, sp: 8, labels: ['backend','performance'] },
    { title: 'Add OpenTelemetry tracing', type: 'spike', status: 'backlog', priority: 'low', list: infraList, sp: 5, labels: ['infra','observability'] },
    { title: 'AI: Auto-generate API docs from Zod', type: 'ai_task', status: 'todo', priority: 'medium', list: sprintList, sp: 5, assignee: codingAgent, ai: true, labels: ['ai','docs'] },
    { title: 'AI: Security audit — scan routes', type: 'ai_task', status: 'done', priority: 'high', list: sprintList, sp: 3, assignee: secAgent, ai: true, labels: ['ai','security'] },
    { title: 'AI: Full regression test suite', type: 'ai_task', status: 'in_progress', priority: 'medium', list: sprintList, sp: 3, assignee: qaAgent, ai: true, labels: ['ai','testing'] },
    { title: 'Write onboarding guide for new devs', type: 'task', status: 'in_progress', priority: 'medium', list: docsList, sp: 5, assignee: sarah, labels: ['docs'] },
    { title: 'Document all 12 roles & permissions', type: 'task', status: 'done', priority: 'medium', list: docsList, sp: 3, assignee: sarah, labels: ['docs'] },
    { title: 'Create API changelog for v2.0', type: 'task', status: 'todo', priority: 'medium', list: docsList, sp: 3, assignee: maria, labels: ['docs','api'] },
  ];

  for (const t of taskDefs) {
    if (!t.list) continue;
    await knex('dev_tasks').insert({
      project_id: project.id, space_id: space.id, list_id: t.list.id,
      task_key: `VIBE-${seq++}`, title: t.title, type: t.type, status: t.status,
      priority: t.priority, story_points: t.sp, assignee_id: t.assignee?.id || null,
      reporter_id: ceo.id, sprint_id: t.sprint?.id || null,
      labels: JSON.stringify(t.labels || []),
      is_ai_generated: t.ai || false, ai_agent_id: t.ai ? t.assignee?.id : null,
      start_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + (Math.random() * 21 + 3) * 86400000).toISOString().split('T')[0],
      started_at: ['in_progress','in_review','done'].includes(t.status) ? new Date(Date.now() - Math.random() * 5 * 86400000) : null,
      completed_at: t.status === 'done' ? new Date(Date.now() - Math.random() * 2 * 86400000) : null,
    });
  }
  console.log('Tasks added:', taskDefs.length, '(total:', seq - 1, ')');

  // ── Comments ──
  const inProgressTasks = await knex('dev_tasks').where({ project_id: project.id }).whereIn('status', ['in_progress','in_review','done']).limit(15);
  const commentTexts = [
    'Started working on this. Initial implementation looks straightforward — PR up by tomorrow.',
    'PR is up for review. Added unit tests covering main scenarios. Check the edge case around an empty board column.',
    'Looks good overall! One suggestion: add an index on the new column for query performance.',
    'Fixed the issue. Root cause was a missing RLS context (app.current_member_id) on the direct query.',
    'Tested locally — board, sprints, and the prompt builder all render correctly.',
    'Updated to use the dev-portal service layer instead of an inline query. Much cleaner.',
    'Code review complete. Approved with minor suggestions. Great error handling!',
    'Ran full test suite — 47 tests pass, 0 failures. Merging now.',
    'Deployed to staging. Verified the fix works with the seeded demo data.',
    'This is blocked until migration 048 is applied. Unblocking now.',
  ];
  let commentN = 0;
  for (const task of inProgressTasks) {
    const n = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < n; i++) {
      const author = everyone[Math.floor(Math.random() * everyone.length)];
      await knex('dev_task_comments').insert({
        task_id: task.id, author_id: author.id,
        content: commentTexts[Math.floor(Math.random() * commentTexts.length)],
        type: 'comment', created_at: new Date(Date.now() - Math.random() * 7 * 86400000),
      });
      commentN++;
    }
  }
  console.log('Comments added:', commentN);

  // ── Activity Log ──
  const allTasks = await knex('dev_tasks').where({ project_id: project.id }).limit(25);
  const actions = ['task_created','task_moved','comment_added','sprint_started','pr_opened','pr_merged','deploy_completed','agent_completed','wiki_updated','member_joined'];
  for (let i = 0; i < 45; i++) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    const actor = everyone[Math.floor(Math.random() * everyone.length)];
    const task = allTasks[Math.floor(Math.random() * allTasks.length)];
    const details = action === 'task_moved' ? { from: 'todo', to: 'in_progress' } :
                    action === 'pr_merged' ? { branch: 'feat/' + (task?.task_key || 'unknown').toLowerCase() } :
                    action === 'deploy_completed' ? { env: 'staging', version: 'v2.1.0-beta' } : {};
    await knex('dev_activity_log').insert({
      actor_id: actor.id, action, entity_type: action.includes('sprint') ? 'sprint' : action.includes('deploy') ? 'deploy' : 'task',
      entity_id: task?.id, entity_name: (task?.title || 'Sprint 2').substring(0, 80),
      project_id: project.id, details: JSON.stringify(details),
      created_at: new Date(Date.now() - Math.random() * 7 * 86400000),
    });
  }
  console.log('Activity entries added: 45');

  // ── Channel Messages ──
  const msgs = [
    [generalCh, sarah, 'Hey team, Sprint 2 kickoff is today at 10am. Review the sprint goal before standup.'],
    [generalCh, alex, 'Just pushed the new Kanban board with drag-and-drop. Try it out!'],
    [generalCh, maria, 'WebSocket integration for channels is 80% done. Real-time messages tomorrow.'],
    [generalCh, tom, 'E2E test results: 94 passed, 3 failed (board reorder edge case). Working on fixes.'],
    [generalCh, lisa, 'Mobile wireframes are done! Uploaded to Docs section. Would love feedback.'],
    [generalCh, ceo, 'Great progress everyone! The studio looks amazing. Demo to stakeholders next Friday.'],
    [generalCh, codingAgent, 'Completed auto-documentation task. Generated OpenAPI specs for the dev-portal endpoints. PR #247 ready.'],
    [generalCh, secAgent, 'Security scan complete. All dev-portal routes checked. No RLS gaps found.'],
    [generalCh, qaAgent, 'Regression report: 312 tests, 308 passed (98.7%). 4 flaky tests — adding retry logic.'],
    [generalCh, sarah, 'Sprint 2 going well. 13/55 points completed. Critical board-reorder bug fix just merged.'],
    [generalCh, alex, 'Question: CSS Grid or Flexbox for the Gantt chart? Grid seems better for timeline layout.'],
    [generalCh, maria, '@alex Go with CSS Grid — handles overlapping date ranges much better. I can help with data layer.'],
    [generalCh, ceo, 'Reminder: code freeze for the next release is end of month. All Sprint 2 items must be merged by then.'],
    [welcomeCh, ceo, 'Welcome Sarah, Alex, Maria, Tom, and Lisa to the VibeStudio team! Check the Wiki for onboarding.'],
    [welcomeCh, sarah, 'Thanks! Excited to be here. Already explored the codebase — the 5-layer architecture is really clean.'],
    [welcomeCh, tom, 'The test infrastructure is solid. Love the auditLoggerMiddleware. Makes testing much easier.'],
    [welcomeCh, lisa, 'Design system is well organized. Starting on the component library in Storybook this week.'],
  ];
  for (let i = 0; i < msgs.length; i++) {
    const [ch, author, content] = msgs[i];
    if (!ch || !author) continue;
    await knex('dev_messages').insert({
      channel_id: ch.id, author_id: author.id, content, type: 'text',
      created_at: new Date(Date.now() - (msgs.length - i) * 7200000),
    });
  }
  console.log('Messages added:', msgs.length);

  // ── Inbox ──
  const inboxItems = [
    { type: 'task_assigned', title: 'Assigned: Implement WebSocket for channels', body: 'Sarah assigned this to Maria', actor: sarah, member: maria },
    { type: 'comment_mention', title: 'Sarah mentioned you in a comment', body: 'Can you review the WebSocket PR?', actor: sarah, member: maria },
    { type: 'task_assigned', title: 'AI completed: Security audit scan', body: 'Security Agent finished scanning all routes', actor: secAgent, member: ceo },
    { type: 'status_change', title: 'Task Done: Design mobile wireframes', body: 'Lisa completed the task', actor: lisa, member: ceo },
    { type: 'review_request', title: 'PR review: Fix board reorder', body: 'Maria requested review on PR #243', actor: maria, member: sarah },
    { type: 'comment_reply', title: 'Tom replied to your comment', body: 'Test results look good. 3 edge cases covered.', actor: tom, member: maria },
    { type: 'task_assigned', title: 'Assigned: Write onboarding guide', body: 'CEO assigned this documentation task', actor: ceo, member: sarah },
    { type: 'status_change', title: 'Sprint 2 started', body: 'Sprint 2 — Dev Portal & Polish is now active', actor: ceo, member: sarah },
    { type: 'message', title: 'New message in #General', body: 'CEO: Great progress! The portal looks amazing.', actor: ceo, member: alex },
    { type: 'task_assigned', title: 'AI task: Auto-generate API docs', body: 'Coding Agent will generate OpenAPI specs', actor: ceo, member: ceo },
    { type: 'pr_opened', title: 'PR #247 opened by Coding Agent', body: 'Auto-generated OpenAPI documentation for 605+ endpoints', actor: codingAgent, member: sarah },
    { type: 'deploy_completed', title: 'Deployed to staging', body: 'v2.1.0-beta deployed successfully. All health checks passing.', actor: opsAgent, member: ceo },
  ];
  for (const item of inboxItems) {
    if (!item.actor || !item.member) continue;
    await knex('dev_inbox').insert({
      member_id: item.member.id, type: item.type, title: item.title, body: item.body,
      source_type: 'task', source_id: allTasks[Math.floor(Math.random() * allTasks.length)]?.id,
      actor_id: item.actor.id, is_read: Math.random() > 0.5,
      created_at: new Date(Date.now() - Math.random() * 3 * 86400000),
    });
  }
  console.log('Inbox items added:', inboxItems.length);

  // ── Bookmarks ──
  const bms = [
    { title: 'VibeStudio Repository', url: 'https://github.com/codes-ai/vibestudio', icon: '📦' },
    { title: 'Anthropic Claude Docs', url: 'https://docs.anthropic.com', icon: '🤖' },
    { title: 'PostgreSQL 16 Docs', url: 'https://www.postgresql.org/docs/16/', icon: '🐘' },
    { title: 'Tailwind CSS Reference', url: 'https://tailwindcss.com/docs', icon: '🎨' },
    { title: 'Next.js 14 Documentation', url: 'https://nextjs.org/docs', icon: '▲' },
    { title: 'Claude API Reference', url: 'https://docs.anthropic.com/en/api', icon: '📡' },
    { title: 'Knex.js Query Builder', url: 'https://knexjs.org/', icon: '🔗' },
    { title: 'Staging Environment', url: 'https://test-vibestudio.codes-ai.uk', icon: '🚀' },
  ];
  for (const b of bms) {
    const exists = await knex('dev_bookmarks').where({ member_id: ceo.id, title: b.title }).first();
    if (!exists) await knex('dev_bookmarks').insert({ member_id: ceo.id, space_id: space.id, ...b });
  }
  console.log('Bookmarks added:', bms.length);

  // ── Favorites ──
  const existingFavs = await knex('dev_favorites').where({ member_id: ceo.id }).count('id as cnt').first();
  if (parseInt(existingFavs.cnt) === 0) {
    await knex('dev_favorites').insert([
      { member_id: ceo.id, target_type: 'space', target_id: space.id, target_name: 'Team Space', position: 0 },
      { member_id: ceo.id, target_type: 'list', target_id: sprintList.id, target_name: 'Sprint Tasks', position: 1 },
      { member_id: ceo.id, target_type: 'list', target_id: bugsList.id, target_name: 'Bugs', position: 2 },
    ]);
    console.log('Favorites added: 3');
  }

  // ── Docs ──
  const newDocs = [
    { title: 'API Changelog', icon: '📝', content: '# API Changelog\n\n## Endpoints\n- /api/v1/dev-portal/* — single dev-portal router\n- /api/v1/dev-portal/sessions — device/session management\n\n## Breaking Changes\n- None\n\n## Notes\n- Frontend calls go through the devApi helper in useDevAuth.ts' },
    { title: 'Deployment Runbook', icon: '🚀', content: '# Deployment Runbook\n\n## Steps\n1. Merge PR to main\n2. CI runs lint + typecheck + test (.github/workflows/ci.yml)\n3. On the IONOS VM: deploy/deploy.sh (git pull + npm install + db:migrate + build)\n4. systemctl restart vibestudio-api vibestudio-web\n5. Verify: curl localhost:4100/health\n\n## Rollback\ncd /srv/vibestudio && git reset --hard <prev_sha> && npm run build && systemctl restart vibestudio-api vibestudio-web' },
    { title: 'Database Schema Guide', icon: '🗄', content: '# Database Schema\n\n## Conventions\n- All tables prefixed dev_*\n- UUID primary keys (gen_random_uuid)\n- created_at, updated_at timestamps\n- JSONB for flexible data\n- snake_case columns\n- RLS enabled; scripts SET LOCAL app.current_member_id\n- Next migration: 081' },
    { title: 'Testing Strategy', icon: '🧪', content: '# Testing\n\n## Unit: vitest\n## Integration: supertest + real PostgreSQL\n## E2E: Playwright (planned)\n## Desktop: Playwright + Electron (planned)\n\nTarget: 90%+ coverage on the dev-portal service' },
    { title: 'Security Checklist', icon: '🔒', content: '# Security Checklist\n\n- [ ] dev_portal_token validated by the dev-portal middleware (never acca_token)\n- [ ] RLS context set (app.current_member_id) on direct DB scripts\n- [ ] Zod validation for input\n- [ ] Handle 401/403 correctly\n- [ ] No sensitive data in localStorage beyond the Bearer fallback token\n- [ ] Parameterized queries only\n- [ ] logActivity() on mutations' },
    { title: 'Sprint 2 Retrospective', icon: '🔄', content: '# Sprint 2 Retro\n\n## Went Well\n- Dev portal shipped\n- AI agents working autonomously\n- Zero incidents\n\n## Improve\n- Better estimation for UI work\n- More code review coverage' },
  ];
  for (const doc of newDocs) {
    const exists = await knex('dev_docs').where({ space_id: space.id, title: doc.title }).first();
    if (!exists) await knex('dev_docs').insert({ space_id: space.id, ...doc, created_by: ceo.id, last_edited_by: sarah?.id || ceo.id });
  }
  console.log('Docs added:', newDocs.length);

  // ── Update Sprint 2 points ──
  const donePoints = await knex('dev_tasks').where({ sprint_id: sprint2.id, status: 'done' }).sum('story_points as total').first();
  await knex('dev_sprints').where({ id: sprint2.id }).update({ completed_points: parseInt(donePoints?.total || '0') });

  console.log('\n=== DEV PORTAL SEED COMPLETE ===');
};
