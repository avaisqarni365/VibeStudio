import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

const HEALTH_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  on_track: { label: 'On Track', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  at_risk: { label: 'At Risk', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  behind: { label: 'Behind', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  blocked: { label: 'Blocked', color: 'text-gray-700', bg: 'bg-gray-100 border-gray-300' },
};

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-500' },
  high: { label: 'High', color: 'bg-orange-500' },
  medium: { label: 'Medium', color: 'bg-blue-500' },
  low: { label: 'Low', color: 'bg-gray-400' },
};

const CATEGORY_ICONS: Record<string, string> = {
  internal: '🏠', client: '🤝', research: '🔬', maintenance: '🔧',
};

export default function Portfolio() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [view, setView] = useState<'cards' | 'timeline' | 'table'>('cards');
  const [showCreate, setShowCreate] = useState(false);
  const [showMembers, setShowMembers] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [filter, setFilter] = useState('');

  // Create form
  const [form, setForm] = useState({ name: '', key: '', description: '', color: '#6366f1', icon: '📦', priority: 'medium', category: 'internal', start_date: '', target_date: '', repository_url: '', tech_stack: '', client_name: '', lead_id: '', genPack: true });

  useEffect(() => {
    if (!user) return;
    devApi('get', '/portfolio').then(r => setProjects(r.data.data || [])).catch(() => {
      devApi('get', '/projects').then(r => setProjects(r.data.data || [])).catch(() => {});
    });
    devApi('get', '/team').then(r => setMembers(r.data.data || [])).catch(() => {});
  }, [user]);

  const loadMembers = async (projectId: string) => {
    setShowMembers(projectId);
    try { const r = await devApi('get', `/projects/${projectId}/members`); setProjectMembers(r.data.data || []); } catch { setProjectMembers([]); }
  };

  const addMember = async (projectId: string, memberId: string, role = 'member') => {
    try { await devApi('post', `/projects/${projectId}/members`, { member_id: memberId, role }); loadMembers(projectId); } catch {}
  };

  const removeMember = async (projectId: string, memberId: string) => {
    try { await devApi('delete', `/projects/${projectId}/members/${memberId}`); loadMembers(projectId); } catch {}
  };

  const createProject = async () => {
    if (!form.name) return;
    try {
      const { genPack, ...projectFields } = form;
      const r = await devApi('post', '/projects', { ...projectFields, key: form.key || form.name.substring(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '') });
      const created = r.data?.data;
      // Generate the filesystem context pack (projects/<slug>/) for the new project.
      if (genPack && created?.id) {
        try {
          const pr = await devApi('post', `/projects/${created.id}/pack`, { repo_path: form.repository_url });
          const dp = pr.data?.data?.docs_path;
          if (dp) alert(`Project created. Context pack: ${dp}`);
        } catch (pe: any) {
          alert('Project created, but pack generation failed: ' + (pe?.response?.data?.error?.message || 'unknown'));
        }
      }
      setShowCreate(false);
      setForm({ name: '', key: '', description: '', color: '#6366f1', icon: '📦', priority: 'medium', category: 'internal', start_date: '', target_date: '', repository_url: '', tech_stack: '', client_name: '', lead_id: '', genPack: true });
      devApi('get', '/portfolio').then(r => setProjects(r.data.data || [])).catch(() => {});
    } catch (e: any) { alert(e?.response?.data?.error?.message || 'Failed'); }
  };

  const updateHealth = async (projectId: string, health: string) => {
    try { await devApi('put', `/projects/${projectId}`, { health }); devApi('get', '/portfolio').then(r => setProjects(r.data.data || [])).catch(() => {}); } catch {}
  };

  const deleteProject = async (p: any) => {
    if (!confirm(`Delete project "${p.name}" and ALL its tasks, sprints, wiki, members and history? This cannot be undone.`)) return;
    try {
      await devApi('delete', `/projects/${p.id}`);
      devApi('get', '/portfolio').then(r => setProjects(r.data.data || [])).catch(() => {});
    } catch (e: any) { alert('Delete failed: ' + (e?.response?.data?.error?.message || 'unknown')); }
  };

  const packPath = (p: any): string | null => {
    try { const s = typeof p.settings === 'string' ? JSON.parse(p.settings) : (p.settings || {}); return s?.docs_path || null; } catch { return null; }
  };

  const genProjectPack = async (p: any, force = false) => {
    if (force && !confirm(`Regenerate context pack for "${p.name}"? Existing files are kept unless overwritten.`)) return;
    try {
      const r = await devApi('post', `/projects/${p.id}/pack`, { force });
      const dp = r.data?.data?.docs_path;
      alert(dp ? `Context pack ready: ${dp}` : 'Pack updated');
      devApi('get', '/portfolio').then(r2 => setProjects(r2.data.data || [])).catch(() => {});
    } catch (e: any) { alert('Pack failed: ' + (e?.response?.data?.error?.message || 'unknown')); }
  };

  const switchAndGo = (projectId: string, path: string) => {
    devApi('put', '/active-project', { project_id: projectId }).catch(() => {});
    router.push(path);
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  const isMgr = ['ceo', 'lead'].includes(user.role);
  const filtered = filter ? projects.filter(p => (p.name || '').toLowerCase().includes((filter || '').toLowerCase()) || (p.key || '').toLowerCase().includes((filter || '').toLowerCase())) : projects;

  // Stats
  const total = projects.length;
  const onTrack = projects.filter(p => (p.health || 'on_track') === 'on_track').length;
  const totalTasks = projects.reduce((s, p) => s + (p.tasks?.total || p.stats?.total || 0), 0);
  const doneTasks = projects.reduce((s, p) => s + (p.tasks?.done || p.stats?.done || 0), 0);
  const totalMembers = new Set(projects.flatMap(p => p.members || [])).size || projects.reduce((s, p) => s + (p.member_count || 0), 0);

  return (
    <DevPortalLayout user={user} title="Portfolio">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Portfolio</h1>
            <p className="text-xs text-gray-500">{total} project{total !== 1 ? 's' : ''} · {totalTasks} tasks · {doneTasks} completed</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter projects..." className="w-44 pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
            </div>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {([
                { key: 'cards', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg> },
                { key: 'table', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg> },
                { key: 'timeline', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg> },
              ] as const).map(v => (
                <button key={v.key} onClick={() => setView(v.key)} className={`p-1.5 rounded-md ${view === v.key ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400'}`}>{v.icon}</button>
              ))}
            </div>
            {isMgr && <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm">+ New Project</button>}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { l: 'Projects', v: total, icon: '📦', sub: `${onTrack} on track`, c: 'from-indigo-500 to-violet-600' },
            { l: 'Total Tasks', v: totalTasks, icon: '📋', sub: `${doneTasks} done`, c: 'from-emerald-500 to-teal-600' },
            { l: 'Team Members', v: totalMembers, icon: '👥', sub: 'across all projects', c: 'from-blue-500 to-cyan-600' },
            { l: 'Completion', v: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) + '%' : '0%', icon: '🎯', sub: 'overall progress', c: 'from-amber-500 to-orange-600' },
          ].map(s => (
            <div key={s.l} className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-14 h-14 rounded-bl-3xl bg-gradient-to-br ${s.c} opacity-10`} />
              <span className="text-lg">{s.icon}</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{s.v}</p>
              <p className="text-2xs text-gray-500">{s.l}</p>
              <p className="text-2xs text-gray-400">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ═══ CARDS VIEW ═══ */}
        {view === 'cards' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map(p => {
              const health = HEALTH_BADGE[p.health || 'on_track'] || HEALTH_BADGE.on_track;
              const priority = PRIORITY_BADGE[p.priority || 'medium'] || PRIORITY_BADGE.medium;
              const tasks = p.tasks || p.stats || { total: 0, done: 0, active: 0, pending: 0 };
              const pct = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
                  {/* Color bar */}
                  <div className="h-1" style={{ backgroundColor: p.color || '#6366f1' }} />
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: (p.color || '#6366f1') + '15' }}>{p.icon || '📦'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-gray-900 truncate cursor-pointer hover:text-indigo-600" onClick={() => switchAndGo(p.id, '/dev-portal/tasks')}>{p.name}</h3>
                          <span className="text-2xs font-mono text-gray-400">{p.key}</span>
                        </div>
                        <p className="text-2xs text-gray-500 truncate mt-0.5">{p.description || 'No description'}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <span className={`px-1.5 py-0.5 rounded-full text-2xs font-bold border ${health.bg} ${health.color}`}>{health.label}</span>
                        <span className={`w-2 h-2 rounded-full ${priority.color} mt-1`} title={priority.label} />
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-2xs mb-1">
                        <span className="text-gray-500">{tasks.done}/{tasks.total} tasks</span>
                        <span className="font-bold text-gray-700">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.color || '#6366f1' }} />
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-4 text-2xs text-gray-400">
                      <span>{CATEGORY_ICONS[p.category || 'internal']} {p.category || 'internal'}</span>
                      <span>👥 {p.member_count || 0}</span>
                      {p.active_sprint && <span>🏃 {p.active_sprint.name}</span>}
                      {p.target_date && <span>📅 {new Date(p.target_date).toLocaleDateString('de-DE')}</span>}
                      {p.tech_stack && <span className="truncate max-w-[120px]">⚙ {p.tech_stack}</span>}
                      {packPath(p) && <span className="truncate max-w-[140px] text-emerald-600" title={packPath(p) || ''}>📁 {packPath(p)}</span>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => switchAndGo(p.id, '/dev-portal/tasks')} className="text-2xs font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50">Tasks</button>
                      <button onClick={() => switchAndGo(p.id, '/dev-portal/board')} className="text-2xs font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50">Board</button>
                      <button onClick={() => switchAndGo(p.id, '/dev-portal/sprints')} className="text-2xs font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50">Sprints</button>
                      {isMgr && (packPath(p)
                        ? <button onClick={() => genProjectPack(p, true)} title={`Regenerate — ${packPath(p)}`} className="text-2xs font-semibold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50">📁 Pack</button>
                        : <button onClick={() => genProjectPack(p, false)} title="Generate context pack" className="text-2xs font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50">Generate pack</button>
                      )}
                      <button onClick={() => loadMembers(p.id)} className="text-2xs font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50 ml-auto">Team ({p.member_count || 0})</button>
                      {isMgr && (
                        <select value={p.health || 'on_track'} onChange={e => updateHealth(p.id, e.target.value)} className="text-2xs border border-gray-200 rounded-lg px-1 py-0.5 bg-white">
                          <option value="on_track">On Track</option>
                          <option value="at_risk">At Risk</option>
                          <option value="behind">Behind</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      )}
                      {isMgr && (
                        <button onClick={() => deleteProject(p)} title="Delete project" className="text-2xs font-semibold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50">🗑</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-2 bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
                <span className="text-4xl block mb-3">📦</span>
                <p className="text-sm font-medium">No projects found</p>
                {isMgr && <button onClick={() => setShowCreate(true)} className="mt-3 text-xs text-indigo-600 font-semibold hover:underline">Create your first project</button>}
              </div>
            )}
          </div>
        )}

        {/* ═══ TABLE VIEW ═══ */}
        {view === 'table' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 text-2xs text-gray-500 font-semibold uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Project</th>
                  <th className="text-center px-3 py-2.5 w-20">Health</th>
                  <th className="text-center px-3 py-2.5 w-16">Priority</th>
                  <th className="text-center px-3 py-2.5 w-24">Progress</th>
                  <th className="text-center px-3 py-2.5 w-16">Tasks</th>
                  <th className="text-center px-3 py-2.5 w-16">Team</th>
                  <th className="text-center px-3 py-2.5 w-20">Sprint</th>
                  <th className="text-center px-3 py-2.5 w-24">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => {
                  const health = HEALTH_BADGE[p.health || 'on_track'] || HEALTH_BADGE.on_track;
                  const priority = PRIORITY_BADGE[p.priority || 'medium'] || PRIORITY_BADGE.medium;
                  const tasks = p.tasks || p.stats || { total: 0, done: 0 };
                  const pct = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => switchAndGo(p.id, '/dev-portal/tasks')}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ backgroundColor: (p.color || '#6366f1') + '15' }}>{p.icon || '📦'}</div>
                          <div>
                            <p className="text-xs font-semibold text-gray-900">{p.name}</p>
                            <p className="text-2xs text-gray-400">{p.key} · {p.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center px-3"><span className={`px-1.5 py-0.5 rounded-full text-2xs font-bold border ${health.bg} ${health.color}`}>{health.label}</span></td>
                      <td className="text-center px-3"><span className={`w-2.5 h-2.5 rounded-full ${priority.color} inline-block`} title={priority.label} /></td>
                      <td className="px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color || '#6366f1' }} /></div>
                          <span className="text-2xs font-bold text-gray-600 w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="text-center text-xs font-bold text-gray-700">{tasks.total}</td>
                      <td className="text-center text-xs text-gray-600">{p.member_count || 0}</td>
                      <td className="text-center text-2xs text-gray-500">{p.active_sprint?.name || '—'}</td>
                      <td className="text-center text-2xs text-gray-500">{p.target_date ? new Date(p.target_date).toLocaleDateString('de-DE') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══ TIMELINE VIEW ═══ */}
        {view === 'timeline' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-xs font-bold text-gray-700 mb-4">Project Timeline</h3>
            <div className="space-y-3">
              {filtered.map(p => {
                const tasks = p.tasks || p.stats || { total: 0, done: 0 };
                const pct = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;
                const start = p.start_date ? new Date(p.start_date) : new Date(p.created_at || Date.now());
                const end = p.target_date ? new Date(p.target_date) : new Date(Date.now() + 90 * 86400000);
                const now = new Date();
                const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
                const elapsed = Math.max(0, Math.min(100, ((now.getTime() - start.getTime()) / 86400000 / totalDays) * 100));
                const health = HEALTH_BADGE[p.health || 'on_track'] || HEALTH_BADGE.on_track;

                return (
                  <div key={p.id} className="flex items-center gap-4">
                    <div className="w-40 shrink-0 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ backgroundColor: (p.color || '#6366f1') + '15' }}>{p.icon || '📦'}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{p.name}</p>
                        <p className="text-2xs text-gray-400">{pct}%</p>
                      </div>
                    </div>
                    <div className="flex-1 relative">
                      {/* Timeline bar */}
                      <div className="h-6 bg-gray-100 rounded-lg relative overflow-hidden">
                        {/* Progress fill */}
                        <div className="absolute inset-y-0 left-0 rounded-lg opacity-30" style={{ width: `${pct}%`, backgroundColor: p.color || '#6366f1' }} />
                        {/* Time elapsed marker */}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10" style={{ left: `${elapsed}%` }} title="Today" />
                        {/* Label */}
                        <div className="absolute inset-0 flex items-center px-3">
                          <span className="text-2xs font-medium text-gray-600">{start.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })} → {end.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-20 shrink-0 text-right">
                      <span className={`px-1.5 py-0.5 rounded-full text-2xs font-bold border ${health.bg} ${health.color}`}>{health.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══ CREATE PROJECT MODAL ═══ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl p-6 w-[540px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-900 mb-4">Create Project</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Project Name</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value, key: e.target.value.substring(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '') })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs" placeholder="e.g. Mobile App" />
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Key</label>
                  <input type="text" value={form.key} onChange={e => setForm({ ...form, key: e.target.value.toUpperCase() })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs font-mono" maxLength={10} />
                </div>
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-semibold">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs h-16 resize-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Priority</label>
                  <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs">
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs">
                    <option value="internal">Internal</option><option value="client">Client</option><option value="research">Research</option><option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Color</label>
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-full mt-1 h-[34px] rounded-xl border cursor-pointer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Target Date</label>
                  <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs" />
                </div>
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-semibold">Lead</label>
                <select value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs">
                  <option value="">No lead assigned</option>
                  {members.filter(m => !m.is_ai_agent).map(m => <option key={m.id} value={m.id}>{m.display_name || m.name} ({m.role})</option>)}
                </select>
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-semibold">Tech Stack</label>
                <input type="text" value={form.tech_stack} onChange={e => setForm({ ...form, tech_stack: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs" placeholder="React, Node.js, PostgreSQL" />
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-semibold">Repository URL</label>
                <input type="text" value={form.repository_url} onChange={e => setForm({ ...form, repository_url: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-xl text-xs font-mono" placeholder="https://github.com/..." />
              </div>
              <label className="col-span-2 flex items-start gap-2 p-2 rounded-xl bg-indigo-50 border border-indigo-100 cursor-pointer">
                <input type="checkbox" checked={form.genPack} onChange={e => setForm({ ...form, genPack: e.target.checked })} className="mt-0.5" />
                <span className="text-2xs text-indigo-700">
                  <span className="font-semibold">Generate context pack</span> — creates <code>projects/&lt;slug&gt;/</code> with PROJECT_PLAN, PRD, ARCHITECTURE, TASKS, memory, CLAUDE/AGENTS/.cursorrules, and sessions/prompts/bug-history/sprint folders, linked to this project.
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs text-gray-500 border rounded-xl">Cancel</button>
                <button onClick={createProject} disabled={!form.name} className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 disabled:opacity-50 rounded-xl shadow-sm">Create Project</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TEAM MEMBERS MODAL ═══ */}
      {showMembers && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowMembers(null)}>
          <div className="bg-white rounded-2xl p-5 w-[480px] max-h-[70vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Project Team</h3>
              <button onClick={() => setShowMembers(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Current members */}
            <div className="space-y-2 mb-4">
              {projectMembers.map(m => (
                <div key={m.member_id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">{(m.display_name || m.name || '?')[0]}</div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-800">{m.display_name || m.name}</p>
                    <p className="text-2xs text-gray-400">{m.role} · {m.allocation_percent || 100}% allocated</p>
                  </div>
                  {isMgr && <button onClick={() => removeMember(showMembers, m.member_id)} className="text-2xs text-red-500 hover:text-red-700">Remove</button>}
                </div>
              ))}
              {projectMembers.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No members assigned</p>}
            </div>

            {/* Add member */}
            {isMgr && (
              <div>
                <p className="text-2xs text-gray-500 font-semibold mb-2">Add Team Member</p>
                <div className="space-y-1">
                  {members.filter(m => !m.is_ai_agent && !projectMembers.find(pm => pm.member_id === m.id)).map(m => (
                    <button key={m.id} onClick={() => addMember(showMembers, m.id)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 rounded-lg text-left transition-colors">
                      <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-2xs font-bold text-gray-500">{(m.display_name || m.name || '?')[0]}</div>
                      <span className="text-xs text-gray-700">{m.display_name || m.name}</span>
                      <span className="text-2xs text-gray-400 ml-auto">{m.role}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </DevPortalLayout>
  );
}
