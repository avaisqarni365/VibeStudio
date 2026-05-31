import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog', color: 'border-gray-600' },
  { key: 'todo', label: 'To Do', color: 'border-amber-500' },
  { key: 'in_progress', label: 'In Progress', color: 'border-blue-500' },
  { key: 'in_review', label: 'Review', color: 'border-purple-500' },
  { key: 'testing', label: 'Testing', color: 'border-cyan-500' },
  { key: 'done', label: 'Done', color: 'border-emerald-500' },
];

const TYPE_ICONS: Record<string, string> = { epic: '⚡', story: '📖', task: '✅', bug: '🐛', improvement: '✨', spike: '🔬', ai_task: '🤖' };
const PRIORITY_DOT: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-500' };

export default function DevPortalBoard() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sprints, setSprints] = useState<any[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    const load = (pid: string) => {
      setProjectId(pid);
      devApi('get', `/projects/${pid}/tasks`).then(t => setTasks(t.data.data || []));
      devApi('get', `/projects/${pid}/sprints`).then(s => {
        const list = s.data.data || [];
        setSprints(list);
        const active = list.find((sp: any) => sp.status === 'active');
        if (active) setSelectedSprintId(active.id);
      });
    };
    if (activeProjectId) {
      load(activeProjectId);
    } else {
      devApi('get', '/projects').then(r => {
        if (r.data.data?.[0]) load(r.data.data[0].id);
      });
    }
  }, [user, activeProjectId]);

  const loadTasks = async () => {
    if (!projectId) return;
    const params = selectedSprintId && selectedSprintId !== 'all' && selectedSprintId !== 'backlog'
      ? `?sprint_id=${selectedSprintId}` : '';
    const r = await devApi('get', `/projects/${projectId}/tasks${params}`);
    setTasks(r.data.data || []);
  };

  useEffect(() => {
    if (!projectId) return;
    loadTasks();
  }, [selectedSprintId, projectId]);

  const moveTask = async (taskId: string, newStatus: string) => {
    await devApi('put', `/tasks/${taskId}`, { status: newStatus });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  // Filter tasks by sprint
  const filteredTasks = selectedSprintId === 'all'
    ? tasks
    : selectedSprintId === 'backlog'
    ? tasks.filter(t => !t.sprint_id)
    : tasks.filter(t => t.sprint_id === selectedSprintId);

  const activeSprint = sprints.find(s => s.id === selectedSprintId);
  const totalPoints = filteredTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
  const donePoints = filteredTasks.filter(t => t.status === 'done').reduce((sum, t) => sum + (t.story_points || 0), 0);

  return (
    <DevPortalLayout user={user} title="Board">
      <div className="space-y-4">
        {/* Header with sprint selector */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Kanban Board</h1>
            <p className="text-xs text-gray-500 mt-0.5">{filteredTasks.length} tasks · {donePoints}/{totalPoints} points done</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedSprintId}
              onChange={e => setSelectedSprintId(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 font-medium"
            >
              <option value="all">All Tasks</option>
              <option value="backlog">Backlog (No Sprint)</option>
              {sprints.map(s => (
                <option key={s.id} value={s.id}>
                  {s.status === 'active' ? '🏃 ' : ''}{s.name} ({s.done_points || 0}/{s.assigned_points || 0}p)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sprint progress bar */}
        {activeSprint && (
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-4">
            <span className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${activeSprint.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{activeSprint.status}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${totalPoints > 0 ? (donePoints / totalPoints) * 100 : 0}%` }} />
            </div>
            <span className="text-2xs text-gray-500">{donePoints}/{totalPoints}p</span>
            <span className="text-2xs text-gray-400">{activeSprint.start_date || '—'} → {activeSprint.end_date || '—'}</span>
          </div>
        )}

        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.key);
            const colPoints = colTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
            return (
              <div key={col.key} className="min-w-[260px] w-[260px] shrink-0">
                <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${col.color}`}>
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{col.label}</h3>
                  <span className="text-2xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium">{colTasks.length}</span>
                  {colPoints > 0 && <span className="text-2xs text-gray-300 ml-auto">{colPoints}p</span>}
                </div>
                <div className="space-y-2">
                  {colTasks.map(t => (
                    <div key={t.id} onClick={() => router.push('/dev-portal/tasks/' + t.id)} className={`bg-white border rounded-xl p-3 hover:border-blue-300 transition-colors cursor-pointer group ${t.blocked_by_count > 0 ? 'border-red-300' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
                        <span className="text-2xs font-mono text-gray-500">{t.task_key}</span>
                        {t.is_ai_generated && <span className="text-2xs px-1 py-0.5 bg-indigo-500/20 text-indigo-400 rounded">AI</span>}
                        {t.blocked_by_count > 0 && (
                          <span className="ml-auto text-2xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium" title={`Blocked by ${t.blocked_by_count} open task${t.blocked_by_count === 1 ? '' : 's'}`}>
                            ⛔ {t.blocked_by_count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-900 font-medium">{t.title}</p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-500'}`} />
                          {t.story_points && <span className="text-2xs text-gray-500">{t.story_points}pt</span>}
                          {t.time_estimate && <span className="text-2xs text-gray-400">{t.time_spent || 0}/{t.time_estimate}h</span>}
                        </div>
                        {(t.assignee_display_name || t.assignee_name) && (
                          <span className="text-2xs text-gray-500">{t.assignee_is_ai ? '🤖' : ''} {t.assignee_display_name || t.assignee_name}</span>
                        )}
                      </div>
                      {/* Quick status change */}
                      <div className="hidden group-hover:flex gap-1 mt-2 pt-2 border-t border-gray-200 flex-wrap">
                        {COLUMNS.filter(c => c.key !== col.key).map(c => (
                          <button key={c.key} onClick={(e) => { e.stopPropagation(); moveTask(t.id, c.key); }} className="text-2xs px-2 py-1 bg-gray-50 text-gray-500 hover:text-gray-900 rounded transition-colors">
                            → {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && <div className="text-center py-8 text-2xs text-gray-400">No tasks</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DevPortalLayout>
  );
}
