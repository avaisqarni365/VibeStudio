import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

const EMPTY_SPRINT = { name: '', goal: '', start_date: '', end_date: '', capacity_points: '', hours_per_day: '8' };
const STATUS_COLORS: Record<string, string> = { backlog: 'bg-gray-400', todo: 'bg-amber-500', in_progress: 'bg-blue-500', in_review: 'bg-purple-500', testing: 'bg-cyan-500', done: 'bg-emerald-500', cancelled: 'bg-red-400' };
const STATUS_TEXT: Record<string, string> = { backlog: 'text-gray-500', todo: 'text-amber-500', in_progress: 'text-blue-500', in_review: 'text-purple-500', testing: 'text-cyan-500', done: 'text-emerald-500' };
const TYPE_ICONS: Record<string, string> = { epic: '⚡', story: '📖', task: '✅', bug: '🐛', improvement: '✨', spike: '🔬', ai_task: '🤖' };
const PRIORITY_DOT: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-400' };
const SPRINT_STATUS_COLORS: Record<string, string> = { planning: 'bg-gray-100 text-gray-600', active: 'bg-emerald-100 text-emerald-700', review: 'bg-purple-100 text-purple-700', completed: 'bg-blue-100 text-blue-700' };
const SPRINT_FLOW = ['planning', 'active', 'review', 'completed'];

function calcWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  let days = 0;
  const cur = new Date(start);
  const endD = new Date(end);
  while (cur <= endD) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function daysRemaining(end: string): number {
  if (!end) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  let days = 0;
  const cur = new Date(today);
  while (cur <= endD) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export default function DevPortalSprints() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [sprints, setSprints] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newSprint, setNewSprint] = useState<any>({ ...EMPTY_SPRINT });
  const [selectedSprint, setSelectedSprint] = useState<any>(null);
  const [sprintStats, setSprintStats] = useState<any>(null);
  const [sprintTasks, setSprintTasks] = useState<any[]>([]);
  const [backlogTasks, setBacklogTasks] = useState<any[]>([]);
  const [selectedBacklog, setSelectedBacklog] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    if (activeProjectId) {
      setProjectId(activeProjectId);
      loadSprints(activeProjectId);
    } else {
      devApi('get', '/projects').then(r => {
        if (r.data.data?.[0]) {
          setProjectId(r.data.data[0].id);
          loadSprints(r.data.data[0].id);
        }
      });
    }
  }, [user, activeProjectId]);

  const loadSprints = async (pid?: string) => {
    const id = pid || projectId;
    if (!id) return;
    const r = await devApi('get', `/projects/${id}/sprints`);
    setSprints(r.data.data || []);
  };

  const createSprint = async () => {
    if (!newSprint.name.trim() || !projectId) return;
    const payload: any = {
      name: newSprint.name,
      goal: newSprint.goal || undefined,
      start_date: newSprint.start_date || undefined,
      end_date: newSprint.end_date || undefined,
      capacity_points: newSprint.capacity_points ? parseInt(newSprint.capacity_points, 10) : undefined,
      hours_per_day: newSprint.hours_per_day ? parseInt(newSprint.hours_per_day, 10) : 8,
    };
    await devApi('post', `/projects/${projectId}/sprints`, payload);
    setShowCreate(false);
    setNewSprint({ ...EMPTY_SPRINT });
    await loadSprints();
  };

  const openSprintDetail = async (sprint: any) => {
    setSelectedSprint(sprint);
    const [statsRes, tasksRes] = await Promise.all([
      devApi('get', `/sprints/${sprint.id}/stats`),
      devApi('get', `/sprints/${sprint.id}/tasks`),
    ]);
    setSprintStats(statsRes.data.data);
    setSprintTasks(tasksRes.data.data || []);
    // Load backlog tasks for assigning
    if (projectId) {
      const blRes = await devApi('get', `/projects/${projectId}/tasks?status=backlog`);
      setBacklogTasks((blRes.data.data || []).filter((t: any) => !t.sprint_id));
    }
  };

  const updateSprintStatus = async (sprintId: string, status: string) => {
    await devApi('put', `/sprints/${sprintId}`, { status });
    await loadSprints();
    if (selectedSprint?.id === sprintId) {
      const s = { ...selectedSprint, status };
      setSelectedSprint(s);
      openSprintDetail(s);
    }
  };

  const moveTasksToSprint = async () => {
    if (!selectedSprint || selectedBacklog.length === 0) return;
    await devApi('post', `/sprints/${selectedSprint.id}/bulk-move`, { task_ids: selectedBacklog });
    setSelectedBacklog([]);
    openSprintDetail(selectedSprint);
  };

  const removeFromSprint = async (taskId: string) => {
    await devApi('put', `/tasks/${taskId}`, { sprint_id: null, status: 'backlog' });
    openSprintDetail(selectedSprint);
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  // Preview working days in create form
  const previewWorkingDays = calcWorkingDays(newSprint.start_date, newSprint.end_date);

  // ── Sprint Detail View ──
  if (selectedSprint && sprintStats) {
    const s = selectedSprint;
    const st = sprintStats;
    const retro = typeof s.retrospective === 'string' ? JSON.parse(s.retrospective || '{}') : (s.retrospective || {});
    const progressPct = st.totalPoints > 0 ? Math.round((st.donePoints / st.totalPoints) * 100) : 0;
    const hoursProgressPct = st.totalHours > 0 ? Math.round((st.spentHours / st.totalHours) * 100) : 0;
    const remaining = daysRemaining(s.end_date);

    return (
      <DevPortalLayout user={user} title={s.name}>
        <div className="space-y-5">
          {/* Back + header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setSelectedSprint(null); setSprintStats(null); }} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">{s.name}</h1>
                  <span className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${SPRINT_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                </div>
                {s.goal && <p className="text-xs text-gray-500 mt-0.5">{s.goal}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {SPRINT_FLOW.filter(st => st !== s.status).map(st => (
                <button key={st} onClick={() => updateSprintStatus(s.id, st)}
                  className={`px-3 py-1.5 text-2xs font-semibold rounded-lg border transition-colors ${st === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {st === 'active' ? 'Start Sprint' : st === 'review' ? 'Review' : st === 'completed' ? 'Complete' : 'Back to Planning'}
                </button>
              ))}
            </div>
          </div>

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KPICard label="Tasks" value={`${st.totalTasks}`} sub={`${st.statusBreakdown?.done || 0} done`} color="indigo" />
            <KPICard label="Story Points" value={`${st.donePoints} / ${st.totalPoints}`} sub={`${progressPct}% complete`} color="blue" />
            <KPICard label="Hours" value={`${st.spentHours}h / ${st.totalHours}h`} sub={`${hoursProgressPct}% effort`} color="purple" />
            <KPICard label="Working Days" value={`${st.workingDays}`} sub={`${remaining} remaining`} color="amber" />
            <KPICard label="Team" value={`${st.teamSize}`} sub={`${st.hoursPerDay}h/day`} color="emerald" />
            <KPICard label="Team Capacity" value={`${st.totalTeamHours}h`} sub={`${st.totalHours}h allocated`} color="cyan" />
          </div>

          {/* Sprint date bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">Sprint Progress</span>
              <span className="text-2xs text-gray-400">{s.start_date || '—'} → {s.end_date || '—'}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-2xs text-gray-400">
              <span>{st.donePoints} points done</span>
              <span>{st.totalPoints - st.donePoints} remaining</span>
            </div>
          </div>

          <div className="flex gap-5">
            {/* ── Left: Sprint Tasks ── */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Burndown Chart (text-based) */}
              {st.burndown && st.burndown.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Burndown</h3>
                  <div className="flex items-end gap-1 h-24">
                    {st.burndown.map((b: any, i: number) => {
                      const maxVal = st.totalPoints || 1;
                      const idealH = Math.round((b.ideal / maxVal) * 100);
                      const actualH = b.actual >= 0 ? Math.round((b.actual / maxVal) * 100) : -1;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${b.date}: Ideal ${b.ideal}, Actual ${b.actual >= 0 ? b.actual : '—'}`}>
                          <div className="w-full flex gap-px justify-center" style={{ height: '96px' }}>
                            <div className="w-1.5 bg-gray-200 rounded-t self-end" style={{ height: `${idealH}%` }} />
                            {actualH >= 0 && <div className={`w-1.5 rounded-t self-end ${actualH > idealH ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ height: `${actualH}%` }} />}
                          </div>
                          {i % 3 === 0 && <span className="text-2xs text-gray-300 mt-0.5">{b.date.slice(5)}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-2xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-200 rounded" /> Ideal</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-400 rounded" /> Actual</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded" /> Behind</span>
                  </div>
                </div>
              )}

              {/* Sprint Tasks */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-700">Sprint Tasks ({sprintTasks.length})</h3>
                  <span className="text-2xs text-gray-400">{st.donePoints}/{st.totalPoints} pts · {st.spentHours}/{st.totalHours}h</span>
                </div>
                {sprintTasks.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-400">No tasks in this sprint. Add tasks from the backlog.</div>
                ) : sprintTasks.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-indigo-50/30 transition-colors group">
                    <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
                    <span className="text-2xs font-mono text-gray-400 w-16">{t.task_key}</span>
                    <span onClick={() => router.push('/dev-portal/tasks/' + t.id)} className="text-xs text-gray-900 font-medium flex-1 truncate cursor-pointer hover:text-indigo-600">{t.title}</span>
                    <span className={`text-2xs font-medium capitalize ${STATUS_TEXT[t.status] || 'text-gray-500'}`}>{t.status.replace(/_/g, ' ')}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                    {t.story_points && <span className="text-2xs text-gray-400 w-6 text-right">{t.story_points}p</span>}
                    {t.time_estimate ? (
                      <span className="text-2xs text-gray-400 w-14 text-right">{t.time_spent || 0}/{t.time_estimate}h</span>
                    ) : <span className="w-14" />}
                    {(t.assignee_display_name || t.assignee_name) && (
                      <span className="text-2xs text-gray-500 w-20 text-right truncate">{t.assignee_is_ai ? '🤖 ' : ''}{t.assignee_display_name || t.assignee_name}</span>
                    )}
                    <button onClick={() => removeFromSprint(t.id)} className="text-2xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove from sprint">×</button>
                  </div>
                ))}
              </div>

              {/* Backlog — Add tasks to sprint */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-700">Backlog ({backlogTasks.length} unassigned)</h3>
                  {selectedBacklog.length > 0 && (
                    <button onClick={moveTasksToSprint} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-2xs font-semibold rounded-lg">
                      Add {selectedBacklog.length} to Sprint
                    </button>
                  )}
                </div>
                {backlogTasks.length === 0 ? (
                  <div className="px-4 py-6 text-center text-2xs text-gray-400">All tasks are assigned to sprints</div>
                ) : backlogTasks.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <input type="checkbox" checked={selectedBacklog.includes(t.id)} onChange={e => {
                      if (e.target.checked) setSelectedBacklog([...selectedBacklog, t.id]);
                      else setSelectedBacklog(selectedBacklog.filter(id => id !== t.id));
                    }} className="rounded border-gray-300 text-indigo-600" />
                    <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
                    <span className="text-2xs font-mono text-gray-400">{t.task_key}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate">{t.title}</span>
                    {t.story_points && <span className="text-2xs text-gray-400">{t.story_points}p</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: Team Workload ── */}
            <div className="w-72 shrink-0 space-y-4 hidden lg:block">
              {/* Status Breakdown */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(st.statusBreakdown || {}).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status] || 'bg-gray-400'}`} />
                      <span className="text-xs text-gray-700 flex-1 capitalize">{status.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-semibold text-gray-900">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Team Workload */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Team Workload</h3>
                <div className="space-y-3">
                  {Object.entries(st.memberWorkload || {}).map(([id, w]: [string, any]) => {
                    const pct = w.tasks > 0 ? Math.round((w.done / w.tasks) * 100) : 0;
                    return (
                      <div key={id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">{w.name}</span>
                          <span className="text-2xs text-gray-400">{w.done}/{w.tasks} tasks</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between mt-0.5 text-2xs text-gray-400">
                          <span>{w.points}p assigned</span>
                          <span>{w.hours_spent}/{w.hours_estimated}h</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sprint Info */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sprint Info</h3>
                <div className="space-y-2 text-2xs">
                  <div className="flex justify-between"><span className="text-gray-400">Sprint #</span><span className="text-gray-700 font-medium">{s.sprint_number}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Start</span><span className="text-gray-700">{s.start_date || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">End</span><span className="text-gray-700">{s.end_date || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Working Days</span><span className="text-gray-700 font-medium">{st.workingDays}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Days Remaining</span><span className="text-gray-700 font-medium">{remaining}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Capacity</span><span className="text-gray-700">{s.capacity_points}p</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Team Hours</span><span className="text-gray-700">{st.totalTeamHours}h</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Velocity</span><span className="text-gray-700 font-medium">{st.donePoints}p / sprint</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DevPortalLayout>
    );
  }

  // ── Sprint List View ──
  return (
    <DevPortalLayout user={user} title="Sprints">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sprints</h1>
            <p className="text-xs text-gray-500 mt-0.5">Plan and track development cycles · {sprints.length} sprints</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Create Sprint
          </button>
        </div>

        {/* Create Sprint Form */}
        {showCreate && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">New Sprint</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div>
              <label className="text-2xs text-gray-500 font-medium mb-1 block">Sprint Name *</label>
              <input value={newSprint.name} onChange={e => setNewSprint({ ...newSprint, name: e.target.value })} placeholder="e.g. Sprint 14 — Tax Module Refinement" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-2xs text-gray-500 font-medium mb-1 block">Sprint Goal</label>
              <textarea value={newSprint.goal} onChange={e => setNewSprint({ ...newSprint, goal: e.target.value })} placeholder="What should this sprint accomplish?" rows={2} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-2xs text-gray-500 font-medium mb-1 block">Start Date</label>
                <input type="date" value={newSprint.start_date} onChange={e => setNewSprint({ ...newSprint, start_date: e.target.value })} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700" />
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-medium mb-1 block">End Date</label>
                <input type="date" value={newSprint.end_date} onChange={e => setNewSprint({ ...newSprint, end_date: e.target.value })} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700" />
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-medium mb-1 block">Capacity (Points)</label>
                <input type="number" value={newSprint.capacity_points} onChange={e => setNewSprint({ ...newSprint, capacity_points: e.target.value })} placeholder="e.g. 40" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700" />
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-medium mb-1 block">Hours/Day</label>
                <input type="number" value={newSprint.hours_per_day} onChange={e => setNewSprint({ ...newSprint, hours_per_day: e.target.value })} placeholder="8" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700" />
              </div>
            </div>

            {/* Working days preview */}
            {previewWorkingDays > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5"><span className="text-blue-400">📅</span><span className="font-semibold text-blue-700">{previewWorkingDays} working days</span></div>
                <span className="text-blue-400">·</span>
                <span className="text-blue-600">{previewWorkingDays * parseInt(newSprint.hours_per_day || '8')}h per person</span>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-900 font-medium">Cancel</button>
              <button onClick={createSprint} disabled={!newSprint.name.trim()} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold rounded-lg transition-colors">Create Sprint</button>
            </div>
          </div>
        )}

        {/* Sprint Cards */}
        <div className="space-y-3">
          {sprints.map(s => {
            const ptsProgress = s.assigned_points > 0 ? Math.round((s.done_points / s.assigned_points) * 100) : 0;
            const taskProgress = s.total_tasks > 0 ? Math.round((s.done_tasks / s.total_tasks) * 100) : 0;
            const retro = typeof s.retrospective === 'string' ? JSON.parse(s.retrospective || '{}') : (s.retrospective || {});
            return (
              <div key={s.id} onClick={() => openSprintDetail(s)} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{s.status === 'active' ? '🏃' : s.status === 'completed' ? '✅' : s.status === 'review' ? '🔍' : '📋'}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                      {s.goal && <p className="text-2xs text-gray-500 mt-0.5 line-clamp-1">{s.goal}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${SPRINT_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${ptsProgress}%` }} />
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between text-2xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <span>{s.done_tasks}/{s.total_tasks} tasks ({taskProgress}%)</span>
                    <span>{s.done_points}/{s.assigned_points} pts</span>
                    {s.total_hours_estimated > 0 && <span>{s.total_hours_spent}/{s.total_hours_estimated}h</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {retro.working_days && <span>{retro.working_days}d · {retro.team_size || '?'} team</span>}
                    <span>{s.start_date || '—'} → {s.end_date || '—'}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {sprints.length === 0 && <div className="text-center py-12 text-sm text-gray-400">No sprints yet. Create your first sprint!</div>}
        </div>
      </div>
    </DevPortalLayout>
  );
}

function KPICard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-100', blue: 'bg-blue-50 border-blue-100', purple: 'bg-purple-50 border-purple-100',
    amber: 'bg-amber-50 border-amber-100', emerald: 'bg-emerald-50 border-emerald-100', cyan: 'bg-cyan-50 border-cyan-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color] || 'bg-gray-50 border-gray-100'}`}>
      <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-base font-bold text-gray-900 mt-0.5">{value}</p>
      <p className="text-2xs text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}
