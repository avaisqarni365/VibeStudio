import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

const ROLES = [
  { value: 'ceo', label: 'CEO / Founder', color: 'bg-amber-500' },
  { value: 'product_owner', label: 'Product Owner', color: 'bg-rose-500' },
  { value: 'lead', label: 'Tech Lead', color: 'bg-blue-600' },
  { value: 'frontend_dev', label: 'Frontend Developer', color: 'bg-cyan-500' },
  { value: 'backend_dev', label: 'Backend Developer', color: 'bg-emerald-500' },
  { value: 'fullstack_dev', label: 'Fullstack Developer', color: 'bg-teal-500' },
  { value: 'db_developer', label: 'Database Developer', color: 'bg-violet-500' },
  { value: 'mobile_dev', label: 'Mobile Developer', color: 'bg-orange-500' },
  { value: 'devops', label: 'DevOps Engineer', color: 'bg-sky-500' },
  { value: 'designer', label: 'UI/UX Designer', color: 'bg-pink-500' },
  { value: 'qa', label: 'QA / Tester', color: 'bg-purple-500' },
  { value: 'scrum_master', label: 'Scrum Master', color: 'bg-indigo-400' },
  { value: 'developer', label: 'Developer', color: 'bg-green-500' },
  { value: 'ai_agent', label: 'AI Agent', color: 'bg-indigo-500' },
];

const DEPARTMENTS = ['engineering', 'frontend', 'backend', 'design', 'qa', 'devops', 'product', 'management'];
const STATUS_TEXT: Record<string, string> = { backlog: 'text-gray-500', todo: 'text-amber-500', in_progress: 'text-blue-500', in_review: 'text-purple-500', testing: 'text-cyan-500', done: 'text-emerald-500' };
const PRIORITY_DOT: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-400' };
const TYPE_ICONS: Record<string, string> = { epic: '⚡', story: '📖', task: '✅', bug: '🐛', improvement: '✨', spike: '🔬', ai_task: '🤖' };
const ACTION_LABELS: Record<string, string> = { task_created: 'created task', task_moved: 'moved task', comment_added: 'commented on', time_logged: 'logged time on', wiki_updated: 'updated wiki' };

const getRoleInfo = (role: string) => ROLES.find(r => r.value === role) || { value: role, label: role, color: 'bg-gray-500' };

export default function DevPortalTeam() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const [teamData, setTeamData] = useState<any>(null);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberWorkload, setMemberWorkload] = useState<any>(null);
  const [view, setView] = useState<'grid' | 'workload'>('workload');
  const [showAdd, setShowAdd] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', password: '', role: 'developer', title: '', department: 'engineering', github_username: '', skills: '' });

  useEffect(() => {
    if (!user) return;
    loadTeam();
  }, [user]);

  const loadTeam = async () => {
    const r = await devApi('get', '/team/workload');
    setTeamData(r.data.data);
  };

  const openMemberDetail = async (memberId: string) => {
    const r = await devApi('get', `/team/${memberId}/workload`);
    setMemberWorkload(r.data.data);
    setSelectedMember(r.data.data?.member);
  };

  const addMember = async () => {
    if (!newMember.name || !newMember.email) return;
    if (!newMember.password || newMember.password.length < 10) {
      alert('Set an initial password of at least 10 characters — a blank field is no longer accepted.');
      return;
    }
    const payload = { ...newMember, skills: newMember.skills.split(',').map(s => s.trim()).filter(Boolean) };
    await devApi('post', '/team', payload);
    setShowAdd(false);
    setNewMember({ name: '', email: '', password: '', role: 'developer', title: '', department: 'engineering', github_username: '', skills: '' });
    loadTeam();
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  if (!teamData) return <DevPortalLayout user={user} title="Team"><div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div></DevPortalLayout>;

  const isMgr = ['ceo', 'lead', 'product_owner', 'scrum_master'].includes(user.role);
  const { members, activeSprint } = teamData;
  const humans = members.filter((m: any) => !m.is_ai_agent);
  const agents = members.filter((m: any) => m.is_ai_agent);

  // Totals
  const teamTotalTasks = humans.reduce((s: number, m: any) => s + m.workload.active, 0);
  const teamTotalPoints = humans.reduce((s: number, m: any) => s + m.workload.points, 0);
  const teamDonePoints = humans.reduce((s: number, m: any) => s + m.workload.donePoints, 0);
  const teamHoursSpent = humans.reduce((s: number, m: any) => s + m.workload.hoursSpent, 0);
  const teamHoursEst = humans.reduce((s: number, m: any) => s + m.workload.hoursEstimated, 0);

  // ── Member Detail View ──
  if (selectedMember && memberWorkload) {
    const mw = memberWorkload;
    const roleInfo = getRoleInfo(selectedMember.role);
    const skills = (() => { try { return typeof selectedMember.skills === 'string' ? JSON.parse(selectedMember.skills || '[]') : (selectedMember.skills || []); } catch { return []; } })();

    return (
      <DevPortalLayout user={user} title={selectedMember.display_name || selectedMember.name}>
        <div className="space-y-5">
          {/* Back + header */}
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedMember(null); setMemberWorkload(null); }} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div className={`w-12 h-12 rounded-xl ${selectedMember.is_ai_agent ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : roleInfo.color} flex items-center justify-center text-white text-lg font-bold shadow-sm`}>
              {selectedMember.is_ai_agent ? '🤖' : (selectedMember.display_name || selectedMember.name).charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{selectedMember.display_name || selectedMember.name}</h1>
              <p className="text-xs text-gray-500">{selectedMember.title || roleInfo.label} · {selectedMember.email}</p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KPI label="Active Tasks" value={`${mw.stats.inProgressTasks}`} sub={`${mw.stats.active - mw.stats.inProgressTasks} pending`} color="blue" />
            <KPI label="Completed" value={`${mw.stats.doneTasks}`} sub={`${mw.stats.completionRate}% rate`} color="emerald" />
            <KPI label="Story Points" value={`${mw.stats.donePoints}/${mw.stats.totalPoints}`} sub={mw.stats.totalPoints > 0 ? `${Math.round((mw.stats.donePoints / mw.stats.totalPoints) * 100)}%` : '—'} color="indigo" />
            <KPI label="Hours" value={`${mw.stats.totalHoursSpent}h`} sub={`${mw.stats.totalHoursEstimated}h estimated`} color="purple" />
            <KPI label="Overdue" value={`${mw.stats.overdueTasks}`} sub={mw.stats.overdueTasks > 0 ? 'needs attention' : 'on track'} color={mw.stats.overdueTasks > 0 ? 'red' : 'gray'} />
            {mw.sprint && <KPI label="Sprint" value={`${mw.sprint.doneTasks}/${mw.sprint.taskCount}`} sub={`${mw.sprint.donePoints}/${mw.sprint.points}p`} color="cyan" />}
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s: string) => <span key={s} className="text-2xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg">{s}</span>)}
            </div>
          )}

          <div className="flex gap-5">
            {/* ── Active Tasks ── */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-700">Active Tasks ({mw.activeTasks.length})</h3>
                </div>
                {mw.activeTasks.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">No active tasks assigned</div>
                ) : mw.activeTasks.map((t: any) => (
                  <div key={t.id} onClick={() => router.push('/dev-portal/tasks/' + t.id)} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-indigo-50/30 transition-colors cursor-pointer">
                    <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
                    <span className="text-2xs font-mono text-gray-400 w-16">{t.task_key}</span>
                    <span className="text-xs text-gray-900 font-medium flex-1 truncate">{t.title}</span>
                    <span className={`text-2xs font-medium capitalize ${STATUS_TEXT[t.status] || 'text-gray-500'}`}>{t.status.replace(/_/g, ' ')}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                    {t.story_points && <span className="text-2xs text-gray-400">{t.story_points}p</span>}
                    {t.time_estimate ? <span className="text-2xs text-gray-400">{t.time_spent || 0}/{t.time_estimate}h</span> : null}
                    {t.sprint_name && <span className="text-2xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{t.sprint_name}</span>}
                  </div>
                ))}
              </div>

              {/* Completed Tasks */}
              {mw.completedTasks.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-700">Recently Completed ({mw.completedTasks.length})</h3>
                  </div>
                  {mw.completedTasks.map((t: any) => (
                    <div key={t.id} onClick={() => router.push('/dev-portal/tasks/' + t.id)} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer opacity-70">
                      <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
                      <span className="text-2xs font-mono text-gray-400 w-16">{t.task_key}</span>
                      <span className="text-xs text-gray-700 flex-1 truncate line-through">{t.title}</span>
                      {t.story_points && <span className="text-2xs text-gray-400">{t.story_points}p</span>}
                      {t.completed_at && <span className="text-2xs text-gray-400">{new Date(t.completed_at).toLocaleDateString('de-DE')}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Right: Activity ── */}
            <div className="w-72 shrink-0 hidden lg:block">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Activity</h3>
                <div className="space-y-3">
                  {mw.activity.length === 0 && <p className="text-2xs text-gray-400 py-4 text-center">No activity yet</p>}
                  {mw.activity.map((a: any) => (
                    <div key={a.id} className="flex gap-2">
                      <div className="w-1 rounded-full bg-indigo-200 shrink-0" />
                      <div>
                        <p className="text-2xs text-gray-700">
                          <span className="font-medium">{ACTION_LABELS[a.action] || a.action}</span>
                          {a.entity_name && <span className="text-gray-500"> "{a.entity_name}"</span>}
                        </p>
                        <p className="text-2xs text-gray-400">{new Date(a.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DevPortalLayout>
    );
  }

  // ── Team List View ──
  return (
    <DevPortalLayout user={user} title="Team">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Team</h1>
            <p className="text-xs text-gray-500 mt-0.5">{humans.length} people · {agents.length} AI agents{activeSprint ? ` · Sprint: ${activeSprint.name}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(['workload', 'grid'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-2xs font-medium rounded-md transition-colors capitalize ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{v}</button>
              ))}
            </div>
            {isMgr && (
              <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add Member
              </button>
            )}
          </div>
        </div>

        {/* Team KPIs */}
        <div className="grid grid-cols-5 gap-3">
          <KPI label="Active Tasks" value={`${teamTotalTasks}`} sub="across team" color="blue" />
          <KPI label="Total Points" value={`${teamDonePoints}/${teamTotalPoints}`} sub={teamTotalPoints > 0 ? `${Math.round((teamDonePoints / teamTotalPoints) * 100)}% done` : '—'} color="indigo" />
          <KPI label="Hours Spent" value={`${teamHoursSpent}h`} sub={`${teamHoursEst}h estimated`} color="purple" />
          <KPI label="Team Size" value={`${humans.length}`} sub={`${agents.length} AI agents`} color="emerald" />
          <KPI label="Overdue" value={`${humans.reduce((s: number, m: any) => s + m.workload.overdue, 0)}`} sub="tasks overdue" color="red" />
        </div>

        {/* Add Member Form */}
        {showAdd && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Add Team Member</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-2xs text-gray-500 font-medium mb-1 block">Full Name *</label>
                  <input value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} placeholder="John Doe" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" /></div>
                <div><label className="text-2xs text-gray-500 font-medium mb-1 block">Email *</label>
                  <input type="email" value={newMember.email} onChange={e => setNewMember({ ...newMember, email: e.target.value })} placeholder="you@codes-ai.uk" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" /></div>
                <div><label className="text-2xs text-gray-500 font-medium mb-1 block">Job Title</label>
                  <input value={newMember.title} onChange={e => setNewMember({ ...newMember, title: e.target.value })} placeholder="Senior Developer" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" /></div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div><label className="text-2xs text-gray-500 font-medium mb-1 block">Role</label>
                  <select value={newMember.role} onChange={e => setNewMember({ ...newMember, role: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs">
                    {ROLES.filter(r => r.value !== 'ai_agent').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select></div>
                <div><label className="text-2xs text-gray-500 font-medium mb-1 block">Department</label>
                  <select value={newMember.department} onChange={e => setNewMember({ ...newMember, department: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs">
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select></div>
                <div><label className="text-2xs text-gray-500 font-medium mb-1 block">GitHub</label>
                  <input value={newMember.github_username} onChange={e => setNewMember({ ...newMember, github_username: e.target.value })} placeholder="johndoe" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" /></div>
                <div><label className="text-2xs text-gray-500 font-medium mb-1 block">Skills (comma-sep)</label>
                  <input value={newMember.skills} onChange={e => setNewMember({ ...newMember, skills: e.target.value })} placeholder="TS, React, Node" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" /></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg font-medium">Cancel</button>
                <button onClick={addMember} disabled={!newMember.name.trim() || !newMember.email.trim()} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold rounded-lg">Add Member</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Workload View ── */}
        {view === 'workload' && (
          <div className="space-y-4">
            {/* Human Members — Workload Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase tracking-wider">
                <span>Member</span><span>Active</span><span>Done</span><span>Points</span><span>Hours</span><span>Sprint</span><span>Overdue</span>
              </div>
              {humans.map((m: any) => {
                const roleInfo = getRoleInfo(m.role);
                const w = m.workload;
                const sp = m.sprint;
                return (
                  <div key={m.id} onClick={() => openMemberDetail(m.id)}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-3 px-4 py-3 border-b border-gray-50 hover:bg-indigo-50/30 transition-colors cursor-pointer items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg ${roleInfo.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {(m.display_name || m.name).charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{m.display_name || m.name}</p>
                        <p className="text-2xs text-gray-500 truncate">{m.title || roleInfo.label}</p>
                      </div>
                    </div>
                    <div className="text-center w-12">
                      <span className="text-xs font-bold text-blue-600">{w.inProgress}</span>
                      <p className="text-2xs text-gray-400">{w.active} tot</p>
                    </div>
                    <div className="text-center w-12">
                      <span className="text-xs font-bold text-emerald-600">{w.done}</span>
                      <p className="text-2xs text-gray-400">{w.total} tot</p>
                    </div>
                    <div className="text-center w-16">
                      <span className="text-xs font-bold text-gray-900">{w.donePoints}/{w.points}</span>
                      <div className="h-1 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${w.points > 0 ? (w.donePoints / w.points) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <div className="text-center w-16">
                      <span className="text-xs font-medium text-gray-700">{w.hoursSpent}h</span>
                      <p className="text-2xs text-gray-400">/ {w.hoursEstimated}h</p>
                    </div>
                    <div className="text-center w-14">
                      {sp ? (
                        <>
                          <span className="text-xs font-medium text-cyan-600">{sp.done}/{sp.tasks}</span>
                          <p className="text-2xs text-gray-400">{sp.donePoints}/{sp.points}p</p>
                        </>
                      ) : <span className="text-2xs text-gray-300">—</span>}
                    </div>
                    <div className="text-center w-10">
                      {w.overdue > 0 ? (
                        <span className="text-xs font-bold text-red-500">{w.overdue}</span>
                      ) : (
                        <span className="text-2xs text-emerald-400">0</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI Agents */}
            {agents.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-700">AI Agents ({agents.length})</h3>
                </div>
                {agents.map((a: any) => {
                  const w = a.workload;
                  const skills = a.skills || [];
                  return (
                    <div key={a.id} onClick={() => openMemberDetail(a.id)}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-indigo-50/30 transition-colors cursor-pointer">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm shrink-0">🤖</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900">{a.display_name || a.name}</p>
                        <div className="flex gap-1 mt-0.5">{skills.slice(0, 4).map((s: string) => <span key={s} className="text-2xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">{s}</span>)}</div>
                      </div>
                      <div className="flex items-center gap-4 text-2xs text-gray-500">
                        <span>{w.active} active</span>
                        <span>{w.done} done</span>
                        <span>{w.donePoints}/{w.points}p</span>
                        <span>{w.hoursSpent}h spent</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Grid View ── */}
        {view === 'grid' && (
          <div className="space-y-5">
            {(Object.entries(
              humans.reduce((acc: Record<string, any[]>, m: any) => {
                const d = m.department || 'engineering';
                if (!acc[d]) acc[d] = [];
                acc[d].push(m);
                return acc;
              }, {} as Record<string, any[]>)
            ) as [string, any[]][]).sort().map(([dept, deptMembers]) => (
              <div key={dept}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 capitalize">{dept} ({deptMembers.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {deptMembers.map((m: any) => {
                    const roleInfo = getRoleInfo(m.role);
                    const w = m.workload;
                    return (
                      <div key={m.id} onClick={() => openMemberDetail(m.id)} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer">
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-xl ${roleInfo.color} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
                            {(m.display_name || m.name).charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{m.display_name || m.name}</p>
                            <p className="text-2xs text-gray-500 truncate">{m.title || roleInfo.label}</p>
                          </div>
                          {w.overdue > 0 && <span className="text-2xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">{w.overdue}</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-gray-100">
                          <div className="text-center">
                            <p className="text-xs font-bold text-gray-900">{w.active}</p>
                            <p className="text-2xs text-gray-400">active</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-bold text-emerald-600">{w.done}</p>
                            <p className="text-2xs text-gray-400">done</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-bold text-indigo-600">{w.hoursSpent}h</p>
                            <p className="text-2xs text-gray-400">spent</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DevPortalLayout>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-100', blue: 'bg-blue-50 border-blue-100', purple: 'bg-purple-50 border-purple-100',
    amber: 'bg-amber-50 border-amber-100', emerald: 'bg-emerald-50 border-emerald-100', cyan: 'bg-cyan-50 border-cyan-100',
    red: 'bg-red-50 border-red-100', gray: 'bg-gray-50 border-gray-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color] || 'bg-gray-50 border-gray-100'}`}>
      <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-base font-bold text-gray-900 mt-0.5">{value}</p>
      <p className="text-2xs text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}
