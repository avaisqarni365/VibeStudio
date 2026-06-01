import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'testing', 'done', 'cancelled'];
const TYPES = ['epic', 'story', 'task', 'bug', 'improvement', 'spike', 'ai_task'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const TYPE_ICONS: Record<string, string> = { epic: '⚡', story: '📖', task: '✅', bug: '🐛', improvement: '✨', spike: '🔬', ai_task: '🤖' };
const PRIORITY_COLORS: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-400' };
const STATUS_COLORS: Record<string, string> = { backlog: 'text-gray-500', todo: 'text-amber-500', in_progress: 'text-blue-500', in_review: 'text-purple-500', testing: 'text-cyan-500', done: 'text-emerald-500', cancelled: 'text-red-400' };

const COMPONENTS = [
  { value: 'api', label: 'API Server', desc: 'Express routes, middleware' },
  { value: 'web', label: 'Web App', desc: 'Next.js pages, React' },
  { value: 'desktop', label: 'Desktop App', desc: 'Standalone .exe (planned)' },
  { value: 'mobile', label: 'Mobile App', desc: 'Expo / EAS (planned)' },
  { value: 'packages', label: 'Packages', desc: '@vibestudio/* shared libs' },
  { value: 'infrastructure', label: 'Infrastructure', desc: 'Migrations, seeds, deploy' },
  { value: 'domains', label: 'Domains', desc: 'Business logic services' },
  { value: 'dev-portal', label: 'Dev Portal', desc: 'This workspace' },
];

// VibeStudio's own modules — drive the AI Prompt Builder's domain context.
const VIBE_DOMAINS = [
  { name: 'board', label: 'Board & Tasks', desc: 'Kanban, task model, prompt builder' },
  { name: 'sprints', label: 'Sprints', desc: 'Planning, capacity, burndown' },
  { name: 'prompts', label: 'Prompt Library', desc: 'Reusable, shareable prompt templates' },
  { name: 'ai-chat', label: 'AI Chat', desc: 'Multi-provider chat (Claude/OpenAI/…)' },
  { name: 'agents', label: 'AI Agents', desc: 'Coding, QA, security, ops agents' },
  { name: 'channels', label: 'Channels & Inbox', desc: 'Threaded chat, notifications' },
  { name: 'wiki', label: 'Wiki & Docs', desc: 'Knowledge base, spaces, docs' },
  { name: 'activity', label: 'Activity Feed', desc: 'Event log, bookmarks' },
  { name: 'deployments', label: 'Deployments & Mobile', desc: 'EAS builds, OTA, environments' },
  { name: 'usage', label: 'AI Usage', desc: 'Per-user token + cost metrics' },
  { name: 'dev-portal', label: 'Dev Portal', desc: 'This workspace' },
];

function generateContext(domain: string): string {
  const d = VIBE_DOMAINS.find(x => x.name === domain);
  if (!d) return '';
  const map: Record<string, string> = {
    'board': 'Module: Board & Tasks\nService: domains/dev-portal/src/dev-portal-service.ts\nTables: dev_tasks, dev_task_comments, dev_task_dependencies, dev_views\nAPI: /api/v1/dev-portal/tasks, /api/v1/dev-portal/board\nRules: columns backlog→done, type/priority/story_points/labels, position orders cards, is_ai_generated flags AI work',
    'sprints': 'Module: Sprints\nService: domains/dev-portal/src/dev-portal-service.ts\nTables: dev_sprints\nAPI: /api/v1/dev-portal/sprints\nRules: status planned→active→completed, capacity_points vs completed_points, one active sprint per project, retrospective JSONB',
    'prompts': 'Module: Prompt Library\nService: domains/dev-portal/src/dev-portal-service.ts\nTables: dev_prompt_history\nAPI: /api/v1/dev-portal/prompts\nRules: log template/prompt/response_summary/model/tokens, is_shared exposes to team, set is_pii_redacted before sharing, roadmap = git-backed prompts/<slug>.md',
    'ai-chat': 'Module: AI Chat\nService: domains/dev-portal/src/ai-provider-service.ts\nTables: dev_prompt_history\nAPI: /api/v1/dev-portal/ai\nRules: providers Anthropic/OpenAI/DeepSeek/Moonshot/Groq, 503 if no key set (check process.env.<PROVIDER>_API_KEY), log every exchange, prefer latest Claude models',
    'agents': 'Module: AI Agents\nService: domains/dev-portal/src/dev-portal-service.ts\nTables: dev_team_members (is_ai_agent, agent_type)\nAPI: /api/v1/dev-portal/agents\nRules: agent_* role namespace, seeded types coding/QA/security/ops/analytics/release, assignable to tasks',
    'channels': 'Module: Channels & Inbox\nService: domains/dev-portal/src/dev-portal-service.ts\nTables: dev_channels, dev_channel_members, dev_messages, dev_inbox\nAPI: /api/v1/dev-portal/channels\nRules: threaded via reply_to_id, last_read_at unread counts, is_default channel auto-join, roadmap = SSE',
    'wiki': 'Module: Wiki & Docs\nService: domains/dev-portal/src/dev-portal-service.ts\nTables: dev_wiki_pages, dev_docs, dev_spaces, dev_favorites\nAPI: /api/v1/dev-portal/wiki, /api/v1/dev-portal/docs\nRules: parent_id hierarchy, markdown content, generateProjectWikiPages() auto-syncs from a live scan',
    'activity': 'Module: Activity Feed\nService: domains/dev-portal/src/dev-portal-service.ts\nTables: dev_activity_log, dev_bookmarks\nAPI: /api/v1/dev-portal/activity\nRules: logActivity(actor, action, entity_type, entity_id, summary, project_id) on every mutation, append-only, polled 30s (roadmap = SSE)',
    'deployments': 'Module: Deployments & Mobile\nService: domains/dev-portal/src/mobile-deploy-service.ts\nTables: dev_mobile_credentials, dev_mobile_builds, dev_mobile_ota_updates, dev_sessions\nAPI: /api/v1/dev-portal/deployments\nRules: AES-256-GCM encrypted credentials (MOBILE_DEPLOY_KEY), EAS Build/OTA records, dev_sessions for revocation',
    'usage': 'Module: AI Usage\nService: domains/dev-portal/src/ai-call-logger.ts\nTables: dev_prompt_history\nAPI: /api/v1/dev-portal/usage\nRules: aggregate tokens + cost per actor per period from dev_prompt_history',
  };
  return map[domain] || `Module: ${d.label}\nService: domains/dev-portal/src/dev-portal-service.ts\nAPI: /api/v1/dev-portal/${domain}`;
}

export default function DevPortalTasks() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [filters, setFilters] = useState<any>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', type: 'task', priority: 'medium', description: '', component: '', domain: '', assignee_id: '', due_date: '', story_points: '', time_estimate: '' });
  const [members, setMembers] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [sprintId, setSprintId] = useState('');

  useEffect(() => {
    if (!user) return;
    devApi('get', '/projects').then(r => {
      const p = r.data.data || [];
      setProjects(p);
      if (p[0]) {
        setProjectId(p[0].id);
        devApi('get', `/projects/${p[0].id}/sprints`).then(s => {
          const list = s.data.data || [];
          setSprints(list);
          // Default to active sprint
          const active = list.find((sp: any) => sp.status === 'active');
          if (active) setSprintId(active.id);
        });
      }
    });
    devApi('get', '/team').then(r => setMembers(r.data.data || []));
  }, [user]);

  useEffect(() => {
    if (!projectId) return;
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.type) params.set('type', filters.type);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.sprint_id) params.set('sprint_id', filters.sprint_id);
    if (filters.assignee_id) params.set('assignee_id', filters.assignee_id);
    if (filters.search) params.set('search', filters.search);
    devApi('get', `/projects/${projectId}/tasks?${params}`).then(r => setTasks(r.data.data || []));
  }, [projectId, filters]);

  const createTask = async () => {
    if (!newTask.title || !projectId) return;
    const payload: any = { ...newTask, sprint_id: sprintId || undefined };
    if (payload.story_points) payload.story_points = Number(payload.story_points);
    else delete payload.story_points;
    if (payload.time_estimate) payload.time_estimate = Number(payload.time_estimate);
    else delete payload.time_estimate;
    if (!payload.assignee_id) delete payload.assignee_id;
    if (!payload.due_date) delete payload.due_date;
    // Auto-add domain context to description
    if (newTask.domain && !newTask.description.includes('Domain:')) {
      payload.description = (newTask.description ? newTask.description + '\n\n' : '') + '--- VibeStudio Context ---\n' + generateContext(newTask.domain);
    }
    if (newTask.domain) payload.labels = [newTask.domain, newTask.component || 'domains'].filter(Boolean);
    await devApi('post', `/projects/${projectId}/tasks`, payload);
    setShowCreate(false);
    setNewTask({ title: '', type: 'task', priority: 'medium', description: '', component: '', domain: '', assignee_id: '', due_date: '', story_points: '', time_estimate: '' });
    // Keep sprint selection defaulted to active sprint
    const active = sprints.find((sp: any) => sp.status === 'active');
    setSprintId(active ? active.id : '');
    const r = await devApi('get', `/projects/${projectId}/tasks`);
    setTasks(r.data.data || []);
  };

  // Pre-fill description from domain selection
  const onDomainChange = (domain: string) => {
    setNewTask(prev => ({ ...prev, domain, component: domain === 'dev-portal' ? 'dev-portal' : 'domains' }));
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  return (
    <DevPortalLayout user={user} title="Tasks">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
            <p className="text-xs text-gray-500 mt-0.5">{tasks.length} tasks</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <input type="text" placeholder="Search tasks..." value={filters.search || ''} onChange={e => setFilters({ ...filters, search: e.target.value })}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 w-56" />
          <select value={filters.status || ''} onChange={e => setFilters({ ...filters, status: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
            <option value="">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={filters.type || ''} onChange={e => setFilters({ ...filters, type: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
          </select>
          <select value={filters.priority || ''} onChange={e => setFilters({ ...filters, priority: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
            <option value="">All Priority</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filters.sprint_id || ''} onChange={e => setFilters({ ...filters, sprint_id: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
            <option value="">All Sprints</option>
            {sprints.map(s => <option key={s.id} value={s.id}>{s.status === 'active' ? '🏃 ' : ''}{s.name}</option>)}
          </select>
          <select value={filters.assignee_id || ''} onChange={e => setFilters({ ...filters, assignee_id: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
            <option value="">All Assignees</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.is_ai_agent ? '🤖 ' : ''}{m.display_name || m.name}</option>)}
          </select>
          {Object.values(filters).some(Boolean) && (
            <button onClick={() => setFilters({})} className="text-2xs text-gray-400 hover:text-red-500 px-2">Clear all</button>
          )}
        </div>

        {/* ── Create Task Form ── */}
        {showCreate && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">New Task</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title — e.g. 'Add prompt A/B test export'"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />

              {/* Domain Selection — Key feature */}
              <div>
                <label className="text-2xs text-gray-500 font-semibold uppercase tracking-wider mb-2 block">Domain (auto-generates context)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
                  {VIBE_DOMAINS.map(d => (
                    <button key={d.name} type="button" onClick={() => onDomainChange(d.name)}
                      className={`text-left px-3 py-2 rounded-lg text-xs transition-colors border ${newTask.domain === d.name ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50 hover:border-gray-200'}`}>
                      <p className="font-medium truncate">{d.label}</p>
                      <p className="text-2xs text-gray-400 truncate mt-0.5">{d.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <textarea value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                placeholder={"What needs to be done?\n\nAcceptance criteria, affected files, related pages..."}
                rows={4} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500/20" />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Type</label>
                  <select value={newTask.type} onChange={e => setNewTask({ ...newTask, type: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700">
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Priority</label>
                  <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700">
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Assign To</label>
                  <select value={newTask.assignee_id} onChange={e => setNewTask({ ...newTask, assignee_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700">
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.is_ai_agent ? '🤖 ' : ''}{m.display_name || m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Story Points</label>
                  <select value={newTask.story_points} onChange={e => setNewTask({ ...newTask, story_points: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700">
                    <option value="">—</option>
                    {[1, 2, 3, 5, 8, 13, 21].map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Time Estimate (h)</label>
                  <input type="number" min="0" step="0.5" value={newTask.time_estimate} onChange={e => setNewTask({ ...newTask, time_estimate: e.target.value })} placeholder="e.g. 4" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700" />
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Component</label>
                  <select value={newTask.component} onChange={e => setNewTask({ ...newTask, component: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700">
                    <option value="">Select</option>
                    {COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Sprint</label>
                  <select value={sprintId} onChange={e => setSprintId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700">
                    <option value="">Backlog</option>
                    {sprints.filter(s => s.status !== 'completed').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-medium mb-1 block">Due Date</label>
                  <input type="date" value={newTask.due_date} onChange={e => setNewTask({ ...newTask, due_date: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700" />
                </div>
                <div className="flex items-end">
                  <div className="flex gap-2 w-full">
                    <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg font-medium">Cancel</button>
                    <button onClick={createTask} disabled={!newTask.title.trim()} className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold rounded-lg transition-colors">Create</button>
                  </div>
                </div>
              </div>

              {/* Domain context preview */}
              {newTask.domain && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  <p className="text-2xs font-semibold text-indigo-700 mb-1">Auto-attached VibeStudio context for: {VIBE_DOMAINS.find(d => d.name === newTask.domain)?.label}</p>
                  <pre className="text-2xs text-indigo-600 whitespace-pre-wrap">{generateContext(newTask.domain)}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Task List ── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase tracking-wider">
            <span>Type</span><span>Task</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due</span><span>Pts</span>
          </div>
          {tasks.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <span className="text-3xl block mb-2">📋</span>
              <p className="text-sm text-gray-500">No tasks found</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium">Create your first task</button>
            </div>
          ) : tasks.map(t => (
            <div key={t.id} onClick={() => router.push('/dev-portal/tasks/' + t.id)}
              className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-3 px-4 py-3 border-b border-gray-50 hover:bg-indigo-50/30 transition-colors items-center cursor-pointer">
              <span className="text-base" title={t.type}>{TYPE_ICONS[t.type] || '✅'}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-mono text-gray-400">{t.task_key}</span>
                  <span className="text-xs text-gray-900 font-medium truncate">{t.title}</span>
                  {t.is_ai_generated && <span className="text-2xs px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded font-medium">AI</span>}
                </div>
                {(() => { try { const arr = typeof t.labels === 'string' ? JSON.parse(t.labels || '[]') : (t.labels || []); return arr.length > 0 ? (
                  <div className="flex gap-1 mt-0.5">{arr.map((l: string) => <span key={l} className="text-2xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{l}</span>)}</div>
                ) : null; } catch { return null; } })()}
              </div>
              <span className={`text-2xs font-medium capitalize ${STATUS_COLORS[t.status] || 'text-gray-500'}`}>{t.status.replace(/_/g, ' ')}</span>
              <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[t.priority]}`} /><span className="text-2xs text-gray-500 capitalize">{t.priority}</span></span>
              <span className="text-2xs text-gray-500 truncate max-w-[80px]">{t.assignee_is_ai ? '🤖 ' : ''}{t.assignee_display_name || t.assignee_name || '—'}</span>
              <span className={`text-2xs ${t.due_date && t.due_date < new Date().toISOString().split('T')[0] && t.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{t.due_date ? new Date(t.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}</span>
              <span className="text-2xs text-gray-400 font-mono w-6 text-center">{t.story_points || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </DevPortalLayout>
  );
}
