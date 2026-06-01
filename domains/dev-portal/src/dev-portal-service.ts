import { createLogger } from '@vibestudio/logging';

const logger = createLogger({ service: 'dev-portal' });

// Find monorepo root by walking up from CWD
function getProjectRoot(): string {
  const fs = require('fs');
  const path = require('path');
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      if (pkg.workspaces || fs.existsSync(path.join(dir, 'turbo.json'))) return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const devPortalService = {
  // ── Auth ──
  async login(email: string, password: string) {
    const { db } = require('@vibestudio/database');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const { config } = require('@vibestudio/config');

    const member = await db('dev_team_members').where({ email, status: 'active' }).first();
    if (!member) return { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };

    const valid = await bcrypt.compare(password, member.password_hash);
    if (!valid) return { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } };

    const token = jwt.sign(
      { devMemberId: member.id, email: member.email, role: member.role, name: member.name, isDevPortal: true },
      (() => { const s = config.jwtSecret || process.env.JWT_SECRET; if (!s) throw new Error('JWT_SECRET is not configured'); return s; })(),
      { expiresIn: '24h' }
    );

    await db('dev_team_members').where({ id: member.id }).update({ last_login_at: db.fn.now(), last_active_at: db.fn.now() });

    const { password_hash, ...safeUser } = member;
    return { success: true, data: { token, user: safeUser } };
  },

  async getMe(memberId: string) {
    const { db } = require('@vibestudio/database');
    const member = await db('dev_team_members').where({ id: memberId }).first();
    if (!member) return null;
    const { password_hash, ...safeUser } = member;
    return safeUser;
  },

  async getActiveProjectId(memberId: string): Promise<string | null> {
    const { db } = require('@vibestudio/database');
    const member = await db('dev_team_members').where({ id: memberId }).select('preferences').first();
    return member?.preferences?.active_project_id || null;
  },

  async setActiveProjectId(memberId: string, projectId: string) {
    const { db } = require('@vibestudio/database');
    const member = await db('dev_team_members').where({ id: memberId }).first();
    const prefs = member?.preferences || {};
    prefs.active_project_id = projectId;
    await db('dev_team_members').where({ id: memberId }).update({ preferences: JSON.stringify(prefs) });
    return { active_project_id: projectId };
  },

  // ── Team ──
  async listMembers(filters?: { role?: string; status?: string; department?: string }) {
    const { db } = require('@vibestudio/database');
    let query = db('dev_team_members').select('id', 'email', 'name', 'display_name', 'avatar_url', 'role', 'title', 'department', 'status', 'skills', 'is_ai_agent', 'agent_type', 'last_active_at', 'github_username');
    if (filters?.role) query = query.where('role', filters.role);
    if (filters?.status) query = query.where('status', filters.status);
    if (filters?.department) query = query.where('department', filters.department);
    return query.orderBy('name');
  },

  async createMember(data: any) {
    const { db } = require('@vibestudio/database');
    const bcrypt = require('bcryptjs');
    if (!data.password) throw new Error('Password is required for new team members');
    const hash = await bcrypt.hash(data.password, 10);
    const [member] = await db('dev_team_members').insert({
      email: data.email,
      password_hash: hash,
      name: data.name,
      display_name: data.display_name || data.name.split(' ')[0],
      role: data.role || 'developer',
      title: data.title,
      department: data.department || 'engineering',
      skills: JSON.stringify(data.skills || []),
      github_username: data.github_username,
      is_ai_agent: data.is_ai_agent || false,
      agent_type: data.agent_type,
    }).returning('*');
    const { password_hash, ...safe } = member;
    return safe;
  },

  // ── Projects ──
  async listProjects() {
    const { db } = require('@vibestudio/database');
    const projects = await db('dev_projects').orderBy('name');
    for (const p of projects) {
      const taskStats = await db('dev_tasks').where('project_id', p.id)
        .select(db.raw("count(*) as total, count(*) filter (where status = 'done') as done, count(*) filter (where status = 'in_progress') as in_progress"));
      p.stats = taskStats[0] || { total: 0, done: 0, in_progress: 0 };
      // Member count
      try { const mc = await db('dev_project_members').where('project_id', p.id).whereNull('left_at').count('* as count').first(); p.member_count = parseInt(mc?.count as string || '0'); } catch { p.member_count = 0; }
      // Active sprint
      try { const sp = await db('dev_sprints').where({ project_id: p.id, status: 'active' }).first(); p.active_sprint = sp ? { id: sp.id, name: sp.name, end_date: sp.end_date } : null; } catch { p.active_sprint = null; }
    }
    return projects;
  },

  async createProject(data: { name: string; key: string; description?: string; color?: string; icon?: string; lead_id?: string; priority?: string; category?: string; start_date?: string; target_date?: string; repository_url?: string; tech_stack?: string; client_name?: string }, creatorId: string) {
    const { db } = require('@vibestudio/database');
    const [project] = await db('dev_projects').insert({
      name: data.name, key: (data.key || data.name.substring(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, ''),
      description: data.description || '', color: data.color || '#6366f1', icon: data.icon || '📦',
      lead_id: data.lead_id || null, status: 'active',
      priority: data.priority || 'medium', category: data.category || 'internal',
      start_date: data.start_date || null, target_date: data.target_date || null,
      repository_url: data.repository_url || null, tech_stack: data.tech_stack || null,
      client_name: data.client_name || null, settings: JSON.stringify({}),
    }).returning('*');
    // Auto-add creator as owner
    await db('dev_project_members').insert({ project_id: project.id, member_id: creatorId, role: 'owner' });
    return project;
  },

  // ── Project context pack (filesystem docs for a managed project) ──
  // Scaffolds projects/<slug>/ from projects/_template, writes project.json +
  // standard doc stubs, and links dev_projects.settings.docs_path. Idempotent.
  async createProjectPack(projectId: string, opts: any = {}) {
    const { db } = require('@vibestudio/database');
    const fs = require('fs');
    const path = require('path');
    const project = await db('dev_projects').where('id', projectId).first();
    if (!project) throw new Error('Project not found');

    const slug = (opts.slug || project.key || project.name).toString()
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
    const root = getProjectRoot();
    const projectsDir = path.join(root, 'projects');
    const packDir = path.join(projectsDir, slug);
    const relPath = `projects/${slug}`;

    if (fs.existsSync(packDir) && !opts.force) {
      await devPortalService._linkPack(projectId, project, relPath);
      return { slug, docs_path: relPath, created: false, message: 'Pack already exists' };
    }

    // Seed folders from the _template if present, else create them.
    const template = path.join(projectsDir, '_template');
    fs.mkdirSync(packDir, { recursive: true });
    if (fs.existsSync(template)) {
      fs.cpSync(template, packDir, { recursive: true });
    } else {
      for (const d of ['sessions', 'prompts', 'bug-history', 'cost-tracking', 'sprint']) {
        fs.mkdirSync(path.join(packDir, d), { recursive: true });
      }
    }

    const stack = (project.tech_stack || '').toString().split(',').map((s: string) => s.trim()).filter(Boolean);
    fs.writeFileSync(path.join(packDir, 'project.json'), JSON.stringify({
      slug, name: project.name, key: project.key,
      repo_path: opts.repo_path || project.repository_url || '',
      stack, status: project.status || 'active',
      dev_project_id: project.id,
      created_at: new Date().toISOString().slice(0, 10),
    }, null, 2));

    const docs = devPortalService._packDocs(project, slug);
    const written = ['project.json'];
    for (const [fname, content] of Object.entries(docs)) {
      fs.writeFileSync(path.join(packDir, fname), content as string);
      written.push(fname);
    }

    await devPortalService._linkPack(projectId, project, relPath);
    try {
      await devPortalService.logActivity(opts.actorId || project.lead_id, 'project_pack_created', 'project', projectId, `Generated context pack at ${relPath}`, projectId);
    } catch {}
    return { slug, docs_path: relPath, created: true, files: written };
  },

  async _linkPack(projectId: string, project: any, relPath: string) {
    const { db } = require('@vibestudio/database');
    let settings: any = {};
    try { settings = typeof project.settings === 'string' ? JSON.parse(project.settings) : (project.settings || {}); } catch {}
    settings.docs_path = relPath;
    await db('dev_projects').where('id', projectId).update({ settings: JSON.stringify(settings), updated_at: new Date() });
  },

  _packDocs(project: any, slug: string): Record<string, string> {
    const name = project.name;
    const key = project.key || slug.toUpperCase();
    const stack = project.tech_stack || 'TBD';
    const repo = project.repository_url || '(set repo_path in project.json)';
    const today = new Date().toISOString().slice(0, 10);
    const H = (t: string, lines: string[]) => [
      `# ${t} — ${name}`, '',
      `> Generated ${today} by Vibe Engineering Studio. Fill in via the vibe-engineering-studio skill.`, '',
      ...lines, '',
    ].join('\n');
    return {
      'PROJECT_PLAN.md': H('PROJECT_PLAN', ['## Vision', `One-line goal for ${name}.`, '', '## Stack', stack, '', '## Modules', '- intake → design → build → ship', '', '## Build order', '1. MVP scope  2. v1  3. later']),
      'PRD.md': H('PRD', ['## Users / roles', '## Problem', '## Success criteria', '## Features (MVP / v1 / later)', '## Risks']),
      'ARCHITECTURE.md': H('ARCHITECTURE', ['## System overview', '## Frontend modules', '## Backend modules', '## Data model summary', '## Integrations', '## Auth & permissions', '## Deployment']),
      'DESIGN_SYSTEM.md': H('DESIGN_SYSTEM', ['Layout, palette, components, states, accessibility — generate via skill ref 02.']),
      'DATABASE_DESIGN.md': H('DATABASE_DESIGN', ['Entities, relationships, indexes, audit fields — generate via skill ref 02.']),
      'API_CONTRACT.md': H('API_CONTRACT', ['Endpoints, methods, request/response, auth, error format — generate via skill ref 02.']),
      'TASKS.md': H('TASKS', ['- [ ] Define MVP scope', '- [ ] Set up repo + CI', '- [ ] First feature']),
      'SPRINT_BOARD.md': H('SPRINT_BOARD', ['Columns: Backlog · Ready · In Progress · AI Coding · Review · Testing · Done · Blocked', '', '## Sprint 1', 'Goal: ...']),
      'PROMPTS.md': H('PROMPTS', ['Reusable prompts (format = skill templates/prompt-template.md). Durable copies in prompts/.']),
      'BUGFIX_HISTORY.md': H('BUGFIX_HISTORY', ['Newest first. Fields: date · tool/model · problem · root cause · fix · result · regression · follow-up.']),
      'TOKEN_COST_LOG.md': H('TOKEN_COST_LOG', ['| Date | Tool | Model | In | Out | Total | Cost | Quality | Notes |', '|---|---|---|---|---|---|---|---|---|', '', 'Never invent token/cost numbers — mark unknown/estimated.']),
      'memory.md': ['# memory.md — ' + name, '', '## Product Goal', '', '## Current Architecture', 'Stack: ' + stack, '', '## Important Decisions', '', '## Reusable Prompts', '', '## Repeated Bugs and Fixes', '', '## Token / Cost Notes', '', '## Sprint Status', '', '## Next Steps', ''].join('\n'),
      'CLAUDE.md': ['# CLAUDE.md — ' + name, '', `Project: ${name} (key ${key}). Stack: ${stack}. Repo: ${repo}.`, '', '## Rules', '- Read memory.md + sessions/latest-session.md before coding.', '- API responses { success, data, error }; validate input.', '- Save prompts → prompts/, bugs → bug-history/, decisions → memory.md.', '- Inspect → plan → edit. Minimal diffs. Summarize changed files.', ''].join('\n'),
      'AGENTS.md': ['# AGENTS.md — ' + name, '', 'Agent roles: coding, qa, security, ops, analytics, release.', 'Context-engineering first; read memory.md + PROJECT_PLAN.md.', 'Claude: inspect→plan→edit. Cursor: small file-scoped. Codex: tests + minimal diff.', ''].join('\n'),
      '.cursorrules': ['# .cursorrules — ' + name, '', 'Stack: ' + stack + '.', 'Before coding read memory.md + PROJECT_PLAN.md + sessions/latest-session.md.', 'Small file-scoped changes; cite exact files; save prompts/bugs back to this pack.', ''].join('\n'),
    };
  },

  async updateProject(projectId: string, data: any) {
    const { db } = require('@vibestudio/database');
    const updates: any = { updated_at: new Date() };
    for (const k of ['name', 'description', 'color', 'icon', 'status', 'priority', 'category', 'start_date', 'target_date', 'progress', 'health', 'repository_url', 'tech_stack', 'client_name', 'lead_id']) {
      if (data[k] !== undefined) updates[k] = data[k];
    }
    const [updated] = await db('dev_projects').where('id', projectId).update(updates).returning('*');
    return updated;
  },

  // ── Project Members ──
  async getProjectMembers(projectId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_project_members')
      .leftJoin('dev_team_members', 'dev_project_members.member_id', 'dev_team_members.id')
      .where('dev_project_members.project_id', projectId)
      .whereNull('dev_project_members.left_at')
      .select('dev_project_members.*', 'dev_team_members.name', 'dev_team_members.display_name', 'dev_team_members.email', 'dev_team_members.role as team_role', 'dev_team_members.avatar_url', 'dev_team_members.title', 'dev_team_members.is_ai_agent', 'dev_team_members.status as member_status')
      .orderBy('dev_project_members.role');
  },

  async addProjectMember(projectId: string, memberId: string, role = 'member', allocationPercent = 100) {
    const { db } = require('@vibestudio/database');
    const existing = await db('dev_project_members').where({ project_id: projectId, member_id: memberId }).first();
    if (existing && !existing.left_at) throw new Error('Already a member');
    if (existing) { await db('dev_project_members').where('id', existing.id).update({ left_at: null, role, allocation_percent: allocationPercent }); return { added: true }; }
    await db('dev_project_members').insert({ project_id: projectId, member_id: memberId, role, allocation_percent: allocationPercent });
    return { added: true };
  },

  async removeProjectMember(projectId: string, memberId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_project_members').where({ project_id: projectId, member_id: memberId }).update({ left_at: new Date() });
    return { removed: true };
  },

  async updateProjectMember(projectId: string, memberId: string, data: { role?: string; allocation_percent?: number }) {
    const { db } = require('@vibestudio/database');
    await db('dev_project_members').where({ project_id: projectId, member_id: memberId }).update(data);
    return { updated: true };
  },

  // Portfolio stats across all projects
  async getPortfolioStats() {
    const { db } = require('@vibestudio/database');
    const projects = await db('dev_projects').where('status', 'active');
    const result = [];
    for (const p of projects) {
      const tasks = await db('dev_tasks').where('project_id', p.id)
        .select(db.raw("count(*) as total, count(*) filter (where status = 'done') as done, count(*) filter (where status IN ('in_progress','in_review','testing')) as active, count(*) filter (where status = 'backlog' or status = 'todo') as pending")).first();
      const sprint = await db('dev_sprints').where({ project_id: p.id, status: 'active' }).first();
      let memberCount = 0;
      try { const mc = await db('dev_project_members').where('project_id', p.id).whereNull('left_at').count('* as c').first(); memberCount = parseInt(mc?.c as string || '0'); } catch {}
      result.push({
        ...p, tasks: { total: parseInt(tasks?.total || '0'), done: parseInt(tasks?.done || '0'), active: parseInt(tasks?.active || '0'), pending: parseInt(tasks?.pending || '0') },
        active_sprint: sprint ? { name: sprint.name, end_date: sprint.end_date } : null,
        member_count: memberCount,
        completion: parseInt(tasks?.total || '0') > 0 ? Math.round((parseInt(tasks?.done || '0') / parseInt(tasks?.total || '1')) * 100) : 0,
      });
    }
    return result;
  },

  // ── Sprints ──
  async listSprints(projectId: string) {
    const { db } = require('@vibestudio/database');
    const sprints = await db('dev_sprints').where('project_id', projectId).orderBy('sprint_number', 'desc');
    // Enrich each sprint with live task stats
    for (const s of sprints) {
      const stats = await db('dev_tasks').where('sprint_id', s.id)
        .select(
          db.raw("count(*) as total_tasks"),
          db.raw("count(*) filter (where status = 'done') as done_tasks"),
          db.raw("count(*) filter (where status = 'in_progress') as in_progress_tasks"),
          db.raw("coalesce(sum(story_points), 0) as assigned_points"),
          db.raw("coalesce(sum(story_points) filter (where status = 'done'), 0) as done_points"),
          db.raw("coalesce(sum(time_estimate), 0) as total_hours_estimated"),
          db.raw("coalesce(sum(time_spent), 0) as total_hours_spent"),
        ).first();
      s.total_tasks = parseInt(stats?.total_tasks || '0');
      s.done_tasks = parseInt(stats?.done_tasks || '0');
      s.in_progress_tasks = parseInt(stats?.in_progress_tasks || '0');
      s.assigned_points = parseInt(stats?.assigned_points || '0');
      s.done_points = parseInt(stats?.done_points || '0');
      s.total_hours_estimated = parseInt(stats?.total_hours_estimated || '0');
      s.total_hours_spent = parseInt(stats?.total_hours_spent || '0');
      // Auto-sync completed_points from actual task data
      if (s.completed_points !== s.done_points) {
        await db('dev_sprints').where({ id: s.id }).update({ completed_points: s.done_points });
        s.completed_points = s.done_points;
      }
    }
    return sprints;
  },

  async getActiveSprint(projectId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_sprints').where({ project_id: projectId, status: 'active' }).first();
  },

  async createSprint(projectId: string, data: any) {
    const { db } = require('@vibestudio/database');
    const lastSprint = await db('dev_sprints').where('project_id', projectId).orderBy('sprint_number', 'desc').first();
    // Calculate working days between start and end
    let workingDays = 0;
    if (data.start_date && data.end_date) {
      const start = new Date(data.start_date);
      const end = new Date(data.end_date);
      const cur = new Date(start);
      while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) workingDays++;
        cur.setDate(cur.getDate() + 1);
      }
    }
    // Get active team members (non-AI) for capacity calculation
    const teamMembers = await db('dev_team_members').where({ status: 'active', is_ai_agent: false }).select('id', 'name', 'display_name');
    const teamSize = teamMembers.length;
    const hoursPerDay = data.hours_per_day || 8;
    const totalTeamHours = workingDays * hoursPerDay * teamSize;

    const [sprint] = await db('dev_sprints').insert({
      project_id: projectId,
      name: data.name,
      sprint_number: (lastSprint?.sprint_number || 0) + 1,
      goal: data.goal,
      start_date: data.start_date,
      end_date: data.end_date,
      capacity_points: data.capacity_points || 0,
      retrospective: JSON.stringify({
        working_days: workingDays,
        team_size: teamSize,
        hours_per_day: hoursPerDay,
        total_team_hours: totalTeamHours,
        team_members: data.team_member_ids || teamMembers.map((m: any) => m.id),
      }),
    }).returning('*');
    return sprint;
  },

  async updateSprint(sprintId: string, data: any) {
    const { db } = require('@vibestudio/database');
    const updates: any = { ...data, updated_at: db.fn.now() };
    // Recalculate working days if dates changed
    if (data.start_date || data.end_date) {
      const existing = await db('dev_sprints').where({ id: sprintId }).first();
      const startDate = data.start_date || existing.start_date;
      const endDate = data.end_date || existing.end_date;
      if (startDate && endDate) {
        let workingDays = 0;
        const cur = new Date(startDate);
        const end = new Date(endDate);
        while (cur <= end) {
          const day = cur.getDay();
          if (day !== 0 && day !== 6) workingDays++;
          cur.setDate(cur.getDate() + 1);
        }
        const retro = typeof existing.retrospective === 'string' ? JSON.parse(existing.retrospective || '{}') : (existing.retrospective || {});
        retro.working_days = workingDays;
        retro.total_team_hours = workingDays * (retro.hours_per_day || 8) * (retro.team_size || 1);
        updates.retrospective = JSON.stringify(retro);
      }
    }
    if (updates.retrospective && typeof updates.retrospective === 'object') {
      updates.retrospective = JSON.stringify(updates.retrospective);
    }
    delete updates.id; delete updates.sprint_number; delete updates.project_id; delete updates.created_at;
    await db('dev_sprints').where({ id: sprintId }).update(updates);
    return db('dev_sprints').where({ id: sprintId }).first();
  },

  async getSprintTasks(sprintId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_tasks')
      .leftJoin('dev_team_members as assignee', 'dev_tasks.assignee_id', 'assignee.id')
      .where('dev_tasks.sprint_id', sprintId)
      .select(
        'dev_tasks.*',
        'assignee.name as assignee_name', 'assignee.display_name as assignee_display_name',
        'assignee.is_ai_agent as assignee_is_ai',
      )
      .orderBy('dev_tasks.position').orderBy('dev_tasks.created_at', 'desc');
  },

  async getSprintStats(sprintId: string) {
    const { db } = require('@vibestudio/database');
    const sprint = await db('dev_sprints').where({ id: sprintId }).first();
    if (!sprint) return null;
    const tasks = await db('dev_tasks').where('sprint_id', sprintId);
    const retro = typeof sprint.retrospective === 'string' ? JSON.parse(sprint.retrospective || '{}') : (sprint.retrospective || {});

    // Per-member workload
    const memberWorkload: Record<string, { name: string; tasks: number; points: number; hours_estimated: number; hours_spent: number; done: number }> = {};
    for (const t of tasks) {
      const aid = t.assignee_id || 'unassigned';
      if (!memberWorkload[aid]) memberWorkload[aid] = { name: 'Unassigned', tasks: 0, points: 0, hours_estimated: 0, hours_spent: 0, done: 0 };
      memberWorkload[aid].tasks++;
      memberWorkload[aid].points += t.story_points || 0;
      memberWorkload[aid].hours_estimated += t.time_estimate || 0;
      memberWorkload[aid].hours_spent += t.time_spent || 0;
      if (t.status === 'done') memberWorkload[aid].done++;
    }
    // Fill member names
    const memberIds = Object.keys(memberWorkload).filter(id => id !== 'unassigned');
    if (memberIds.length > 0) {
      const members = await db('dev_team_members').whereIn('id', memberIds).select('id', 'name', 'display_name');
      for (const m of members) {
        if (memberWorkload[m.id]) memberWorkload[m.id].name = m.display_name || m.name;
      }
    }

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    const typeBreakdown: Record<string, number> = {};
    let totalPoints = 0, donePoints = 0, totalHours = 0, spentHours = 0;
    for (const t of tasks) {
      statusBreakdown[t.status] = (statusBreakdown[t.status] || 0) + 1;
      typeBreakdown[t.type] = (typeBreakdown[t.type] || 0) + 1;
      totalPoints += t.story_points || 0;
      if (t.status === 'done') donePoints += t.story_points || 0;
      totalHours += t.time_estimate || 0;
      spentHours += t.time_spent || 0;
    }

    // Burndown: calculate ideal and actual remaining per day
    const burndown: { date: string; ideal: number; actual: number }[] = [];
    if (sprint.start_date && sprint.end_date) {
      const startD = new Date(sprint.start_date);
      const endD = new Date(sprint.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const workingDays = retro.working_days || 1;
      const idealPerDay = totalPoints / workingDays;
      let dayIdx = 0;
      const cur = new Date(startD);
      while (cur <= endD) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) {
          dayIdx++;
          const idealRemaining = Math.max(0, totalPoints - (idealPerDay * dayIdx));
          // Actual: count points done by this date
          let actualDone = 0;
          if (cur <= today) {
            const dateStr = cur.toISOString().split('T')[0];
            for (const t of tasks) {
              if (t.status === 'done' && t.completed_at) {
                const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
                if (completedDate <= dateStr) actualDone += t.story_points || 0;
              }
            }
          }
          burndown.push({
            date: cur.toISOString().split('T')[0],
            ideal: Math.round(idealRemaining * 10) / 10,
            actual: cur <= today ? totalPoints - actualDone : -1, // -1 = future
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    return {
      sprint,
      totalTasks: tasks.length,
      totalPoints,
      donePoints,
      totalHours,
      spentHours,
      statusBreakdown,
      typeBreakdown,
      memberWorkload,
      burndown,
      workingDays: retro.working_days || 0,
      teamSize: retro.team_size || 0,
      hoursPerDay: retro.hours_per_day || 8,
      totalTeamHours: retro.total_team_hours || 0,
      teamMemberIds: retro.team_members || [],
    };
  },

  async logTimeOnTask(taskId: string, hours: number, memberId: string) {
    const { db } = require('@vibestudio/database');
    const task = await db('dev_tasks').where({ id: taskId }).first();
    if (!task) throw new Error('Task not found');
    const newSpent = (task.time_spent || 0) + hours;
    await db('dev_tasks').where({ id: taskId }).update({ time_spent: newSpent, updated_at: db.fn.now() });
    await devPortalService.logActivity(memberId, 'time_logged', 'task', taskId, task.title, task.project_id, { hours, total_spent: newSpent });
    return { time_spent: newSpent, time_estimate: task.time_estimate };
  },

  async bulkMoveToSprint(taskIds: string[], sprintId: string | null) {
    const { db } = require('@vibestudio/database');
    await db('dev_tasks').whereIn('id', taskIds).update({ sprint_id: sprintId, updated_at: db.fn.now() });
  },

  // ── Tasks ──
  async listTasks(projectId: string, filters?: any) {
    const { db } = require('@vibestudio/database');
    let query = db('dev_tasks')
      .leftJoin('dev_team_members as assignee', 'dev_tasks.assignee_id', 'assignee.id')
      .leftJoin('dev_team_members as reporter', 'dev_tasks.reporter_id', 'reporter.id')
      .where('dev_tasks.project_id', projectId)
      .select(
        'dev_tasks.*',
        'assignee.name as assignee_name', 'assignee.display_name as assignee_display_name', 'assignee.avatar_url as assignee_avatar', 'assignee.is_ai_agent as assignee_is_ai',
        'reporter.name as reporter_name',
        // Count open blockers (tasks this task depends on that are not yet done)
        db.raw(`(
          SELECT count(*)::int FROM dev_task_dependencies dep
          JOIN dev_tasks blocker ON blocker.id = dep.depends_on_id
          WHERE dep.task_id = dev_tasks.id AND blocker.status != 'done'
        ) AS blocked_by_count`),
      );
    if (filters?.status) query = query.where('dev_tasks.status', filters.status);
    if (filters?.sprint_id) query = query.where('dev_tasks.sprint_id', filters.sprint_id);
    if (filters?.assignee_id) query = query.where('dev_tasks.assignee_id', filters.assignee_id);
    if (filters?.type) query = query.where('dev_tasks.type', filters.type);
    if (filters?.priority) query = query.where('dev_tasks.priority', filters.priority);
    if (filters?.search) query = query.where(function() { this.whereILike('dev_tasks.title', `%${filters.search}%`).orWhereILike('dev_tasks.task_key', `%${filters.search}%`); });
    return query.orderBy('dev_tasks.position').orderBy('dev_tasks.created_at', 'desc');
  },

  async getTask(taskId: string) {
    const { db } = require('@vibestudio/database');
    const task = await db('dev_tasks')
      .leftJoin('dev_team_members as assignee', 'dev_tasks.assignee_id', 'assignee.id')
      .leftJoin('dev_team_members as reporter', 'dev_tasks.reporter_id', 'reporter.id')
      .leftJoin('dev_team_members as reviewer', 'dev_tasks.reviewer_id', 'reviewer.id')
      .leftJoin('dev_sprints', 'dev_tasks.sprint_id', 'dev_sprints.id')
      .where('dev_tasks.id', taskId)
      .select('dev_tasks.*', 'assignee.name as assignee_name', 'assignee.display_name as assignee_display_name', 'reporter.name as reporter_name', 'reviewer.name as reviewer_name', 'dev_sprints.name as sprint_name')
      .first();
    if (!task) return null;
    const comments = await db('dev_task_comments')
      .leftJoin('dev_team_members', 'dev_task_comments.author_id', 'dev_team_members.id')
      .where('task_id', taskId)
      .select('dev_task_comments.*', 'dev_team_members.name as author_name', 'dev_team_members.display_name as author_display_name', 'dev_team_members.is_ai_agent as author_is_ai')
      .orderBy('dev_task_comments.created_at');
    const subtasks = await db('dev_tasks').where('parent_id', taskId).select('id', 'task_key', 'title', 'status', 'priority', 'assignee_id');
    return { ...task, comments, subtasks };
  },

  async createTask(projectId: string, data: any, reporterId: string) {
    const { db } = require('@vibestudio/database');
    const project = await db('dev_projects').where({ id: projectId }).first();
    if (!project) throw new Error('Project not found');
    const lastTask = await db('dev_tasks').where('project_id', projectId).orderBy('created_at', 'desc').first();
    const seq = lastTask ? parseInt(lastTask.task_key.split('-')[1] || '0') + 1 : 1;
    const taskKey = `${project.key}-${seq}`;
    // Default to active sprint if no sprint specified
    let sprintId = data.sprint_id || null;
    if (!sprintId && data.auto_assign_sprint !== false) {
      const activeSprint = await db('dev_sprints').where({ project_id: projectId, status: 'active' }).first();
      if (activeSprint) sprintId = activeSprint.id;
    }
    const [task] = await db('dev_tasks').insert({
      project_id: projectId,
      sprint_id: sprintId,
      parent_id: data.parent_id || null,
      task_key: taskKey,
      title: data.title,
      description: data.description,
      type: data.type || 'task',
      status: data.status || (sprintId ? 'todo' : 'backlog'),
      priority: data.priority || 'medium',
      story_points: data.story_points,
      assignee_id: data.assignee_id || null,
      reporter_id: reporterId,
      labels: JSON.stringify(data.labels || []),
      component: data.component,
      due_date: data.due_date || null,
      estimated_hours: data.estimated_hours,
      time_estimate: data.time_estimate || null,
      is_ai_generated: data.is_ai_generated || false,
      ai_agent_id: data.ai_agent_id || null,
    }).returning('*');
    await devPortalService.logActivity(reporterId, 'task_created', 'task', task.id, task.title, projectId, { type: data.type });
    // Notify assignee
    if (data.assignee_id && data.assignee_id !== reporterId) {
      const reporter = await db('dev_team_members').where({ id: reporterId }).first();
      await devPortalService.createInboxEntry(data.assignee_id, 'task_assigned', `Assigned: ${task.title}`, `${reporter?.name || 'Someone'} assigned you ${taskKey}`, 'task', task.id, reporterId);
    }
    return task;
  },

  async updateTask(taskId: string, data: any, actorId: string) {
    const { db } = require('@vibestudio/database');
    const oldTask = await db('dev_tasks').where({ id: taskId }).first();
    if (!oldTask) throw new Error('Task not found');
    const updates: any = { ...data, updated_at: db.fn.now() };
    if (data.labels) updates.labels = JSON.stringify(data.labels);
    if (data.status === 'in_progress' && !oldTask.started_at) updates.started_at = db.fn.now();
    if (data.status === 'done' && !oldTask.completed_at) updates.completed_at = db.fn.now();
    // Handle time fields
    if (data.time_estimate !== undefined) updates.time_estimate = data.time_estimate;
    if (data.time_spent !== undefined) updates.time_spent = data.time_spent;
    delete updates.id; delete updates.task_key; delete updates.project_id; delete updates.created_at;
    await db('dev_tasks').where({ id: taskId }).update(updates);
    // Auto-sync sprint completed_points when task done/undone
    if (data.status && data.status !== oldTask.status && oldTask.sprint_id) {
      const sprintTasks = await db('dev_tasks').where({ sprint_id: oldTask.sprint_id, status: 'done' });
      const donePoints = sprintTasks.reduce((sum: number, t: any) => sum + (t.story_points || 0), 0);
      // If this task just became done, include its points too
      const thisPoints = (data.status === 'done' && oldTask.story_points) ? oldTask.story_points : 0;
      const finalPoints = data.status === 'done' ? donePoints + thisPoints : donePoints - (oldTask.story_points || 0);
      await db('dev_sprints').where({ id: oldTask.sprint_id }).update({ completed_points: Math.max(0, finalPoints) });
    }
    if (data.status && data.status !== oldTask.status) {
      await devPortalService.logActivity(actorId, 'task_moved', 'task', taskId, oldTask.title, oldTask.project_id, { from: oldTask.status, to: data.status });
      await db('dev_task_comments').insert({ task_id: taskId, author_id: actorId, content: `Status changed: **${oldTask.status}** → **${data.status}**`, type: 'status_change', metadata: JSON.stringify({ from: oldTask.status, to: data.status }) });
      // Notify assignee and reporter about status change
      const actor = await db('dev_team_members').where({ id: actorId }).first();
      const notifyIds = [oldTask.assignee_id, oldTask.reporter_id].filter(id => id && id !== actorId);
      for (const memberId of [...new Set(notifyIds)]) {
        await devPortalService.createInboxEntry(memberId, 'status_change', `${oldTask.task_key}: ${oldTask.status} → ${data.status}`, `${actor?.name || 'Someone'} moved "${oldTask.title}"`, 'task', taskId, actorId);
      }
    }
    // Notify new assignee when reassigned
    if (data.assignee_id && data.assignee_id !== oldTask.assignee_id && data.assignee_id !== actorId) {
      const actor = await db('dev_team_members').where({ id: actorId }).first();
      await devPortalService.createInboxEntry(data.assignee_id, 'task_assigned', `Assigned: ${oldTask.title}`, `${actor?.name || 'Someone'} assigned you ${oldTask.task_key}`, 'task', taskId, actorId);
    }
    return db('dev_tasks').where({ id: taskId }).first();
  },

  // ── Comments ──
  async addComment(taskId: string, authorId: string, content: string, type = 'comment') {
    const { db } = require('@vibestudio/database');
    const [comment] = await db('dev_task_comments').insert({ task_id: taskId, author_id: authorId, content, type }).returning('*');
    const task = await db('dev_tasks').where({ id: taskId }).first();
    if (task) {
      await devPortalService.logActivity(authorId, 'comment_added', 'task', taskId, task.title, task.project_id);
      // Notify assignee and reporter about new comment
      const author = await db('dev_team_members').where({ id: authorId }).first();
      const notifyIds = [task.assignee_id, task.reporter_id].filter((id: string) => id && id !== authorId);
      for (const memberId of [...new Set(notifyIds)]) {
        await devPortalService.createInboxEntry(memberId, 'comment_reply', `Comment on ${task.task_key}: ${task.title}`, `${author?.name || 'Someone'}: ${content.substring(0, 100)}`, 'task', taskId, authorId);
      }
    }
    return comment;
  },

  // ── Activity ──
  async logActivity(actorId: string, action: string, entityType: string, entityId: string, entityName: string, projectId: string, details?: any) {
    const { db } = require('@vibestudio/database');
    await db('dev_activity_log').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, entity_name: entityName, project_id: projectId, details: JSON.stringify(details || {}) });
  },

  async getActivity(projectId: string, limit = 50, cursor?: string) {
    const { db } = require('@vibestudio/database');
    const pageSize = Math.min(Math.max(1, limit), 100);
    let query = db('dev_activity_log')
      .leftJoin('dev_team_members', 'dev_activity_log.actor_id', 'dev_team_members.id')
      .where('dev_activity_log.project_id', projectId)
      .select('dev_activity_log.*', 'dev_team_members.name as actor_name', 'dev_team_members.display_name as actor_display_name', 'dev_team_members.is_ai_agent as actor_is_ai')
      .orderBy('dev_activity_log.created_at', 'desc')
      .orderBy('dev_activity_log.id', 'desc')
      .limit(pageSize + 1);
    if (cursor) {
      // cursor is base64-encoded JSON: { created_at, id }
      try {
        const { created_at, id } = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        query = query.where(function (this: any) {
          this.where('dev_activity_log.created_at', '<', created_at)
            .orWhere(function (this: any) {
              this.where('dev_activity_log.created_at', '=', created_at)
                .andWhere('dev_activity_log.id', '<', id);
            });
        });
      } catch { /* ignore invalid cursor */ }
    }
    const rows = await query;
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ created_at: items[items.length - 1].created_at, id: items[items.length - 1].id })).toString('base64')
      : null;
    return { items, next_cursor: nextCursor, has_more: hasMore };
  },

  // ── Wiki ──
  async listWikiPages(projectId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_wiki_pages').where({ project_id: projectId }).orderBy('position').orderBy('title');
  },

  async getWikiPage(pageId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_wiki_pages').where({ id: pageId }).first();
  },

  async createWikiPage(projectId: string, data: any, authorId: string) {
    const { db } = require('@vibestudio/database');
    const slug = data.slug || data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const [page] = await db('dev_wiki_pages').insert({ project_id: projectId, parent_id: data.parent_id || null, title: data.title, slug, content: data.content || '', icon: data.icon || '📄', last_edited_by: authorId }).returning('*');
    await devPortalService.logActivity(authorId, 'wiki_updated', 'wiki', page.id, page.title, projectId);
    return page;
  },

  async updateWikiPage(pageId: string, data: any, authorId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_wiki_pages').where({ id: pageId }).update({ ...data, last_edited_by: authorId, updated_at: db.fn.now() });
    return db('dev_wiki_pages').where({ id: pageId }).first();
  },

  async generateProjectWikiPages(projectId: string, authorId: string) {
    const { db } = require('@vibestudio/database');
    const scan = await devPortalService.scanProject();
    const m = scan.metrics;
    const now = new Date().toISOString().split('T')[0];

    const wikiPages: { slug: string; title: string; icon: string; content: string; position: number }[] = [
      {
        slug: 'guide-developer', title: 'Developer Guide', icon: '📘', position: 10,
        content: `# VibeStudio Developer Guide
> Auto-generated from live project scan — ${now}
> ${m.routeFiles} routes · ${m.totalEndpoints} endpoints · ${m.migrations} migrations · ${m.domains} domains · ${m.pages} pages · ${m.tsFiles} TS files

---

## Quick Start
\`\`\`bash
cd D:/VibeStudio
cp .env.example .env          # fill in DB password + JWT secrets + AI keys
npm install
node scripts/ensure-db-tunnel.js   # opens 127.0.0.1:5545 → IONOS
npm run db:migrate && npm run db:seed
npm run dev
\`\`\`

## URLs
| Service | URL |
|---------|-----|
| Web (Next.js) | http://localhost:3100 |
| API (Express) | http://localhost:4100 |
| Dev Portal | http://localhost:3100/dev-portal/login |
| PostgreSQL | 127.0.0.1:5545 → IONOS (vibestudio / vibestudio) |

## Demo Credentials
| User | Email | Password | Role |
|------|-------|----------|------|
| CEO | ceo@codes-ai.uk | (printed at end of \`npm run db:seed\`) | ceo |

> Change the seeded password on first login.

## Tech Stack
- **Backend:** Node.js ≥20, TypeScript (strict), Express, Knex.js (PostgreSQL)
- **Frontend:** React 18, Next.js 14 (Pages Router), Tailwind CSS
- **Auth:** dev_portal_token JWT (httpOnly cookie) + refresh tokens
- **Build:** Turborepo + npm workspaces
- **AI providers:** Anthropic / OpenAI / DeepSeek / Moonshot / Groq

## Project Structure
\`\`\`
D:/VibeStudio
├── apps/
│   ├── api/   — Express API (${m.routeFiles} routes, ${m.totalEndpoints} endpoints)
│   └── web/   — Next.js frontend (${m.pages} pages)
├── domains/dev-portal/  — business services
├── packages/            — ${m.packages} shared packages
├── infrastructure/      — ${m.migrations} migrations + seed
└── deploy/              — systemd, nginx, deploy.sh
\`\`\`

## Architecture
\`\`\`
Platform Shells (web · planned: desktop .exe · mobile)
Business Logic  (domains/dev-portal)
Core            (@vibestudio/database, @vibestudio/config, @vibestudio/logging, @vibestudio/utils)
\`\`\`

## Key Rules
1. **Separate from ACCA** — no accounting concepts (no SKR03, journal entries, VAT, GoBD).
2. **Ports** — web 3100, API 4100, DB tunnel 5545 (3000/4000/5544 belong to ACCA).
3. **Auth** — dev_portal_token cookie (httpOnly, SameSite=Lax, Secure in prod). Never validate acca_token.
4. **DB columns** — snake_case. API response: { success, data, error }.
5. **RLS** — dev_* tables use RLS; direct scripts must SET LOCAL app.current_member_id.
6. **React hooks** — ALL useState/useEffect MUST be before any early return.
7. **Migrations** — never edit a shipped migration; add NNN_<slug>.js (next: 081).

## API Routes (${m.routeFiles} files, ${m.totalEndpoints} endpoints)
${scan.routes.map((r: any) => `- **${r.name}** — ${r.endpoints} endpoints`).join('\n')}

## Domains (${m.domains})
${scan.domains.map((d: any) => `- **${d.name}** — ${d.files} files${d.mainFile ? ` (${d.mainFile})` : ''}`).join('\n')}

## Packages (${m.packages})
${scan.packages.map((p: any) => `- **@vibestudio/${p.name}**${p.description ? ` — ${p.description}` : ''}`).join('\n')}
`
      },
      {
        slug: 'guide-architecture', title: 'Architecture Overview', icon: '🏗', position: 11,
        content: `# VibeStudio Architecture
> Auto-generated from live project scan — ${now}

## Layers
\`\`\`
┌─────────────────────────────────────────────┐
│  Platform Shells                             │
│  web (Next.js) · planned: desktop · mobile   │
├─────────────────────────────────────────────┤
│  Business Logic                              │
│  domains/dev-portal (services)               │
├─────────────────────────────────────────────┤
│  Core Infrastructure                         │
│  database · config · logging · utils         │
└─────────────────────────────────────────────┘
\`\`\`

## Auth & Access
- Single auth stack: \`dev_portal_token\` (httpOnly cookie + localStorage Bearer fallback for cross-port localhost).
- Roles: \`ceo\`, \`lead\`, \`product_owner\`, plus AI agent roles (\`agent_*\`).
- RLS on \`dev_*\` tables; direct DB scripts set \`app.current_member_id\` per transaction.

## Database
- **${m.dbTables}+ tables** (all prefixed \`dev_*\`) across ${m.migrations} migrations
- UUID primary keys, snake_case columns, JSONB for flexible data
- AES-256-GCM encryption for mobile-deploy credentials

## API Structure
- Base: /api/v1/dev-portal
- ${m.routeFiles} route file(s), ${m.totalEndpoints}+ endpoints
- Zod validation, CORS whitelist, rate limiting
- X-Request-Id tracing on all requests

## Design System
- Indigo palette (dev portal)
- Tailwind CSS with rounded-xl, text-xs/text-2xs density
- Dark mode by default — on the modernisation roadmap
`
      },
      {
        slug: 'guide-handbook', title: 'Product Handbook', icon: '📗', position: 12,
        content: `# VibeStudio Product Handbook
> Auto-generated from live project scan — ${now}
> For the product team using the studio

## What is VibeStudio?
A standalone **Vibe Code Prompt Studio** — project management, sprint board, AI prompt library, wiki, and activity feed for vibe-coding teams. The roadmap targets a standalone desktop (.exe) and mobile app, integrated with Claude subscriptions and AI provider APIs, focused on prompt engineering and context tooling for developers.

## Core Modules

### Plan & Track
- **Board** — Kanban (backlog → done)
- **Tasks** — full task model with the AI Prompt Builder
- **Sprints** — planning, capacity, burndown, retrospectives
- **Calendar / Gantt** — schedule + sprint timeline

### Collaborate
- **Team & Portfolio** — members, skills, allocation
- **Channels** — threaded chat
- **Inbox** — notifications
- **Wiki & Knowledge** — project docs (auto-syncable from a live scan)

### AI
- **Prompt Library** — reusable, shareable prompt templates
- **Agents** — AI agent registry (coding, QA, security, ops, analytics, release)
- **AI Chat** — multi-provider chat (Anthropic / OpenAI / DeepSeek / Moonshot / Groq)
- **Usage** — per-user AI usage + token metrics

### Ops
- **Deployments / Environments** — release pipeline + env config
- **Architecture / Project Explorer** — live project reference
- **Settings** — studio config + version history
`
      },
      {
        slug: 'guide-project-map', title: 'Project Map', icon: '📂', position: 13,
        content: `# VibeStudio Project Map
> Auto-generated from live project scan — ${now}

## Metrics
| Metric | Count |
|--------|-------|
| Route files | ${m.routeFiles} |
| API endpoints | ${m.totalEndpoints}+ |
| Migrations | ${m.migrations} |
| DB tables | ${m.dbTables}+ |
| Domains | ${m.domains} |
| Packages | ${m.packages} |
| Pages | ${m.pages} |
| TS/TSX files | ${m.tsFiles} |

## API Routes
${scan.routes.map((r: any) => `| ${r.name} | ${r.endpoints} endpoints | \`apps/api/src/routes/${r.file}\` |`).join('\n')}

## Domains (${m.domains})
${scan.domains.map((d: any) => `| ${d.name} | ${d.files} files | \`domains/${d.name}/src/${d.mainFile}\` |`).join('\n')}

## Packages (${m.packages})
${scan.packages.map((p: any) => `| @vibestudio/${p.name} | ${p.description || '—'} |`).join('\n')}

## Migrations (${m.migrations})
${scan.migrations.map((mi: any) => `| ${mi.number} | ${mi.name} |`).join('\n')}

## Pages (${m.pages})
${scan.pages.slice(0, 80).map((p: any) => `| [${p.path}](http://localhost:3100${p.path}) | \`${p.file}\` |`).join('\n')}
`
      },
    ];

    const created: any[] = [];
    const updated: any[] = [];

    for (const wp of wikiPages) {
      const existing = await db('dev_wiki_pages').where({ project_id: projectId, slug: wp.slug }).first();
      if (existing) {
        await db('dev_wiki_pages').where({ id: existing.id }).update({ title: wp.title, content: wp.content, icon: wp.icon, last_edited_by: authorId, updated_at: db.fn.now() });
        updated.push({ id: existing.id, title: wp.title });
      } else {
        const [page] = await db('dev_wiki_pages').insert({ project_id: projectId, title: wp.title, slug: wp.slug, content: wp.content, icon: wp.icon, position: wp.position, last_edited_by: authorId }).returning('*');
        created.push({ id: page.id, title: page.title });
      }
    }

    await devPortalService.logActivity(authorId, 'wiki_synced', 'wiki', projectId, `Synced ${created.length + updated.length} project wiki pages`, projectId);
    return { created: created.length, updated: updated.length, pages: [...created, ...updated] };
  },

  async generateDomainWikiPages(projectId: string, authorId: string) {
    const { db } = require('@vibestudio/database');
    const DOMAIN_KB: Record<string, { label: string; icon: string; category: string; tables: string[]; api: string; rules: string[]; affects: string[]; pages: string[]; service: string; overview: string }> = {
      board: { label: 'Board & Tasks', icon: '🗂', category: 'Plan & Track', tables: ['dev_tasks','dev_task_comments','dev_task_dependencies','dev_views'], api: '/api/v1/dev-portal/tasks, /api/v1/dev-portal/board', rules: ['Kanban columns: backlog → todo → in_progress → review → done','Task fields: type (feature/bug/migration/refactor), priority, story_points, assignee_id, labels','Position field orders cards within a column — keep contiguous on reorder','is_ai_generated flags work produced via the AI Prompt Builder','Comments + dependencies link back to the parent task for the activity trail'], affects: ['sprints','activity','prompts'], pages: ['/dev-portal/board','/dev-portal/tasks','/dev-portal/tasks/[id]','/dev-portal/my-tasks'], service: 'domains/dev-portal/src/dev-portal-service.ts', overview: 'The board is the heart of VibeStudio — a Kanban + task model with the AI Prompt Builder living on the task detail page. Tasks feed sprints, the activity log, and prompt history.' },
      sprints: { label: 'Sprints', icon: '🏃', category: 'Plan & Track', tables: ['dev_sprints'], api: '/api/v1/dev-portal/sprints', rules: ['Status lifecycle: planned → active → completed','capacity_points vs completed_points drive the burndown','Only one active sprint per project at a time','retrospective stored as JSONB','Tasks reference sprint_id; burndown sums story_points by completed_at'], affects: ['board','activity'], pages: ['/dev-portal/sprints','/dev-portal/gantt','/dev-portal/calendar'], service: 'domains/dev-portal/src/dev-portal-service.ts', overview: 'Sprint planning and tracking — capacity, burndown, and retrospectives per project. Pulls tasks from the board and surfaces them on the calendar and Gantt timeline.' },
      prompts: { label: 'Prompt Library', icon: '✨', category: 'AI', tables: ['dev_prompt_history'], api: '/api/v1/dev-portal/prompts', rules: ['Every AI call logs to dev_prompt_history (template, prompt, response_summary, model, tokens, duration)','is_shared exposes a prompt to the team; expires_at allows TTL','is_pii_redacted must be set before sharing externally','Attribution via actor_email + ai_origin + provider','Roadmap: version-controlled prompts/<slug>.md with frontmatter (author, model, version, tags)'], affects: ['ai-chat','board','usage'], pages: ['/dev-portal/prompts'], service: 'domains/dev-portal/src/dev-portal-service.ts', overview: 'The prompt library stores, shares, and attributes reusable prompt templates. It is the core product surface — the roadmap moves it to git-backed Markdown with per-model A/B testing.' },
      'ai-chat': { label: 'AI Chat', icon: '💬', category: 'AI', tables: ['dev_prompt_history'], api: '/api/v1/dev-portal/ai', rules: ['Multi-provider: Anthropic / OpenAI / DeepSeek / Moonshot / Groq','Returns 503 if no provider key is set (V5) — always check process.env.<PROVIDER>_API_KEY','Every exchange logged to dev_prompt_history for usage metrics','Prefer the latest Claude models when building AI features','Provider selection + token/cost/latency captured per call'], affects: ['prompts','usage','agents'], pages: ['/dev-portal/ai'], service: 'domains/dev-portal/src/ai-provider-service.ts', overview: 'Multi-provider AI chat. Any one provider key enables the feature. The roadmap deepens Claude-subscription integration and per-model A/B comparison.' },
      agents: { label: 'AI Agents', icon: '🤖', category: 'AI', tables: ['dev_team_members'], api: '/api/v1/dev-portal/agents', rules: ['Agents are dev_team_members with is_ai_agent = true and an agent_type','Seeded agent types: coding, QA, security, ops, analytics, release','Agent roles use the agent_* role namespace','Agents can be assigned tasks and appear in the activity feed','Do not mix agent roles into the human role set (ceo/lead/product_owner)'], affects: ['board','ai-chat'], pages: ['/dev-portal/agents'], service: 'domains/dev-portal/src/dev-portal-service.ts', overview: 'Registry of AI agents that participate in the workflow as first-class members — assignable to tasks and tracked in the activity log alongside humans.' },
      channels: { label: 'Channels & Inbox', icon: '#️⃣', category: 'Collaborate', tables: ['dev_channels','dev_channel_members','dev_messages','dev_inbox'], api: '/api/v1/dev-portal/channels', rules: ['Threaded chat via reply_to_id on dev_messages','last_read_at per member drives unread counts','is_default channel everyone joins automatically','Inbox notifications are per-member with is_read + target_* pointers','Roadmap: SSE for live activity + messages instead of polling'], affects: ['activity'], pages: ['/dev-portal/channels','/dev-portal/channels/[id]','/dev-portal/inbox'], service: 'domains/dev-portal/src/dev-portal-service.ts', overview: 'Team communication — threaded channels plus a per-member notification inbox. Currently polled; the roadmap moves it to server-sent events.' },
      wiki: { label: 'Wiki & Docs', icon: '📚', category: 'Collaborate', tables: ['dev_wiki_pages','dev_docs','dev_spaces','dev_lists','dev_favorites'], api: '/api/v1/dev-portal/wiki, /api/v1/dev-portal/docs', rules: ['Wiki pages support parent_id hierarchy + markdown content','generateProjectWikiPages() auto-syncs guide pages from a live project scan','dev_docs live inside dev_spaces and can be pinned','dev_favorites point at any entity for quick access','Deleting a wiki page re-parents its children to null'], affects: ['knowledge'], pages: ['/dev-portal/wiki','/dev-portal/knowledge','/dev-portal/guide'], service: 'domains/dev-portal/src/dev-portal-service.ts', overview: 'Project knowledge base — hierarchical wiki + spaces/docs. Guide pages can be auto-generated from a live scan of the codebase so onboarding stays current.' },
      activity: { label: 'Activity Feed', icon: '📡', category: 'Collaborate', tables: ['dev_activity_log','dev_bookmarks'], api: '/api/v1/dev-portal/activity', rules: ['logActivity(actor, action, entity_type, entity_id, summary, project_id) on every mutation','Single append-only table for all event types (roadmap: event-sourced log)','Drives the home dashboard feed + per-entity history','Polled every 30s today; roadmap moves to SSE','Bookmarks are per-member shortcuts to URLs/entities'], affects: ['board','sprints','channels'], pages: ['/dev-portal','/dev-portal/portfolio'], service: 'domains/dev-portal/src/dev-portal-service.ts', overview: 'A unified activity stream recording every meaningful action across the studio, feeding the dashboard and entity-level history.' },
      deployments: { label: 'Deployments & Mobile', icon: '🚀', category: 'Ops', tables: ['dev_mobile_credentials','dev_mobile_builds','dev_mobile_ota_updates','dev_sessions'], api: '/api/v1/dev-portal/deployments', rules: ['Mobile credentials encrypted with AES-256-GCM (iv + auth_tag); key from MOBILE_DEPLOY_KEY (falls back to JWT_SECRET)','EAS Build records track platform/profile/status/artifact_url','EAS Update (OTA) records track channel/runtime_version/status','dev_sessions enable token revocation (token_hash, is_active, revoked_reason)','Production targets vibestudio.codes-ai.uk on the IONOS VM (/srv/vibestudio)'], affects: ['activity'], pages: ['/dev-portal/deployments','/dev-portal/environments'], service: 'domains/dev-portal/src/mobile-deploy-service.ts', overview: 'Release + environment management, including encrypted mobile deploy credentials and EAS build/OTA tracking. The roadmap elevates a standalone desktop (.exe) and mobile app as primary shells.' },
    };

    const created: any[] = [];
    const existing = await db('dev_wiki_pages').where({ project_id: projectId }).select('slug');
    const existingSlugs = new Set(existing.map((e: any) => e.slug));

    // Create category parent pages
    const categories = [...new Set(Object.values(DOMAIN_KB).map(d => d.category))];
    const categoryPages: Record<string, string> = {};
    let pos = 100;
    for (const cat of categories) {
      const catSlug = 'cat-' + cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (!existingSlugs.has(catSlug)) {
        const catIcons: Record<string, string> = { 'Plan & Track': '🗂', 'Collaborate': '🤝', 'AI': '🤖', 'Ops': '🚀' };
        const [page] = await db('dev_wiki_pages').insert({ project_id: projectId, title: cat, slug: catSlug, content: `# ${cat}\n\nModule documentation for the ${cat} area of VibeStudio.`, icon: catIcons[cat] || '📂', position: pos++, last_edited_by: authorId }).returning('*');
        categoryPages[cat] = page.id;
        created.push(page);
        existingSlugs.add(catSlug);
      } else {
        const existing = await db('dev_wiki_pages').where({ project_id: projectId, slug: catSlug }).first();
        if (existing) categoryPages[cat] = existing.id;
      }
    }

    // Create domain pages
    for (const [key, d] of Object.entries(DOMAIN_KB)) {
      const slug = 'domain-' + key;
      if (existingSlugs.has(slug)) continue;

      const affectedList = d.affects.map(a => DOMAIN_KB[a] ? `- **${DOMAIN_KB[a].label}** — \`${a}\`` : `- ${a}`).join('\n');
      const content = `# ${d.label}

${d.overview}

---

## Service Location
\`${d.service}\`

## API Endpoints
\`${d.api}\`

## Database Tables
${d.tables.map(t => `- \`${t}\``).join('\n')}

## Business Rules
${d.rules.map(r => `- ${r}`).join('\n')}

## Pages
${d.pages.length > 0 ? d.pages.map(p => `- [${p}](http://localhost:3100${p})`).join('\n') : '- No dedicated pages'}

## Cross-Module Impact
Changes to ${d.label} may affect:
${affectedList || '- No direct dependencies'}

## Access & Security
- Auth via the \`dev_portal_token\` stack (httpOnly cookie + Bearer fallback).
- RLS on \`dev_*\` tables; direct DB scripts must \`SET LOCAL app.current_member_id\`.
- Mutations are recorded via \`logActivity()\` into \`dev_activity_log\`.
`;

      const parentId = categoryPages[d.category] || null;
      const [page] = await db('dev_wiki_pages').insert({ project_id: projectId, parent_id: parentId, title: d.label, slug, content, icon: d.icon, position: pos++, last_edited_by: authorId }).returning('*');
      created.push(page);
      existingSlugs.add(slug);
    }

    await devPortalService.logActivity(authorId, 'wiki_generated', 'wiki', projectId, `Generated ${created.length} domain wiki pages`, projectId);
    return { created: created.length, pages: created.map(p => ({ id: p.id, title: p.title, slug: p.slug })) };
  },

  async deleteWikiPage(pageId: string, actorId: string) {
    const { db } = require('@vibestudio/database');
    const page = await db('dev_wiki_pages').where({ id: pageId }).first();
    if (!page) throw new Error('Wiki page not found');
    // Unlink children — set their parent_id to null
    await db('dev_wiki_pages').where({ parent_id: pageId }).update({ parent_id: null });
    await db('dev_wiki_pages').where({ id: pageId }).delete();
    await devPortalService.logActivity(actorId, 'wiki_deleted', 'wiki', pageId, page.title, page.project_id);
    return { deleted: true };
  },

  // ── Dashboard Stats ──
  async getDashboardStats(projectId: string) {
    const { db } = require('@vibestudio/database');
    const tasks = await db('dev_tasks').where('project_id', projectId);
    const members = await db('dev_team_members').where('status', 'active');
    const activeSprint = await db('dev_sprints').where({ project_id: projectId, status: 'active' }).first();
    const { items: recentActivity } = await devPortalService.getActivity(projectId, 20);

    const statusCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    let totalPoints = 0, completedPoints = 0;

    for (const t of tasks) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
      typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
      if (t.story_points) { totalPoints += t.story_points; if (t.status === 'done') completedPoints += t.story_points; }
    }

    return {
      totalTasks: tasks.length,
      statusCounts,
      priorityCounts,
      typeCounts,
      totalPoints,
      completedPoints,
      velocity: completedPoints,
      teamSize: members.filter(m => !m.is_ai_agent).length,
      aiAgents: members.filter(m => m.is_ai_agent).length,
      activeSprint,
      recentActivity,
    };
  },

  // ── Team Workload & Management ──
  async getMember(memberId: string) {
    const { db } = require('@vibestudio/database');
    const member = await db('dev_team_members').where({ id: memberId }).first();
    if (!member) return null;
    const { password_hash, ...safe } = member;
    return safe;
  },

  async updateMember(memberId: string, data: any) {
    const { db } = require('@vibestudio/database');
    const updates: any = { ...data, updated_at: db.fn.now() };
    if (data.skills && Array.isArray(data.skills)) updates.skills = JSON.stringify(data.skills);
    if (data.preferences && typeof data.preferences === 'object') updates.preferences = JSON.stringify(data.preferences);
    delete updates.id; delete updates.email; delete updates.password_hash; delete updates.created_at;
    await db('dev_team_members').where({ id: memberId }).update(updates);
    const member = await db('dev_team_members').where({ id: memberId }).first();
    if (!member) return null;
    const { password_hash, ...safe } = member;
    return safe;
  },

  async getMemberWorkload(memberId: string) {
    const { db } = require('@vibestudio/database');
    const member = await db('dev_team_members').where({ id: memberId }).first();
    if (!member) return null;
    const { password_hash, ...safeMember } = member;

    // All tasks assigned to this member
    const tasks = await db('dev_tasks')
      .leftJoin('dev_sprints', 'dev_tasks.sprint_id', 'dev_sprints.id')
      .where('dev_tasks.assignee_id', memberId)
      .select('dev_tasks.*', 'dev_sprints.name as sprint_name', 'dev_sprints.status as sprint_status');

    // Aggregate stats
    let totalTasks = 0, doneTasks = 0, inProgressTasks = 0;
    let totalPoints = 0, donePoints = 0;
    let totalHoursEstimated = 0, totalHoursSpent = 0;
    let overdueTasks = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const t of tasks) {
      totalTasks++;
      if (t.status === 'done') { doneTasks++; donePoints += t.story_points || 0; }
      if (t.status === 'in_progress') inProgressTasks++;
      totalPoints += t.story_points || 0;
      totalHoursEstimated += t.time_estimate || 0;
      totalHoursSpent += t.time_spent || 0;
      if (t.due_date && t.due_date < today && t.status !== 'done') overdueTasks++;
    }

    // Active sprint tasks only
    const sprintTasks = tasks.filter(t => t.sprint_status === 'active');
    const sprintPoints = sprintTasks.reduce((s, t) => s + (t.story_points || 0), 0);
    const sprintDonePoints = sprintTasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.story_points || 0), 0);
    const sprintHoursEst = sprintTasks.reduce((s, t) => s + (t.time_estimate || 0), 0);
    const sprintHoursSpent = sprintTasks.reduce((s, t) => s + (t.time_spent || 0), 0);

    // Recent activity by this member
    const activity = await db('dev_activity_log')
      .where('actor_id', memberId)
      .orderBy('created_at', 'desc')
      .limit(20);

    // Tasks list (active — not done)
    const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
      .sort((a, b) => {
        const pr: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (pr[a.priority] ?? 2) - (pr[b.priority] ?? 2);
      });

    const completedTasks = tasks.filter(t => t.status === 'done')
      .sort((a, b) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime())
      .slice(0, 10);

    return {
      member: safeMember,
      stats: {
        totalTasks, doneTasks, inProgressTasks, overdueTasks,
        totalPoints, donePoints,
        totalHoursEstimated, totalHoursSpent,
        completionRate: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      },
      sprint: {
        points: sprintPoints, donePoints: sprintDonePoints,
        hoursEstimated: sprintHoursEst, hoursSpent: sprintHoursSpent,
        taskCount: sprintTasks.length,
        doneTasks: sprintTasks.filter(t => t.status === 'done').length,
      },
      activeTasks,
      completedTasks,
      activity,
    };
  },

  async getTeamWorkloadSummary() {
    const { db } = require('@vibestudio/database');
    const members = await db('dev_team_members').where({ status: 'active' })
      .select('id', 'name', 'display_name', 'role', 'title', 'department', 'is_ai_agent', 'skills', 'last_active_at');

    // Get active sprint
    const project = await db('dev_projects').first();
    const activeSprint = project ? await db('dev_sprints').where({ project_id: project.id, status: 'active' }).first() : null;

    // Get all tasks with assignees
    const allTasks = await db('dev_tasks').select('id', 'assignee_id', 'status', 'priority', 'story_points', 'time_estimate', 'time_spent', 'sprint_id', 'due_date', 'type');
    const today = new Date().toISOString().split('T')[0];

    const result = members.map((m: any) => {
      const myTasks = allTasks.filter((t: any) => t.assignee_id === m.id);
      const sprintTasks = activeSprint ? myTasks.filter((t: any) => t.sprint_id === activeSprint.id) : [];
      const active = myTasks.filter((t: any) => t.status !== 'done' && t.status !== 'cancelled');
      const done = myTasks.filter((t: any) => t.status === 'done');
      const overdue = active.filter((t: any) => t.due_date && t.due_date < today);
      const skills = (() => { try { return typeof m.skills === 'string' ? JSON.parse(m.skills || '[]') : (m.skills || []); } catch { return []; } })();

      return {
        id: m.id,
        name: m.name,
        display_name: m.display_name,
        role: m.role,
        title: m.title,
        department: m.department,
        is_ai_agent: m.is_ai_agent,
        skills,
        last_active_at: m.last_active_at,
        workload: {
          total: myTasks.length,
          active: active.length,
          done: done.length,
          overdue: overdue.length,
          inProgress: myTasks.filter((t: any) => t.status === 'in_progress').length,
          points: myTasks.reduce((s: number, t: any) => s + (t.story_points || 0), 0),
          donePoints: done.reduce((s: number, t: any) => s + (t.story_points || 0), 0),
          hoursEstimated: myTasks.reduce((s: number, t: any) => s + (t.time_estimate || 0), 0),
          hoursSpent: myTasks.reduce((s: number, t: any) => s + (t.time_spent || 0), 0),
        },
        sprint: activeSprint ? {
          tasks: sprintTasks.length,
          done: sprintTasks.filter((t: any) => t.status === 'done').length,
          points: sprintTasks.reduce((s: number, t: any) => s + (t.story_points || 0), 0),
          donePoints: sprintTasks.filter((t: any) => t.status === 'done').reduce((s: number, t: any) => s + (t.story_points || 0), 0),
        } : null,
      };
    });

    return { members: result, activeSprint };
  },

  async getMemberActivity(memberId: string, limit = 30) {
    const { db } = require('@vibestudio/database');
    return db('dev_activity_log')
      .where('actor_id', memberId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  },

  // ── Live Project Scanner ──
  async scanProject() {
    const fs = require('fs');
    const path = require('path');
    const root = process.cwd();

    const safeGlob = (dir: string, ext: string): string[] => {
      const results: string[] = [];
      const walk = (d: string) => {
        try {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === '.next') continue;
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full);
            else if (e.name.endsWith(ext)) results.push(full);
          }
        } catch {}
      };
      walk(dir);
      return results;
    };

    // Routes
    const routeDir = path.join(root, 'apps', 'api', 'src', 'routes');
    const routeFiles = fs.existsSync(routeDir) ? fs.readdirSync(routeDir).filter((f: string) => f.endsWith('.ts')) : [];
    const routes = routeFiles.map((f: string) => {
      const content = fs.readFileSync(path.join(routeDir, f), 'utf-8');
      const endpoints = (content.match(/router\.(get|post|put|delete|patch)\s*\(/gi) || []).length;
      return { file: f, name: f.replace('.ts', ''), endpoints };
    });
    const totalEndpoints = routes.reduce((s: number, r: any) => s + r.endpoints, 0);

    // Migrations
    const migDir = path.join(root, 'infrastructure', 'migrations');
    const migFiles = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f: string) => f.endsWith('.js')).sort() : [];
    const migrations = migFiles.map((f: string) => {
      const num = f.match(/^(\d+)/)?.[1] || '';
      const name = f.replace(/^\d+_/, '').replace('.js', '').replace(/_/g, ' ');
      return { number: num, name, file: f };
    });

    // Domains
    const domDir = path.join(root, 'domains');
    const domains = fs.existsSync(domDir) ? fs.readdirSync(domDir, { withFileTypes: true }).filter((d: any) => d.isDirectory()).map((d: any) => {
      const srcDir = path.join(domDir, d.name, 'src');
      const files = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f: string) => f.endsWith('.ts')) : [];
      return { name: d.name, files: files.length, mainFile: files.find((f: string) => f.includes('service')) || files[0] || '' };
    }) : [];

    // Packages
    const pkgDir = path.join(root, 'packages');
    const packages = fs.existsSync(pkgDir) ? fs.readdirSync(pkgDir, { withFileTypes: true }).filter((d: any) => d.isDirectory()).map((d: any) => {
      const pkgJson = path.join(pkgDir, d.name, 'package.json');
      let desc = '';
      try { desc = JSON.parse(fs.readFileSync(pkgJson, 'utf-8')).description || ''; } catch {}
      return { name: d.name, description: desc };
    }) : [];

    // Pages (Next.js)
    const pagesDir = path.join(root, 'apps', 'web', 'src', 'pages');
    const pageFiles = safeGlob(pagesDir, '.tsx').filter(f => !f.includes('_app') && !f.includes('_document') && !f.includes('404'));
    const pages = pageFiles.map(f => {
      const rel = path.relative(pagesDir, f).replace(/\\/g, '/').replace('.tsx', '').replace('/index', '');
      return { path: '/' + rel, file: path.relative(root, f).replace(/\\/g, '/') };
    });

    // TS/TSX file counts
    const tsFiles = safeGlob(root, '.ts').length + safeGlob(root, '.tsx').length;

    // DB tables (from migrations — count CREATE TABLE)
    let tableCount = 0;
    for (const mig of migFiles) {
      try {
        const content = fs.readFileSync(path.join(migDir, mig), 'utf-8');
        tableCount += (content.match(/createTable\s*\(/g) || []).length;
      } catch {}
    }

    return {
      scannedAt: new Date().toISOString(),
      metrics: {
        routeFiles: routeFiles.length,
        totalEndpoints,
        migrations: migFiles.length,
        domains: domains.length,
        packages: packages.length,
        pages: pageFiles.length,
        tsFiles,
        dbTables: tableCount,
      },
      routes,
      migrations,
      domains,
      packages,
      pages,
    };
  },

  // ── Spaces ──
  async listSpaces() {
    const { db } = require('@vibestudio/database');
    const spaces = await db('dev_spaces').orderBy('position');
    for (const s of spaces) {
      const lists = await db('dev_lists').where('space_id', s.id).orderBy('position');
      for (const l of lists) {
        const counts = await db('dev_tasks').where('list_id', l.id)
          .select(db.raw("count(*) as total, count(*) filter (where status = 'done') as done"));
        l.task_count = parseInt(counts[0]?.total || '0');
        l.done_count = parseInt(counts[0]?.done || '0');
      }
      s.lists = lists;
    }
    return spaces;
  },

  async createSpace(data: any, ownerId: string) {
    const { db } = require('@vibestudio/database');
    const maxPos = await db('dev_spaces').max('position as max').first();
    const [space] = await db('dev_spaces').insert({
      name: data.name, icon: data.icon || '📁', color: data.color || '#3b82f6',
      description: data.description, owner_id: ownerId, position: (maxPos?.max || 0) + 1,
    }).returning('*');
    return space;
  },

  async updateSpace(spaceId: string, data: any) {
    const { db } = require('@vibestudio/database');
    await db('dev_spaces').where({ id: spaceId }).update({ ...data, updated_at: db.fn.now() });
    return db('dev_spaces').where({ id: spaceId }).first();
  },

  // ── Lists ──
  async listsBySpace(spaceId: string) {
    const { db } = require('@vibestudio/database');
    const lists = await db('dev_lists').where('space_id', spaceId).orderBy('position');
    for (const l of lists) {
      const counts = await db('dev_tasks').where('list_id', l.id)
        .select(db.raw("count(*) as total, count(*) filter (where status = 'done') as done"));
      l.task_count = parseInt(counts[0]?.total || '0');
      l.done_count = parseInt(counts[0]?.done || '0');
    }
    return lists;
  },

  async createList(spaceId: string, data: any) {
    const { db } = require('@vibestudio/database');
    const maxPos = await db('dev_lists').where('space_id', spaceId).max('position as max').first();
    const [list] = await db('dev_lists').insert({
      space_id: spaceId, name: data.name, icon: data.icon || '📋',
      color: data.color, position: (maxPos?.max || 0) + 1,
    }).returning('*');
    return list;
  },

  async updateList(listId: string, data: any) {
    const { db } = require('@vibestudio/database');
    await db('dev_lists').where({ id: listId }).update({ ...data, updated_at: db.fn.now() });
    return db('dev_lists').where({ id: listId }).first();
  },

  // ── Docs ──
  async listDocs(spaceId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_docs').where({ space_id: spaceId }).orderBy('position').orderBy('title');
  },

  async getDoc(docId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_docs')
      .leftJoin('dev_team_members as author', 'dev_docs.created_by', 'author.id')
      .leftJoin('dev_team_members as editor', 'dev_docs.last_edited_by', 'editor.id')
      .where('dev_docs.id', docId)
      .select('dev_docs.*', 'author.name as author_name', 'editor.name as editor_name')
      .first();
  },

  async createDoc(spaceId: string, data: any, authorId: string) {
    const { db } = require('@vibestudio/database');
    const [doc] = await db('dev_docs').insert({
      space_id: spaceId, parent_id: data.parent_id || null,
      title: data.title, content: data.content || '',
      icon: data.icon || '📄', created_by: authorId, last_edited_by: authorId,
    }).returning('*');
    return doc;
  },

  async updateDoc(docId: string, data: any, editorId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_docs').where({ id: docId }).update({
      title: data.title, content: data.content, icon: data.icon,
      last_edited_by: editorId, updated_at: db.fn.now(),
    });
    return db('dev_docs').where({ id: docId }).first();
  },

  // ── Channels & Messages ──
  async listChannels(memberId: string) {
    const { db } = require('@vibestudio/database');
    const channels = await db('dev_channels')
      .leftJoin('dev_channel_members', function() { this.on('dev_channels.id', 'dev_channel_members.channel_id').andOn('dev_channel_members.member_id', db.raw('?', [memberId])); })
      .whereNotNull('dev_channel_members.id')
      .select('dev_channels.*', 'dev_channel_members.last_read_at')
      .orderBy('dev_channels.name');
    for (const ch of channels) {
      const unread = await db('dev_messages').where('channel_id', ch.id)
        .where('created_at', '>', ch.last_read_at || '1970-01-01').count('id as cnt').first();
      ch.unread_count = parseInt(unread?.cnt || '0');
      const lastMsg = await db('dev_messages').where('channel_id', ch.id).orderBy('created_at', 'desc').first();
      ch.last_message = lastMsg || null;
    }
    return channels;
  },

  async createChannel(data: any, creatorId: string) {
    const { db } = require('@vibestudio/database');
    const [ch] = await db('dev_channels').insert({ name: data.name, description: data.description, type: data.type || 'channel', icon: data.icon || '#', created_by: creatorId }).returning('*');
    await db('dev_channel_members').insert({ channel_id: ch.id, member_id: creatorId, role: 'admin' });
    return ch;
  },

  async getChannelMessages(channelId: string, limit = 50, before?: string) {
    const { db } = require('@vibestudio/database');
    let query = db('dev_messages')
      .leftJoin('dev_team_members', 'dev_messages.author_id', 'dev_team_members.id')
      .where('dev_messages.channel_id', channelId)
      .select('dev_messages.*', 'dev_team_members.name as author_name', 'dev_team_members.display_name as author_display_name', 'dev_team_members.is_ai_agent as author_is_ai', 'dev_team_members.role as author_role')
      .orderBy('dev_messages.created_at', 'desc')
      .limit(limit);
    if (before) query = query.where('dev_messages.created_at', '<', before);
    const msgs = await query;
    return msgs.reverse();
  },

  async sendMessage(channelId: string, authorId: string, content: string, type = 'text', replyToId?: string) {
    const { db } = require('@vibestudio/database');
    const [msg] = await db('dev_messages').insert({
      channel_id: channelId, author_id: authorId, content, type, reply_to_id: replyToId || null,
    }).returning('*');
    return msg;
  },

  async markChannelRead(channelId: string, memberId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_channel_members').where({ channel_id: channelId, member_id: memberId }).update({ last_read_at: db.fn.now() });
  },

  // ── Inbox ──
  async getInbox(memberId: string, filters?: { is_read?: string | boolean; cursor?: string; limit?: string | number }) {
    const { db } = require('@vibestudio/database');
    const pageSize = Math.min(Math.max(1, Number(filters?.limit) || 50), 100);
    let query = db('dev_inbox')
      .leftJoin('dev_team_members', 'dev_inbox.actor_id', 'dev_team_members.id')
      .where('dev_inbox.member_id', memberId)
      .where('dev_inbox.is_archived', false)
      .select('dev_inbox.*', 'dev_team_members.name as actor_name', 'dev_team_members.display_name as actor_display_name', 'dev_team_members.is_ai_agent as actor_is_ai')
      .orderBy('dev_inbox.created_at', 'desc')
      .orderBy('dev_inbox.id', 'desc')
      .limit(pageSize + 1);
    if (filters?.is_read !== undefined && filters.is_read !== '') {
      query = query.where('dev_inbox.is_read', String(filters.is_read) === 'true');
    }
    if (filters?.cursor) {
      try {
        const { created_at, id } = JSON.parse(Buffer.from(String(filters.cursor), 'base64').toString('utf8'));
        query = query.where(function (this: any) {
          this.where('dev_inbox.created_at', '<', created_at)
            .orWhere(function (this: any) {
              this.where('dev_inbox.created_at', '=', created_at)
                .andWhere('dev_inbox.id', '<', id);
            });
        });
      } catch { /* ignore invalid cursor */ }
    }
    const rows = await query;
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ created_at: items[items.length - 1].created_at, id: items[items.length - 1].id })).toString('base64')
      : null;
    return { items, next_cursor: nextCursor, has_more: hasMore };
  },

  async markInboxRead(memberId: string, inboxId?: string) {
    const { db } = require('@vibestudio/database');
    if (inboxId) {
      await db('dev_inbox').where({ id: inboxId, member_id: memberId }).update({ is_read: true });
    } else {
      await db('dev_inbox').where({ member_id: memberId, is_read: false }).update({ is_read: true });
    }
  },

  async createInboxEntry(memberId: string, type: string, title: string, body: string, sourceType: string, sourceId: string, actorId: string) {
    const { db } = require('@vibestudio/database');
    if (memberId === actorId) return;
    await db('dev_inbox').insert({ member_id: memberId, type, title, body, source_type: sourceType, source_id: sourceId, actor_id: actorId });
  },

  async getInboxCount(memberId: string) {
    const { db } = require('@vibestudio/database');
    const result = await db('dev_inbox').where({ member_id: memberId, is_read: false, is_archived: false }).count('id as cnt').first();
    return parseInt(result?.cnt || '0');
  },

  // ── Favorites ──
  async getFavorites(memberId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_favorites').where({ member_id: memberId }).orderBy('position');
  },

  async addFavorite(memberId: string, targetType: string, targetId: string, targetName: string) {
    const { db } = require('@vibestudio/database');
    const maxPos = await db('dev_favorites').where({ member_id: memberId }).max('position as max').first();
    const [fav] = await db('dev_favorites').insert({ member_id: memberId, target_type: targetType, target_id: targetId, target_name: targetName, position: (maxPos?.max || 0) + 1 }).returning('*');
    return fav;
  },

  async removeFavorite(favoriteId: string, memberId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_favorites').where({ id: favoriteId, member_id: memberId }).delete();
  },

  // ── Bookmarks ──
  async getBookmarks(memberId: string, spaceId?: string) {
    const { db } = require('@vibestudio/database');
    let query = db('dev_bookmarks').where({ member_id: memberId }).orderBy('position');
    if (spaceId) query = query.where('space_id', spaceId);
    return query;
  },

  async addBookmark(memberId: string, data: any) {
    const { db } = require('@vibestudio/database');
    const [bm] = await db('dev_bookmarks').insert({ member_id: memberId, space_id: data.space_id || null, title: data.title, url: data.url, icon: data.icon || '🔗' }).returning('*');
    return bm;
  },

  async removeBookmark(bookmarkId: string, memberId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_bookmarks').where({ id: bookmarkId, member_id: memberId }).delete();
  },

  // ── Global Search ──
  async search(query: string, memberId: string) {
    const { db } = require('@vibestudio/database');
    const q = `%${query}%`;
    const tasks = await db('dev_tasks').whereILike('title', q).orWhereILike('task_key', q).select('id', 'task_key', 'title', 'status', 'type').limit(10);
    const docs = await db('dev_docs').whereILike('title', q).select('id', 'title', 'icon').limit(5);
    const members = await db('dev_team_members').whereILike('name', q).orWhereILike('email', q).select('id', 'name', 'display_name', 'role', 'is_ai_agent').limit(5);
    return { tasks, docs, members };
  },

  // ── Prompt History ──
  async listPrompts(projectId: string, filters?: { author_id?: string; task_id?: string; status?: string; template?: string; limit?: number }) {
    const { db } = require('@vibestudio/database');
    let query = db('dev_prompt_history')
      .leftJoin('dev_team_members', 'dev_prompt_history.author_id', 'dev_team_members.id')
      .leftJoin('dev_tasks', 'dev_prompt_history.task_id', 'dev_tasks.id')
      .where('dev_prompt_history.project_id', projectId)
      .select(
        'dev_prompt_history.*',
        'dev_team_members.name as author_name',
        'dev_team_members.display_name as author_display_name',
        'dev_team_members.role as author_role',
        'dev_team_members.is_ai_agent as author_is_ai',
        'dev_tasks.task_key',
        'dev_tasks.title as task_title',
      )
      .orderBy('dev_prompt_history.created_at', 'desc');
    if (filters?.author_id) query = query.where('dev_prompt_history.author_id', filters.author_id);
    if (filters?.task_id) query = query.where('dev_prompt_history.task_id', filters.task_id);
    if (filters?.status) query = query.where('dev_prompt_history.status', filters.status);
    if (filters?.template) query = query.where('dev_prompt_history.template', filters.template);
    return query.limit(filters?.limit || 100);
  },

  async getPrompt(promptId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_prompt_history')
      .leftJoin('dev_team_members', 'dev_prompt_history.author_id', 'dev_team_members.id')
      .leftJoin('dev_tasks', 'dev_prompt_history.task_id', 'dev_tasks.id')
      .where('dev_prompt_history.id', promptId)
      .select('dev_prompt_history.*', 'dev_team_members.name as author_name', 'dev_team_members.display_name as author_display_name', 'dev_team_members.role as author_role', 'dev_tasks.task_key', 'dev_tasks.title as task_title')
      .first();
  },

  async createPrompt(projectId: string, authorId: string, data: any, deviceInfo: any) {
    const { db } = require('@vibestudio/database');
    // Pull the author's email so the per-user usage page can join across
    // dev-portal callers and main-app callers in one query.
    const author = await db('dev_team_members').where({ id: authorId }).first('email', 'role').catch(() => null);
    const [prompt] = await db('dev_prompt_history').insert({
      project_id: projectId,
      author_id: authorId,
      task_id: data.task_id || null,
      template: data.template || 'custom',
      title: data.title || 'Untitled Prompt',
      prompt: data.prompt,
      response_summary: data.response_summary || null,
      model: data.model || 'claude-opus-4-8',
      provider: data.provider || null,
      ai_origin: data.ai_origin || 'dev_portal_chat',
      status: data.status || 'sent',
      prompt_tokens: data.prompt_tokens || 0,
      response_tokens: data.response_tokens || 0,
      cache_read_tokens: data.cache_read_tokens || 0,
      cache_write_tokens: data.cache_write_tokens || 0,
      duration_seconds: data.duration_seconds || 0,
      labels: JSON.stringify(data.labels || []),
      metadata: JSON.stringify(data.metadata || {}),
      // Device info
      device_name: deviceInfo.device_name || null,
      device_type: deviceInfo.device_type || 'desktop',
      os: deviceInfo.os || null,
      browser: deviceInfo.browser || null,
      ip_address: deviceInfo.ip_address || null,
      hostname: deviceInfo.hostname || null,
      // Actor denormalisation — keeps the usage page joinless.
      actor_email: author?.email || null,
      actor_role: author?.role || null,
      completed_at: data.status === 'completed' ? new Date() : null,
    }).returning('*');
    await devPortalService.logActivity(authorId, 'prompt_sent', 'prompt', prompt.id, data.title || 'Prompt', projectId, { template: data.template, task_id: data.task_id });
    return prompt;
  },

  async updatePrompt(promptId: string, data: any) {
    const { db } = require('@vibestudio/database');
    const updates: any = { ...data };
    if (data.labels) updates.labels = JSON.stringify(data.labels);
    if (data.metadata) updates.metadata = JSON.stringify(data.metadata);
    if (data.status === 'completed' && !data.completed_at) updates.completed_at = db.fn.now();
    delete updates.id; delete updates.project_id; delete updates.author_id; delete updates.created_at;
    await db('dev_prompt_history').where({ id: promptId }).update(updates);
    return db('dev_prompt_history').where({ id: promptId }).first();
  },

  async deletePrompt(promptId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_prompt_history').where({ id: promptId }).delete();
  },

  // ── A5: PII / secret redaction ──
  // Pattern-based redaction of secrets before a prompt is shared. Rules run in
  // order (most-specific first). Pure function — no DB.
  _redactText(input: string): { redacted: string; findings: { type: string; count: number }[] } {
    let text = String(input || '');
    const RULES: { type: string; re: RegExp; repl: string }[] = [
      { type: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, repl: '[REDACTED_PRIVATE_KEY]' },
      { type: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g, repl: '[REDACTED_AWS_KEY]' },
      { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, repl: '[REDACTED_JWT]' },
      { type: 'github_token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, repl: '[REDACTED_GITHUB_TOKEN]' },
      { type: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, repl: '[REDACTED_SLACK_TOKEN]' },
      { type: 'google_api_key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, repl: '[REDACTED_GOOGLE_KEY]' },
      { type: 'api_key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g, repl: '[REDACTED_API_KEY]' },
      { type: 'bearer_token', re: /\bBearer\s+[A-Za-z0-9._-]{10,}/g, repl: 'Bearer [REDACTED_TOKEN]' },
      { type: 'secret_assignment', re: /\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY))\b(\s*[:=]\s*)(['"]?)[^\s'"]{4,}\3/gi, repl: '$1$2[REDACTED]' },
      { type: 'credit_card', re: /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}\b/g, repl: '[REDACTED_CC]' },
      { type: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, repl: '[REDACTED_EMAIL]' },
      { type: 'ipv4', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, repl: '[REDACTED_IP]' },
    ];
    const findings: { type: string; count: number }[] = [];
    for (const r of RULES) {
      const count = (text.match(r.re) || []).length;
      if (count) { text = text.replace(r.re, r.repl); findings.push({ type: r.type, count }); }
    }
    return { redacted: text, findings };
  },

  // Preview redaction without persisting (used by the Prompt Builder + Prompts list).
  previewRedaction(text: string) {
    const { redacted, findings } = devPortalService._redactText(text);
    return { redacted, findings, total: findings.reduce((s, f) => s + f.count, 0), hasPii: findings.length > 0 };
  },

  // Redact a stored prompt in place (prompt + response_summary) and flag it.
  async redactPrompt(promptId: string) {
    const { db } = require('@vibestudio/database');
    const row = await db('dev_prompt_history').where({ id: promptId }).first();
    if (!row) throw new Error('Prompt not found');
    const p = devPortalService._redactText(row.prompt || '');
    const r = devPortalService._redactText(row.response_summary || '');
    const findings = [...p.findings, ...r.findings];
    await db('dev_prompt_history').where({ id: promptId }).update({
      prompt: p.redacted, response_summary: row.response_summary != null ? r.redacted : null, is_pii_redacted: true,
    });
    return { id: promptId, is_pii_redacted: true, findings, total: findings.reduce((s, f) => s + f.count, 0) };
  },

  // Toggle sharing — blocks sharing a prompt that still contains un-redacted PII.
  async setPromptShared(promptId: string, isShared: boolean) {
    const { db } = require('@vibestudio/database');
    const row = await db('dev_prompt_history').where({ id: promptId }).first();
    if (!row) throw new Error('Prompt not found');
    if (isShared && !row.is_pii_redacted) {
      const { findings } = devPortalService._redactText(`${row.prompt || ''}\n${row.response_summary || ''}`);
      if (findings.length) throw new Error(`Redact PII before sharing — found ${findings.map((f: any) => `${f.count} ${f.type}`).join(', ')}.`);
      // No PII detected → mark redacted so the gate stays consistent.
      await db('dev_prompt_history').where({ id: promptId }).update({ is_pii_redacted: true });
    }
    await db('dev_prompt_history').where({ id: promptId }).update({ is_shared: !!isShared });
    return db('dev_prompt_history').where({ id: promptId }).first();
  },

  async getPromptStats(projectId: string) {
    const { db } = require('@vibestudio/database');
    const prompts = await db('dev_prompt_history').where('project_id', projectId);
    // Per-member stats
    const byAuthor: Record<string, { name: string; count: number; templates: Record<string, number> }> = {};
    const byTemplate: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalTokens = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;

    for (const p of prompts) {
      const aid = p.author_id || 'unknown';
      if (!byAuthor[aid]) byAuthor[aid] = { name: '', count: 0, templates: {} };
      byAuthor[aid].count++;
      byAuthor[aid].templates[p.template || 'custom'] = (byAuthor[aid].templates[p.template || 'custom'] || 0) + 1;
      byTemplate[p.template || 'custom'] = (byTemplate[p.template || 'custom'] || 0) + 1;
      if (p.device_name) byDevice[p.device_name] = (byDevice[p.device_name] || 0) + 1;
      else if (p.os) byDevice[p.os] = (byDevice[p.os] || 0) + 1;
      byStatus[p.status || 'sent'] = (byStatus[p.status || 'sent'] || 0) + 1;
      totalTokens += (p.prompt_tokens || 0) + (p.response_tokens || 0);
      totalCacheRead += p.cache_read_tokens || 0;
      totalCacheWrite += p.cache_write_tokens || 0;
    }

    // Fill author names
    const authorIds = Object.keys(byAuthor).filter(id => id !== 'unknown');
    if (authorIds.length > 0) {
      const members = await db('dev_team_members').whereIn('id', authorIds).select('id', 'name', 'display_name');
      for (const m of members) { if (byAuthor[m.id]) byAuthor[m.id].name = m.display_name || m.name; }
    }

    return { total: prompts.length, byAuthor, byTemplate, byDevice, byStatus, totalTokens, totalCacheRead, totalCacheWrite };
  },

  // ── Code File Browser (multi-project) ──

  _resolveRoot(projectRoot?: string) {
    const fs = require('fs');
    const path = require('path');
    if (projectRoot) {
      const abs = path.normalize(projectRoot);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
    }
    return path.normalize(getProjectRoot());
  },

  async getLinkedProjects() {
    const fs = require('fs');
    const path = require('path');
    const root = path.normalize(getProjectRoot());
    const projects: any[] = [{ id: 'current', name: path.basename(root), path: root, isCurrent: true }];
    // Read linked projects from dev_projects.settings
    try {
      const { db } = require('@vibestudio/database');
      const rows = await db('dev_projects').select('id', 'name', 'key', 'settings');
      for (const p of rows) {
        const bp = p.settings?.linked_paths;
        if (Array.isArray(bp)) {
          for (const lp of bp) {
            const abs = path.normalize(lp.path || lp);
            if (fs.existsSync(abs)) projects.push({ id: p.id + ':' + abs, name: lp.name || path.basename(abs), path: abs, projectKey: p.key });
          }
        }
      }
    } catch {}
    return projects;
  },

  // IDE Monitor (#5): read-only git snapshot of a local repo — branch, ahead/
  // behind, changed files, recent commits, diff size, TODO/FIXME count. git is
  // run via execFileSync with arg arrays (no shell) inside the given cwd. The
  // route enforces the path allowlist; this also verifies the dir exists.
  async getRepoStatus(repoPathInput?: string) {
    const fs = require('fs');
    const path = require('path');
    const { execFileSync } = require('child_process');
    const target = path.normalize(repoPathInput ? path.resolve(repoPathInput) : getProjectRoot());
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error('Path does not exist or is not a directory');

    const git = (args: string[]): string => {
      try {
        return execFileSync('git', args, { cwd: target, timeout: 8000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
      } catch { return ''; }
    };

    if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
      return { path: target, isRepo: false };
    }

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) || null;
    let ahead = 0, behind = 0;
    if (upstream) {
      const lr = git(['rev-list', '--left-right', '--count', `${upstream}...HEAD`]).split(/\s+/);
      if (lr.length === 2) { behind = parseInt(lr[0], 10) || 0; ahead = parseInt(lr[1], 10) || 0; }
    }

    const porcelain = git(['status', '--porcelain=v1']);
    const changed = porcelain
      ? porcelain.split('\n').filter(Boolean).map(l => ({ status: l.slice(0, 2).trim(), file: l.slice(3) }))
      : [];

    const SEP = '';
    const logRaw = git(['log', '-8', `--pretty=format:%h${SEP}%an${SEP}%ar${SEP}%s`]);
    const commits = logRaw
      ? logRaw.split('\n').map(l => { const [hash, author, when, subject] = l.split(SEP); return { hash, author, when, subject }; })
      : [];

    // TODO/FIXME scan over changed files only (cap 50, skip large/binary).
    let todos = 0;
    for (const c of changed.slice(0, 50)) {
      try {
        const f = path.join(target, c.file);
        if (fs.existsSync(f) && fs.statSync(f).isFile() && fs.statSync(f).size < 500_000) {
          todos += (fs.readFileSync(f, 'utf8').match(/\b(TODO|FIXME)\b/g) || []).length;
        }
      } catch {}
    }

    return {
      path: target, isRepo: true, branch, upstream, ahead, behind,
      changedCount: changed.length, changed: changed.slice(0, 200), commits,
      diff: { unstaged: git(['diff', '--shortstat']), staged: git(['diff', '--cached', '--shortstat']) },
      todos, scannedAt: new Date().toISOString(),
    };
  },

  // A4/#5 live watcher: poll git status on an interval (+ a best-effort fs.watch
  // accelerator) and invoke onChange only when a cheap change-signature differs.
  // Returns a stop() fn. Backs the SSE endpoint /ops/monitor/stream so the IDE
  // Monitor updates live instead of manual refresh. No DB access.
  watchRepo(target: string | undefined, onChange: (snap: any) => void, opts: any = {}) {
    const fs = require('fs');
    const path = require('path');
    const dir = target ? path.resolve(target) : getProjectRoot();
    const intervalMs = Math.max(Number(opts.intervalMs) || 3000, 1000);
    let stopped = false, lastSig: string | null = null, debounce: any = null, watcher: any = null;
    const sigOf = (s: any) => s?.isRepo
      ? [s.branch, s.ahead, s.behind, s.changedCount, s.commits?.[0]?.hash || '', (s.changed || []).map((c: any) => c.status + c.file).join(','), s.todos].join('|')
      : `norepo:${s?.path || dir}`;
    const tick = async () => {
      if (stopped) return;
      try {
        const snap = await devPortalService.getRepoStatus(dir);
        const sig = sigOf(snap);
        if (sig !== lastSig) { lastSig = sig; onChange(snap); }
      } catch { /* transient git/fs error — retry next tick */ }
    };
    const timer = setInterval(tick, intervalMs);
    tick(); // emit the initial snapshot immediately
    try {
      watcher = fs.watch(dir, { recursive: true }, (_evt: string, file: string) => {
        if (file && /(^|[\\/])(node_modules|\.git|\.next|dist|dist-bundle|release)([\\/]|$)/.test(String(file))) return;
        if (debounce) return;
        debounce = setTimeout(() => { debounce = null; tick(); }, 400);
      });
    } catch { /* recursive fs.watch unsupported on this platform — poll covers it */ }
    return () => { stopped = true; clearInterval(timer); if (debounce) clearTimeout(debounce); if (watcher) { try { watcher.close(); } catch {} } };
  },

  // ── A4: commit / PR / CI ↔ task bridge ──
  // Scan a repo's recent commits, extract task keys (e.g. VIBE-11) from each
  // commit subject (+ the branch name for the HEAD commit), and upsert a
  // 'commit' link on every matching dev_task. Read-only against git (execFile,
  // no shell); the route enforces the path allowlist.
  async scanRepoTaskLinks(opts: any = {}) {
    const fs = require('fs');
    const path = require('path');
    const { execFileSync } = require('child_process');
    const { db } = require('@vibestudio/database');
    const target = path.normalize(opts.repoPath ? path.resolve(opts.repoPath) : getProjectRoot());
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error('Path does not exist or is not a directory');

    const git = (args: string[]): string => {
      try { return execFileSync('git', args, { cwd: target, timeout: 8000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); }
      catch { return ''; }
    };
    if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
      return { isRepo: false, path: target, scanned: 0, linked: 0, matchedKeys: [], unmatchedKeys: [] };
    }

    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '';
    const repo = path.basename(target);
    const SEP = '\x1f', REC = '\x1e';
    const raw = git(['log', `-${limit}`, `--pretty=format:%H${SEP}%an${SEP}%aI${SEP}%s${REC}`]);
    const commits = raw
      ? raw.split(REC).map(s => s.trim()).filter(Boolean).map(line => { const [sha, author, iso, subject] = line.split(SEP); return { sha, author, iso, subject: subject || '' }; })
      : [];

    const KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
    const branchKeys = (branch.match(KEY) || []).map(k => k.toUpperCase());

    const tasks = await db('dev_tasks').whereNotNull('task_key').select('id', 'task_key');
    const keyToTask: Record<string, any> = {};
    for (const t of tasks) keyToTask[String(t.task_key || '').toUpperCase()] = t;

    const matched = new Set<string>(), unmatched = new Set<string>();
    let linked = 0;
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const keys = new Set<string>([
        ...((c.subject.match(KEY) || []).map((k: string) => k.toUpperCase())),
        ...(i === 0 ? branchKeys : []), // branch key applies to the HEAD commit only
      ]);
      for (const k of keys) {
        const task = keyToTask[k];
        if (!task) { unmatched.add(k); continue; }
        matched.add(k);
        const rowdata = {
          task_id: task.id, link_type: 'commit', ref: c.sha,
          title: (c.subject || '').slice(0, 500), branch, repo, author: c.author,
          external_at: c.iso || null, created_by: opts.createdBy || null, updated_at: db.fn.now(),
        };
        try {
          const existing = await db('dev_task_links').where({ task_id: task.id, link_type: 'commit', ref: c.sha }).first();
          if (existing) await db('dev_task_links').where({ id: existing.id }).update(rowdata);
          else { await db('dev_task_links').insert(rowdata); linked++; }
        } catch { /* RLS / race — skip this row */ }
      }
    }
    return { isRepo: true, path: target, branch, repo, scanned: commits.length, linked, matchedKeys: [...matched].sort(), unmatchedKeys: [...unmatched].sort() };
  },

  // All links for a task, grouped by type, with the latest CI status surfaced.
  async getTaskLinks(taskId: string) {
    const { db } = require('@vibestudio/database');
    const rows = await db('dev_task_links').where({ task_id: taskId }).orderByRaw('external_at DESC NULLS LAST, created_at DESC');
    const byType: Record<string, any[]> = { commit: [], pr: [], ci: [] };
    for (const r of rows) (byType[r.link_type] || (byType[r.link_type] = [])).push(r);
    return { total: rows.length, byType, latestCi: byType.ci?.[0]?.status || null, links: rows };
  },

  // Add/update a PR or CI (or manual commit) link — used by the UI form and by
  // CI webhooks. Upserts on (task_id, link_type, ref).
  async upsertTaskLink(taskId: string, payload: any = {}, createdBy: string | null = null) {
    const { db } = require('@vibestudio/database');
    const type = String(payload.link_type || '').toLowerCase();
    if (!['commit', 'pr', 'ci'].includes(type)) throw new Error('link_type must be commit, pr, or ci');
    const ref = String(payload.ref || '').trim();
    if (!ref) throw new Error('ref is required');
    const row: any = {
      task_id: taskId, link_type: type, ref,
      title: payload.title || null, url: payload.url || null, status: payload.status || null,
      branch: payload.branch || null, repo: payload.repo || null, author: payload.author || null,
      external_at: payload.external_at || null, updated_at: db.fn.now(),
    };
    const existing = await db('dev_task_links').where({ task_id: taskId, link_type: type, ref }).first();
    if (existing) { await db('dev_task_links').where({ id: existing.id }).update(row); return { ...existing, ...row, id: existing.id }; }
    const [created] = await db('dev_task_links').insert({ ...row, created_by: createdBy }).returning('*');
    return created;
  },

  async deleteTaskLink(id: string) {
    const { db } = require('@vibestudio/database');
    const link = await db('dev_task_links').where({ id }).first();
    if (!link) return { id, deleted: false };
    await db('dev_task_links').where({ id }).del();
    return { id, deleted: true, task_id: link.task_id };
  },

  // ── A3: prompt A/B experiments ──
  async createExperiment(projectId: string, payload: any = {}, createdBy: string | null = null) {
    const { db } = require('@vibestudio/database');
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('name is required');
    const variants = Array.isArray(payload.variants) ? payload.variants.filter((v: any) => String(v?.prompt || '').trim()) : [];
    if (variants.length < 2) throw new Error('at least 2 variants with prompts are required');
    const [exp] = await db('dev_prompt_experiments').insert({
      project_id: projectId || null, task_id: payload.task_id || null, name,
      hypothesis: payload.hypothesis || null, status: 'open', created_by: createdBy,
    }).returning('*');
    const LABELS = 'ABCDEFGH';
    await db('dev_prompt_variants').insert(variants.map((v: any, i: number) => ({
      experiment_id: exp.id, label: String(v.label || LABELS[i] || `V${i + 1}`).slice(0, 24),
      prompt: String(v.prompt), provider: v.provider || null, model: v.model || null,
    })));
    return devPortalService.getExperiment(exp.id);
  },

  async listExperiments(projectId: string) {
    const { db } = require('@vibestudio/database');
    const exps = await db('dev_prompt_experiments').where({ project_id: projectId }).orderBy('created_at', 'desc');
    if (!exps.length) return [];
    const counts = await db('dev_prompt_variants').whereIn('experiment_id', exps.map((e: any) => e.id))
      .select('experiment_id').count({ variants: 'id' }).sum({ runs: 'runs' }).groupBy('experiment_id');
    const cmap: Record<string, any> = Object.fromEntries(counts.map((c: any) => [c.experiment_id, c]));
    return exps.map((e: any) => ({ ...e, variant_count: Number(cmap[e.id]?.variants) || 0, total_runs: Number(cmap[e.id]?.runs) || 0 }));
  },

  async getExperiment(id: string) {
    const { db } = require('@vibestudio/database');
    const exp = await db('dev_prompt_experiments').where({ id }).first();
    if (!exp) return null;
    const variants = await db('dev_prompt_variants').where({ experiment_id: id }).orderBy('label', 'asc');
    const decorated = variants.map((v: any) => {
      const runs = Number(v.runs) || 0;
      return {
        ...v,
        avg_cost: runs ? Number(v.total_cost) / runs : null,
        avg_duration_ms: runs ? Math.round(Number(v.total_duration_ms) / runs) : null,
        avg_rating: v.rating_count ? Math.round((v.rating_sum / v.rating_count) * 10) / 10 : null,
        avg_tokens: runs ? Math.round((Number(v.total_prompt_tokens) + Number(v.total_response_tokens)) / runs) : null,
      };
    });
    return { ...exp, variants: decorated };
  },

  async deleteExperiment(id: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_prompt_experiments').where({ id }).del();
    return { id, deleted: true };
  },

  async decideExperimentWinner(experimentId: string, variantId: string) {
    const { db } = require('@vibestudio/database');
    const variant = await db('dev_prompt_variants').where({ id: variantId, experiment_id: experimentId }).first();
    if (!variant) throw new Error('variant does not belong to this experiment');
    await db('dev_prompt_experiments').where({ id: experimentId }).update({ status: 'decided', winner_variant_id: variantId, updated_at: db.fn.now() });
    return devPortalService.getExperiment(experimentId);
  },

  async rateVariant(variantId: string, rating: number) {
    const { db } = require('@vibestudio/database');
    const r = Math.max(1, Math.min(5, Math.round(Number(rating) || 0)));
    const variant = await db('dev_prompt_variants').where({ id: variantId }).first();
    if (!variant) throw new Error('variant not found');
    await db('dev_prompt_variants').where({ id: variantId }).update({
      rating_sum: Number(variant.rating_sum) + r, rating_count: Number(variant.rating_count) + 1, updated_at: db.fn.now(),
    });
    return { variant_id: variantId, rating: r };
  },

  // Run a variant: live via the AI provider, or record a manual result (paste
  // output produced elsewhere). Updates the variant's aggregates, costs the run
  // with budget.json prices, and logs to dev_prompt_history (ai_origin ab_test).
  async runVariant(variantId: string, opts: any = {}, createdBy: string | null = null) {
    const { db } = require('@vibestudio/database');
    const variant = await db('dev_prompt_variants').where({ id: variantId }).first();
    if (!variant) throw new Error('variant not found');
    const exp = await db('dev_prompt_experiments').where({ id: variant.experiment_id }).first();

    let content: string, model: string, promptTokens: number, responseTokens: number, cacheRead = 0, cacheWrite = 0, durationMs: number;
    if (opts.manual && (opts.manual.response !== undefined || opts.manual.prompt_tokens !== undefined)) {
      const m = opts.manual;
      content = String(m.response || '');
      model = variant.model || 'manual';
      promptTokens = Number(m.prompt_tokens) || 0;
      responseTokens = Number(m.response_tokens) || 0;
      cacheRead = Number(m.cache_read_tokens) || 0;
      cacheWrite = Number(m.cache_write_tokens) || 0;
      durationMs = Number(m.duration_ms) || 0;
    } else {
      const ai = require('./ai-provider-service');
      const provider = variant.provider;
      if (!provider || !ai.AI_PROVIDERS[provider]) throw new Error('variant has no valid provider; set one or run with a manual result');
      const isLocal = ai.AI_PROVIDERS[provider]?.authHeader === 'none';
      const apiKey = isLocal ? '' : await ai.getProviderKey(provider);
      if (!apiKey && !isLocal) throw new Error(`No API key configured for ${ai.AI_PROVIDERS[provider]?.name || provider} — add one in AI Providers, or run with a manual result.`);
      const started = Date.now();
      const result = await ai.chatCompletion(provider, apiKey, variant.model, [{ role: 'user', content: variant.prompt }], { maxTokens: Math.min(Number(opts.max_tokens) || 2048, 8192) });
      durationMs = Date.now() - started;
      content = result.content || '';
      model = result.model || variant.model;
      promptTokens = result.promptTokens || 0;
      responseTokens = result.responseTokens || 0;
      cacheRead = result.cacheReadTokens || 0;
      cacheWrite = result.cacheWriteTokens || 0;
    }

    const budget = await devPortalService.getBudget();
    const { costOf } = devPortalService._costEngine(budget);
    const cost = costOf({ model, in_tokens: promptTokens, out_tokens: responseTokens, cache_read: cacheRead, cache_write: cacheWrite });

    await db('dev_prompt_variants').where({ id: variantId }).update({
      runs: Number(variant.runs) + 1,
      total_prompt_tokens: Number(variant.total_prompt_tokens) + promptTokens,
      total_response_tokens: Number(variant.total_response_tokens) + responseTokens,
      total_cache_read: Number(variant.total_cache_read) + cacheRead,
      total_cache_write: Number(variant.total_cache_write) + cacheWrite,
      total_cost: Number(variant.total_cost) + cost,
      total_duration_ms: Number(variant.total_duration_ms) + durationMs,
      last_response: content.slice(0, 2000),
      updated_at: db.fn.now(),
    });

    // Best-effort prompt-history log (so the run shows in usage + cost rollups).
    if (exp?.project_id) {
      try {
        await devPortalService.createPrompt(exp.project_id, createdBy, {
          task_id: exp.task_id || null, template: 'ab_test', ai_origin: 'ab_test',
          provider: variant.provider || null, title: `A/B ${exp.name} · ${variant.label}`,
          prompt: variant.prompt, response_summary: content.slice(0, 500), model,
          status: 'completed', prompt_tokens: promptTokens, response_tokens: responseTokens,
          cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite,
          duration_seconds: Math.round(durationMs / 1000), labels: ['ab_test', variant.label],
        }, {});
      } catch { /* logging is non-critical */ }
    }

    return { variant_id: variantId, model, cost, prompt_tokens: promptTokens, response_tokens: responseTokens, cache_read: cacheRead, cache_write: cacheWrite, duration_ms: durationMs, response: content.slice(0, 2000) };
  },

  // Cost Tracker: serve .claude/cost-tracking/budget.json (caps + per-model
  // prices). Returns sane defaults if the file is missing/malformed.
  async getBudget() {
    const fs = require('fs');
    const path = require('path');
    const defaults = { monthly_usd_cap: 0, alert_at_percent: 80, currency: 'USD', per_model: {} as Record<string, any> };
    try {
      const file = path.join(getProjectRoot(), '.claude', 'cost-tracking', 'budget.json');
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { ...defaults, ...parsed };
      }
    } catch {}
    return defaults;
  },

  // Shared cost engine: maps a model id → USD/1M prices (from budget.json
  // per_model, substring match, first wins; built-in fallback otherwise) and
  // costs a token bucket. Cache read ≈0.1× input, cache write ≈1.25× input
  // (Anthropic 5-min TTL); local models ≈ $0. Identical math to usage.tsx.
  _costEngine(budget: any) {
    const FALLBACK: [string, number, number][] = [
      ['opus', 5, 25], ['sonnet', 3, 15], ['haiku', 1, 5], ['gpt-4o-mini', 0.15, 0.6], ['gpt-4o', 2.5, 10],
      ['gpt-4', 5, 15], ['deepseek', 0.27, 1.1], ['moonshot', 0.6, 2.5],
      ['llama', 0, 0], ['mixtral', 0, 0], ['qwen', 0, 0], ['mistral', 0, 0], ['phi', 0, 0], ['ollama', 0, 0],
    ];
    const fromBudget: [string, number, number][] = Object.entries(budget?.per_model || {})
      .map(([k, v]: any) => [k.toLowerCase(), Number(v.in_per_mtok) || 0, Number(v.out_per_mtok) || 0]);
    const table = [...fromBudget, ...FALLBACK];
    const price = (model: string) => { const m = (model || '').toLowerCase(); const hit = table.find(([k]) => m.includes(k)); return hit ? { in: hit[1], out: hit[2] } : { in: 0, out: 0 }; };
    const costOf = (r: any) => { const p = price(r.model); return ((+r.in_tokens || 0) * p.in + (+r.out_tokens || 0) * p.out + (+r.cache_read || 0) * p.in * 0.1 + (+r.cache_write || 0) * p.in * 1.25) / 1e6; };
    return { price, costOf };
  },

  // Cost-per-feature ROI (A7): join AI spend (dev_prompt_history) to tasks +
  // sprints. Costs each (task, model) token bucket with budget.json prices and
  // aggregates per task and per sprint. Same cost formula as usage.tsx.
  async getProjectCostRoi(projectId: string) {
    const { db } = require('@vibestudio/database');
    const budget = await devPortalService.getBudget();
    const { costOf } = devPortalService._costEngine(budget);

    const rows = await db('dev_prompt_history')
      .where('project_id', projectId)
      .select('task_id', 'model')
      .sum({ in_tokens: 'prompt_tokens', out_tokens: 'response_tokens', cache_read: 'cache_read_tokens', cache_write: 'cache_write_tokens' })
      .count({ prompts: 'id' })
      .groupBy('task_id', 'model');

    const taskAgg: Record<string, { cost: number; prompts: number; tokens: number }> = {};
    const untracked = { cost: 0, prompts: 0 };
    for (const r of rows) {
      const c = costOf(r);
      const tok = (+r.in_tokens || 0) + (+r.out_tokens || 0) + (+r.cache_read || 0) + (+r.cache_write || 0);
      if (!r.task_id) { untracked.cost += c; untracked.prompts += Number(r.prompts) || 0; continue; }
      const t = taskAgg[r.task_id] || (taskAgg[r.task_id] = { cost: 0, prompts: 0, tokens: 0 });
      t.cost += c; t.prompts += Number(r.prompts) || 0; t.tokens += tok;
    }

    let tasks: any[] = [];
    const taskIds = Object.keys(taskAgg);
    if (taskIds.length) {
      const trows = await db('dev_tasks')
        .leftJoin('dev_sprints', 'dev_tasks.sprint_id', 'dev_sprints.id')
        .whereIn('dev_tasks.id', taskIds)
        .select('dev_tasks.id', 'dev_tasks.task_key', 'dev_tasks.title', 'dev_tasks.status', 'dev_tasks.story_points', 'dev_tasks.sprint_id', 'dev_sprints.name as sprint_name');
      tasks = trows.map((t: any) => ({
        id: t.id, task_key: t.task_key, title: t.title, status: t.status,
        story_points: t.story_points, sprint_id: t.sprint_id, sprint_name: t.sprint_name,
        ...taskAgg[t.id],
        cost_per_point: t.story_points ? taskAgg[t.id].cost / t.story_points : null,
      }));
      tasks.sort((a, b) => b.cost - a.cost);
    }

    const bySprint: Record<string, any> = {};
    for (const t of tasks) {
      const key = t.sprint_id || 'none';
      const s = bySprint[key] || (bySprint[key] = { sprint_id: t.sprint_id || null, sprint: t.sprint_name || 'No sprint', cost: 0, points: 0, tasks: 0 });
      s.cost += t.cost; s.points += Number(t.story_points) || 0; s.tasks += 1;
    }
    const sprints = Object.values(bySprint)
      .map((s: any) => ({ ...s, cost_per_point: s.points ? s.cost / s.points : null }))
      .sort((a: any, b: any) => b.cost - a.cost);

    const totalCost = tasks.reduce((s, t) => s + t.cost, 0) + untracked.cost;
    return { currency: budget.currency || 'USD', totalCost, untracked, tasks: tasks.slice(0, 50), sprints };
  },

  // ── Monthly cost rollups (Cost Tracker exports) ──
  // Distinct YYYY-MM buckets that have AI usage, newest first, each flagged with
  // whether a rollup file already exists under .claude/cost-tracking/.
  async listRollupMonths() {
    const { db } = require('@vibestudio/database');
    const fs = require('fs');
    const path = require('path');
    const rows = await db('dev_prompt_history')
      .select(db.raw("to_char(created_at, 'YYYY-MM') as month"))
      .count({ prompts: 'id' })
      .groupByRaw("to_char(created_at, 'YYYY-MM')")
      .orderByRaw("to_char(created_at, 'YYYY-MM') desc");
    const dir = path.join(getProjectRoot(), '.claude', 'cost-tracking');
    return rows.map((r: any) => ({
      month: r.month,
      prompts: Number(r.prompts) || 0,
      hasFile: (() => { try { return fs.existsSync(path.join(dir, `${r.month}.md`)); } catch { return false; } })(),
    }));
  },

  // Compute a platform-wide cost rollup for one month (default: current month).
  // One grouped query over (author, project, provider, model); cost derived per
  // row via the shared engine, then folded into every dimension.
  async getMonthlyRollup(month?: string) {
    const { db } = require('@vibestudio/database');
    const budget = await devPortalService.getBudget();
    const { costOf } = devPortalService._costEngine(budget);

    const mo = (month && /^\d{4}-\d{2}$/.test(month)) ? month : new Date().toISOString().slice(0, 7);
    const [y, m] = mo.split('-').map(Number);
    const start = `${mo}-01`;
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // first day of next month

    const rows = await db('dev_prompt_history')
      .whereRaw('created_at >= ? AND created_at < ?', [start, end])
      .select('author_id', 'project_id', 'provider', 'model')
      .sum({ in_tokens: 'prompt_tokens', out_tokens: 'response_tokens', cache_read: 'cache_read_tokens', cache_write: 'cache_write_tokens' })
      .count({ prompts: 'id' })
      .groupBy('author_id', 'project_id', 'provider', 'model');

    const totals = { prompts: 0, in_tokens: 0, out_tokens: 0, cache_read: 0, cache_write: 0, cost: 0 };
    const byModel: Record<string, any> = {}, byProvider: Record<string, any> = {}, byMember: Record<string, any> = {}, byProject: Record<string, any> = {};
    const bump = (bucket: Record<string, any>, key: string, seed: any, r: any, cost: number) => {
      const b = bucket[key] || (bucket[key] = { ...seed, prompts: 0, in_tokens: 0, out_tokens: 0, cache_read: 0, cache_write: 0, cost: 0 });
      b.prompts += Number(r.prompts) || 0; b.in_tokens += +r.in_tokens || 0; b.out_tokens += +r.out_tokens || 0;
      b.cache_read += +r.cache_read || 0; b.cache_write += +r.cache_write || 0; b.cost += cost;
    };
    for (const r of rows) {
      const cost = costOf(r);
      totals.prompts += Number(r.prompts) || 0; totals.in_tokens += +r.in_tokens || 0; totals.out_tokens += +r.out_tokens || 0;
      totals.cache_read += +r.cache_read || 0; totals.cache_write += +r.cache_write || 0; totals.cost += cost;
      bump(byModel, r.model || 'unknown', { model: r.model || 'unknown' }, r, cost);
      bump(byProvider, r.provider || 'unknown', { provider: r.provider || 'unknown' }, r, cost);
      bump(byMember, r.author_id || 'none', { member_id: r.author_id || null }, r, cost);
      bump(byProject, r.project_id || 'none', { project_id: r.project_id || null }, r, cost);
    }

    // Resolve member + project names (best-effort; ids fall back if RLS hides rows).
    const memberIds = Object.values(byMember).map((b: any) => b.member_id).filter(Boolean);
    const projectIds = Object.values(byProject).map((b: any) => b.project_id).filter(Boolean);
    const members = memberIds.length ? await db('dev_team_members').whereIn('id', memberIds).select('id', 'name', 'email') : [];
    const projects = projectIds.length ? await db('dev_projects').whereIn('id', projectIds).select('id', 'name', 'key') : [];
    const mName: Record<string, any> = Object.fromEntries(members.map((m: any) => [m.id, m]));
    const pName: Record<string, any> = Object.fromEntries(projects.map((p: any) => [p.id, p]));
    Object.values(byMember).forEach((b: any) => { const m = mName[b.member_id]; b.name = m?.name || '(unknown)'; b.email = m?.email || null; });
    Object.values(byProject).forEach((b: any) => { const p = pName[b.project_id]; b.name = p?.name || '(none)'; b.key = p?.key || null; });

    const sortCost = (o: Record<string, any>) => Object.values(o).sort((a: any, b: any) => b.cost - a.cost);
    const cap = Number(budget.monthly_usd_cap) || 0;
    return {
      month: mo, currency: budget.currency || 'USD',
      monthly_usd_cap: cap, budget_pct: cap > 0 ? Math.round((totals.cost / cap) * 1000) / 10 : null,
      totals,
      byModel: sortCost(byModel), byProvider: sortCost(byProvider),
      byMember: sortCost(byMember), byProject: sortCost(byProject),
    };
  },

  // Render a rollup to markdown (the .claude/cost-tracking/YYYY-MM.md format).
  renderMonthlyRollupMarkdown(r: any): string {
    const usd = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const num = (n: number) => (Number(n) || 0).toLocaleString('en-US');
    const t = r.totals;
    const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
    const lines: string[] = [
      `# Cost rollup — ${r.month}`, '',
      `> Generated from \`dev_prompt_history\` with \`.claude/cost-tracking/budget.json\` prices.`,
      `> Cache reads ≈0.1× input, writes ≈1.25×; local models = $0. Indicative.`, '',
      `**Total: ${usd(t.cost)}** · ${num(t.prompts)} prompts · ${num(t.in_tokens)} in / ${num(t.out_tokens)} out tokens · ${num(t.cache_read)} cache-read / ${num(t.cache_write)} cache-write`,
    ];
    if (r.monthly_usd_cap > 0) lines.push('', `Budget: ${usd(t.cost)} / ${usd(r.monthly_usd_cap)} cap (**${r.budget_pct}%**).`);
    lines.push('', '## By model', '', row(['Model', 'Prompts', 'In', 'Out', 'Cost']), row(['---', '---:', '---:', '---:', '---:']),
      ...r.byModel.map((b: any) => row([b.model, num(b.prompts), num(b.in_tokens), num(b.out_tokens), usd(b.cost)])));
    lines.push('', '## By provider', '', row(['Provider', 'Prompts', 'Cost']), row(['---', '---:', '---:']),
      ...r.byProvider.map((b: any) => row([b.provider, num(b.prompts), usd(b.cost)])));
    lines.push('', '## By member', '', row(['Member', 'Email', 'Prompts', 'Cost']), row(['---', '---', '---:', '---:']),
      ...r.byMember.map((b: any) => row([b.name, b.email || '—', num(b.prompts), usd(b.cost)])));
    lines.push('', '## By project', '', row(['Project', 'Key', 'Prompts', 'Cost']), row(['---', '---', '---:', '---:']),
      ...r.byProject.map((b: any) => row([b.name, b.key || '—', num(b.prompts), usd(b.cost)])));
    lines.push('');
    return lines.join('\n');
  },

  // Compute + persist a month's rollup to .claude/cost-tracking/<month>.md.
  async writeMonthlyRollup(month?: string) {
    const fs = require('fs');
    const path = require('path');
    const rollup = await devPortalService.getMonthlyRollup(month);
    const dir = path.join(getProjectRoot(), '.claude', 'cost-tracking');
    fs.mkdirSync(dir, { recursive: true });
    const rel = `.claude/cost-tracking/${rollup.month}.md`;
    fs.writeFileSync(path.join(getProjectRoot(), rel), devPortalService.renderMonthlyRollupMarkdown(rollup));
    return { path: rel, rollup };
  },

  // Auto bug-capture (A4/A6): write a bug-history entry from an error + the
  // current git changes, and return a ready-to-paste fix prompt. The entry
  // lands in the studio's .claude/bug-history/ so memory search indexes it.
  async captureBug(opts: any = {}) {
    const fs = require('fs');
    const path = require('path');
    const root = getProjectRoot();
    const title = (opts.title || '').toString().trim() || 'Untitled bug';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bug';
    const today = new Date().toISOString().slice(0, 10);

    let repo: any = null;
    try { if (opts.repoPath) repo = await devPortalService.getRepoStatus(opts.repoPath); } catch {}
    const changedList = repo?.changed?.length
      ? repo.changed.map((c: any) => `- \`${c.status || '·'}\` ${c.file}`).join('\n')
      : '- (none / not a git repo)';
    const lastCommit = repo?.commits?.[0] ? `${repo.commits[0].hash} ${repo.commits[0].subject}` : 'n/a';
    const where = opts.file ? `${opts.file}${opts.line ? ':' + opts.line : ''}` : '(unknown)';
    const errorText = (opts.error || '(paste the exact error / failing behavior)').toString().slice(0, 2000);

    const body = [
      `# ${title}`, '',
      `### ${today} · ${title}`,
      `- **Tool/model:** ${opts.tool || 'Claude Code'}`,
      `- **Repo:** ${repo?.path || opts.repoPath || '(none)'} · branch ${repo?.branch || 'n/a'}`,
      `- **Where:** ${where}`,
      `- **Status:** open`, '',
      '**Error / symptom**', '```', errorText, '```', '',
      '**Changed files at capture**', changedList, '',
      `**Last commit:** ${lastCommit}`, '',
      '**Root cause:** _TBD_', '**Fix:** _TBD_', '**Regression risk:** _TBD_', '',
    ].join('\n');

    const dir = path.join(root, '.claude', 'bug-history');
    fs.mkdirSync(dir, { recursive: true });
    const rel = `.claude/bug-history/${today}-${slug}.md`;
    fs.writeFileSync(path.join(root, rel), body);

    const fixPrompt = [
      'Role: debugger on VibeStudio. Inspect the relevant files FIRST, propose a plan, then make the smallest safe change.',
      `Repo: ${repo?.path || opts.repoPath || ''} (branch ${repo?.branch || 'n/a'}).`,
      `Where: ${where}.`,
      `Error / failing behavior:\n${errorText}`,
      `Changed files at capture:\n${changedList}`,
      'Constraints: keep dev_portal_token auth + RLS on dev_* intact; API responses { success, data, error }; minimal diff; do not change unrelated systems.',
      `When done: summarize the root cause + fix and append them to ${rel}.`,
    ].join('\n\n');

    try { await devPortalService.logActivity(opts.actorId, 'bug_captured', 'bug', null, `Captured bug: ${title}`, null); } catch {}
    return { file: rel, prompt: fixPrompt, branch: repo?.branch || null, changedCount: repo?.changedCount || 0 };
  },

  async addLinkedProject(projectId: string, name: string, linkedPath: string) {
    const fs = require('fs');
    const path = require('path');
    const abs = path.normalize(linkedPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error('Path does not exist or is not a directory');
    const { db } = require('@vibestudio/database');
    const project = await db('dev_projects').where('id', projectId).first();
    if (!project) throw new Error('Project not found');
    const settings = project.settings || {};
    if (!settings.linked_paths) settings.linked_paths = [];
    if (settings.linked_paths.some((lp: any) => path.normalize(lp.path) === abs)) throw new Error('Project already linked');
    settings.linked_paths.push({ name, path: abs, type: 'local' });
    await db('dev_projects').where('id', projectId).update({ settings: JSON.stringify(settings) });
    return { added: true };
  },

  async removeLinkedProject(projectId: string, linkedPath: string) {
    const path = require('path');
    const { db } = require('@vibestudio/database');
    const project = await db('dev_projects').where('id', projectId).first();
    if (!project) throw new Error('Project not found');
    const settings = project.settings || {};
    settings.linked_paths = (settings.linked_paths || []).filter((lp: any) => path.normalize(lp.path || lp) !== path.normalize(linkedPath));
    await db('dev_projects').where('id', projectId).update({ settings: JSON.stringify(settings) });
    return { removed: true };
  },

  // Browse server filesystem for folder picker (drives, home dirs, any path)
  async browseFolders(dirPath?: string) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // If no path, show root locations (drives on Windows, common dirs on Linux/Mac)
    if (!dirPath) {
      const roots: any[] = [];
      if (process.platform === 'win32') {
        // Detect available drives
        for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
          const drive = `${letter}:\\`;
          try { if (fs.existsSync(drive)) roots.push({ name: `${letter}: Drive`, path: drive, type: 'drive', icon: '💾' }); } catch {}
        }
      } else {
        roots.push({ name: 'Root /', path: '/', type: 'root', icon: '🖥' });
      }
      // Common locations
      const home = os.homedir();
      roots.push({ name: 'Home', path: home, type: 'home', icon: '🏠' });
      const desktop = path.join(home, 'Desktop');
      if (fs.existsSync(desktop)) roots.push({ name: 'Desktop', path: desktop, type: 'desktop', icon: '🖥' });
      const docs = path.join(home, 'Documents');
      if (fs.existsSync(docs)) roots.push({ name: 'Documents', path: docs, type: 'documents', icon: '📁' });
      const projects = path.join(home, 'Projects');
      if (fs.existsSync(projects)) roots.push({ name: 'Projects', path: projects, type: 'projects', icon: '📂' });
      // Dev common paths
      for (const d of ['/var/www', '/opt', `${home}/dev`, `${home}/repos`, `${home}/code`, `${home}/workspace`]) {
        try { if (fs.existsSync(d) && fs.statSync(d).isDirectory()) roots.push({ name: path.basename(d), path: d, type: 'dev', icon: '💻' }); } catch {}
      }
      return { path: '', entries: roots, isRoot: true };
    }

    const abs = path.normalize(dirPath);
    if (!fs.existsSync(abs)) return { path: abs, entries: [], isRoot: false };

    const entries: any[] = [];
    try {
      const items = fs.readdirSync(abs, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory()) continue;
        if (item.name.startsWith('.') && item.name !== '.git') continue;
        if (['node_modules', '__pycache__', '.next', 'dist', 'coverage', '.turbo'].includes(item.name)) continue;
        const full = path.join(abs, item.name).replace(/\\/g, '/');
        // Check if it's a project (has package.json, Cargo.toml, go.mod, etc.)
        const isProject = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml', 'build.gradle', 'composer.json', 'Gemfile', 'pubspec.yaml', '.git'].some(f => {
          try { return fs.existsSync(path.join(abs, item.name, f)); } catch { return false; }
        });
        entries.push({ name: item.name, path: path.join(abs, item.name).replace(/\\/g, '/'), type: 'directory', isProject });
      }
    } catch {}
    entries.sort((a: any, b: any) => {
      if (a.isProject !== b.isProject) return a.isProject ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { path: abs.replace(/\\/g, '/'), entries, isRoot: false };
  },

  // Clone a git repo into workspace
  async cloneGitRepo(projectId: string, repoUrl: string, name?: string) {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    // Validate URL
    if (!repoUrl.match(/^(https?:\/\/|git@)/)) throw new Error('Invalid git URL');

    // Create workspace dir
    const root = getProjectRoot();
    const workspaceDir = path.join(root, '.workspaces');
    if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });

    // Extract repo name from URL
    const repoName = name || repoUrl.split('/').pop()?.replace(/\.git$/, '') || 'repo';
    const targetDir = path.join(workspaceDir, repoName);

    if (fs.existsSync(targetDir)) throw new Error(`Directory already exists: .workspaces/${repoName}`);

    // Clone
    try {
      execSync(`git clone --depth 1 "${repoUrl}" "${targetDir}"`, { cwd: root, timeout: 120_000, stdio: 'pipe' });
    } catch (e: any) {
      throw new Error(`Git clone failed: ${e.stderr?.toString()?.substring(0, 200) || e.message}`);
    }

    // Auto-link the cloned project
    await devPortalService.addLinkedProject(projectId, repoName, targetDir);
    return { cloned: true, path: targetDir, name: repoName };
  },

  async browseCodeFiles(dirPath?: string, projectRoot?: string) {
    const fs = require('fs');
    const path = require('path');
    const root = devPortalService._resolveRoot(projectRoot);
    const target = dirPath ? path.normalize(path.resolve(root, dirPath)) : root;

    if (!target.startsWith(root)) return { path: '', root: root.replace(/\\/g, '/'), rootName: path.basename(root), entries: [] };

    const SKIP = new Set(['node_modules', '.git', 'dist', '.next', '.turbo', 'coverage', '.cache', '.vscode', '.expo', '__pycache__', '.idea']);
    const entries: any[] = [];

    try {
      const items = fs.readdirSync(target, { withFileTypes: true });
      for (const item of items) {
        if (SKIP.has(item.name)) continue;
        if (item.name.startsWith('.') && item.isDirectory()) continue;
        const rel = path.relative(root, path.join(target, item.name)).replace(/\\/g, '/');
        if (item.isDirectory()) {
          let childCount = 0;
          try { childCount = fs.readdirSync(path.join(target, item.name)).filter((n: string) => !SKIP.has(n)).length; } catch {}
          entries.push({ name: item.name, path: rel, type: 'directory', children: childCount });
        } else {
          try {
            const stat = fs.statSync(path.join(target, item.name));
            const ext = path.extname(item.name).slice(1).toLowerCase();
            entries.push({ name: item.name, path: rel, type: 'file', size: stat.size, ext, modified: stat.mtime });
          } catch {}
        }
      }
    } catch {}

    entries.sort((a: any, b: any) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const relPath = path.relative(root, target).replace(/\\/g, '/');
    return { path: relPath || '', root: root.replace(/\\/g, '/'), rootName: path.basename(root), entries };
  },

  async readCodeFile(filePath: string, projectRoot?: string) {
    const fs = require('fs');
    const path = require('path');
    const root = devPortalService._resolveRoot(projectRoot);
    const abs = path.normalize(path.resolve(root, filePath));

    if (!abs.startsWith(root)) throw new Error('Access denied');
    const BLOCKED = ['.env', 'credentials', 'secret', '.key', '.pem', '.p12', '.pfx'];
    if (BLOCKED.some(b => filePath.toLowerCase().includes(b) && !filePath.toLowerCase().includes('.example'))) throw new Error('Access denied');

    const stat = fs.statSync(abs);
    if (stat.size > 1_000_000) throw new Error('File too large (>1MB)');

    // Binary detection — skip reading binary files
    const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'ico', 'bmp', 'webp', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'mp3', 'mp4', 'wav', 'zip', 'gz', 'tar', 'exe', 'dll', 'so', 'dylib', 'pdf', 'doc', 'docx', 'xls', 'xlsx']);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    if (BINARY_EXT.has(ext)) return { path: filePath, content: `[Binary file — ${ext.toUpperCase()}, ${fmtBytes(stat.size)}]`, lines: 1, size: stat.size, ext, language: ext, binary: true };

    const content = fs.readFileSync(abs, 'utf-8');
    const lines = content.split('\n');

    return { path: filePath, content, lines: lines.length, size: stat.size, ext, language: extToLanguage(ext), binary: false, modified: stat.mtime };
  },

  // ── Code Notes CRUD ──

  async listCodeNotes(projectId: string, memberId: string, filters: { file_path?: string; note_type?: string; is_shared?: boolean; search?: string }) {
    const { db } = require('@vibestudio/database');
    let q = db('dev_code_notes')
      .where('project_id', projectId)
      .where(function(this: any) {
        this.where('is_shared', true).orWhere('member_id', memberId);
      })
      .orderBy('file_path').orderBy('line_start', 'asc');

    if (filters.file_path) q = q.where('file_path', filters.file_path);
    if (filters.note_type) q = q.where('note_type', filters.note_type);
    if (filters.search) q = q.where('content', 'ilike', `%${filters.search}%`);

    const notes = await q;
    // Attach author names
    const authorIds = [...new Set(notes.map((n: any) => n.member_id))];
    const members = authorIds.length > 0
      ? await db('dev_team_members').whereIn('id', authorIds).select('id', 'name', 'display_name', 'avatar_url', 'role')
      : [];
    const memberMap: Record<string, any> = {};
    members.forEach((m: any) => memberMap[m.id] = m);

    return notes.map((n: any) => ({ ...n, author: memberMap[n.member_id] || null }));
  },

  async createCodeNote(projectId: string, memberId: string, data: { file_path: string; line_start?: number; line_end?: number; content: string; note_type?: string; is_shared?: boolean; tags?: string[] }) {
    const { db } = require('@vibestudio/database');
    const [note] = await db('dev_code_notes').insert({
      project_id: projectId,
      member_id: memberId,
      file_path: data.file_path,
      line_start: data.line_start || null,
      line_end: data.line_end || null,
      content: data.content,
      note_type: data.note_type || 'annotation',
      is_shared: data.is_shared !== false,
      tags: JSON.stringify(data.tags || []),
    }).returning('*');
    return note;
  },

  async updateCodeNote(noteId: string, memberId: string, data: { content?: string; note_type?: string; is_shared?: boolean; tags?: string[] }) {
    const { db } = require('@vibestudio/database');
    const note = await db('dev_code_notes').where('id', noteId).first();
    if (!note) throw new Error('Note not found');
    if (note.member_id !== memberId) throw new Error('Not authorized');

    const updates: any = { updated_at: new Date() };
    if (data.content !== undefined) updates.content = data.content;
    if (data.note_type !== undefined) updates.note_type = data.note_type;
    if (data.is_shared !== undefined) updates.is_shared = data.is_shared;
    if (data.tags !== undefined) updates.tags = JSON.stringify(data.tags);

    const [updated] = await db('dev_code_notes').where('id', noteId).update(updates).returning('*');
    return updated;
  },

  async deleteCodeNote(noteId: string, memberId: string) {
    const { db } = require('@vibestudio/database');
    const note = await db('dev_code_notes').where('id', noteId).first();
    if (!note) throw new Error('Note not found');
    if (note.member_id !== memberId) throw new Error('Not authorized');
    await db('dev_code_notes').where('id', noteId).del();
    return { deleted: true };
  },

  async getCodeNoteStats(projectId: string) {
    const { db } = require('@vibestudio/database');
    const notes = await db('dev_code_notes').where('project_id', projectId).where('is_shared', true);
    const byFile: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byAuthor: Record<string, number> = {};
    for (const n of notes) {
      byFile[n.file_path] = (byFile[n.file_path] || 0) + 1;
      byType[n.note_type] = (byType[n.note_type] || 0) + 1;
      byAuthor[n.member_id] = (byAuthor[n.member_id] || 0) + 1;
    }
    // Top annotated files
    const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([f, c]) => ({ file: f, count: c }));
    return { total: notes.length, byType, byAuthor, topFiles };
  },
};

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
    json: 'json', jsonc: 'json', json5: 'json', md: 'markdown', mdx: 'markdown',
    css: 'css', scss: 'scss', sass: 'sass', less: 'less', styl: 'stylus',
    html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
    sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell', bat: 'batch', cmd: 'batch',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'ini',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', scala: 'scala',
    c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp', swift: 'swift',
    php: 'php', lua: 'lua', r: 'r', dart: 'dart', zig: 'zig', nim: 'nim', ex: 'elixir', exs: 'elixir',
    vue: 'vue', svelte: 'svelte', astro: 'astro',
    tf: 'hcl', hcl: 'hcl', prisma: 'prisma', graphql: 'graphql', gql: 'graphql', proto: 'protobuf',
    dockerfile: 'dockerfile', docker: 'dockerfile', makefile: 'makefile', cmake: 'cmake',
    gitignore: 'gitignore', env: 'dotenv', editorconfig: 'editorconfig',
    lock: 'text', txt: 'text', log: 'text', csv: 'csv',
  };
  return map[ext] || 'text';
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
