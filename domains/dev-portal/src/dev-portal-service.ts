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
      model: data.model || 'claude-opus-4',
      provider: data.provider || null,
      ai_origin: data.ai_origin || 'dev_portal_chat',
      status: data.status || 'sent',
      prompt_tokens: data.prompt_tokens || 0,
      response_tokens: data.response_tokens || 0,
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

  async getPromptStats(projectId: string) {
    const { db } = require('@vibestudio/database');
    const prompts = await db('dev_prompt_history').where('project_id', projectId);
    // Per-member stats
    const byAuthor: Record<string, { name: string; count: number; templates: Record<string, number> }> = {};
    const byTemplate: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalTokens = 0;

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
    }

    // Fill author names
    const authorIds = Object.keys(byAuthor).filter(id => id !== 'unknown');
    if (authorIds.length > 0) {
      const members = await db('dev_team_members').whereIn('id', authorIds).select('id', 'name', 'display_name');
      for (const m of members) { if (byAuthor[m.id]) byAuthor[m.id].name = m.display_name || m.name; }
    }

    return { total: prompts.length, byAuthor, byTemplate, byDevice, byStatus, totalTokens };
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
