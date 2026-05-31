import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

const STATUS_COLORS: Record<string, string> = { backlog: 'text-gray-500', todo: 'text-amber-400', in_progress: 'text-blue-400', in_review: 'text-purple-400', testing: 'text-cyan-400', done: 'text-emerald-400' };
const PRIORITY_DOT: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-500' };
const TYPE_ICONS: Record<string, string> = { epic: '⚡', story: '📖', task: '✅', bug: '🐛', improvement: '✨', spike: '🔬', ai_task: '🤖' };

export default function DevPortalMyTasks() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [tasks, setTasks] = useState<any[]>([]);
  const [tab, setTab] = useState<'assigned' | 'today' | 'created'>('assigned');

  useEffect(() => {
    if (!user) return;
    if (activeProjectId) {
      devApi('get', `/projects/${activeProjectId}/tasks?assignee_id=${user.id}`).then(t => setTasks(t.data.data || []));
    } else {
      devApi('get', '/projects').then(r => {
        const projects = r.data.data || [];
        if (projects[0]) {
          devApi('get', `/projects/${projects[0].id}/tasks?assignee_id=${user.id}`).then(t => setTasks(t.data.data || []));
        }
      });
    }
  }, [user, activeProjectId]);

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  const today = new Date().toISOString().split('T')[0];
  const filteredTasks = tab === 'today'
    ? tasks.filter(t => t.due_date && t.due_date <= today && t.status !== 'done')
    : tab === 'created'
    ? tasks
    : tasks.filter(t => t.status !== 'done');

  return (
    <DevPortalLayout user={user} title="My Tasks">
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">My Tasks</h1>

        <div className="flex gap-2">
          {[
            { key: 'assigned', label: 'Assigned to me' },
            { key: 'today', label: 'Today & Overdue' },
            { key: 'created', label: 'All my tasks' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-3 py-1.5 text-xs rounded-md ${tab === t.key ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
              {t.key === 'today' && tasks.filter(tk => tk.due_date && tk.due_date <= today && tk.status !== 'done').length > 0 && (
                <span className="ml-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-2xs inline-flex items-center justify-center font-bold">
                  {tasks.filter(tk => tk.due_date && tk.due_date <= today && tk.status !== 'done').length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><span className="text-4xl block mb-3">🎉</span><p className="text-sm">No tasks!</p></div>
          ) : filteredTasks.map(t => (
            <div key={t.id} onClick={() => router.push('/dev-portal/tasks/' + t.id)} className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 transition-colors cursor-pointer">
              <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
              <span className="text-2xs font-mono text-gray-400">{t.task_key}</span>
              <span className="text-xs text-gray-900 font-medium flex-1 truncate">{t.title}</span>
              <span className={`text-2xs font-medium capitalize ${STATUS_COLORS[t.status] || 'text-gray-500'}`}>{t.status.replace(/_/g, ' ')}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-500'}`} />
              {t.due_date && <span className={`text-2xs ${t.due_date <= today ? 'text-red-400' : 'text-gray-500'}`}>{t.due_date}</span>}
            </div>
          ))}
        </div>
      </div>
    </DevPortalLayout>
  );
}
