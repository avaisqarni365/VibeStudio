import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

const TYPE_ICONS: Record<string, string> = { epic: '⚡', story: '📖', task: '✅', bug: '🐛', improvement: '✨', spike: '🔬', ai_task: '🤖' };
const PRIORITY_COLORS: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-400' };
const STATUS_COLORS: Record<string, string> = { backlog: 'bg-gray-400', todo: 'bg-amber-500', in_progress: 'bg-blue-500', in_review: 'bg-purple-500', testing: 'bg-cyan-500', done: 'bg-emerald-500', cancelled: 'bg-red-400' };
const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'testing', 'done'];
const TYPES = ['epic', 'story', 'task', 'bug', 'improvement', 'spike', 'ai_task'];

// ── Domain Knowledge Base ──
const DOMAIN_KB: Record<string, { label: string; tables: string[]; api: string; rules: string[]; affects: string[]; docs: string[]; pages: string[] }> = {
  board: { label: 'Board & Tasks', tables: ['dev_tasks','dev_task_comments','dev_task_dependencies','dev_views'], api: '/api/v1/dev-portal/tasks', rules: ['Kanban columns: backlog → todo → in_progress → in_review → testing → done','type / priority / story_points / labels per task','position column drives ordering within a column','is_ai_generated flags AI-authored tasks'], affects: ['sprints','activity','prompts'], docs: ['CLAUDE.md','ACTION_PLAN.md'], pages: ['/dev-portal/board','/dev-portal/tasks'] },
  sprints: { label: 'Sprints', tables: ['dev_sprints'], api: '/api/v1/dev-portal/sprints', rules: ['status: planned → active → completed','capacity vs completed story points','only one active sprint at a time','retrospective stored as JSONB'], affects: ['board','activity'], docs: ['ACTION_PLAN.md'], pages: ['/dev-portal/sprints','/dev-portal/gantt'] },
  prompts: { label: 'Prompt Library', tables: ['dev_prompt_history'], api: '/api/v1/dev-portal/prompts', rules: ['Log template / prompt / model / tokens per run','is_shared toggles team visibility','is_pii_redacted must be true before sharing','Roadmap: git-backed prompts/<slug>.md artefacts'], affects: ['ai-chat','board','usage'], docs: ['MIGRATION_GUIDE.md'], pages: ['/dev-portal/prompts'] },
  'ai-chat': { label: 'AI Chat', tables: ['dev_prompt_history'], api: '/api/v1/dev-portal/ai', rules: ['Providers: Anthropic / OpenAI / DeepSeek / Moonshot / Groq','Returns 503 if no provider key is configured','Prefer latest Claude models','Each turn logged to dev_prompt_history'], affects: ['prompts','usage','agents'], docs: ['CLAUDE.md'], pages: ['/dev-portal/ai'] },
  agents: { label: 'AI Agents', tables: ['dev_team_members'], api: '/api/v1/dev-portal/agents', rules: ['is_ai_agent + agent_type distinguish AI members','agent_* roles assignable to tasks','Seeded: coding / QA / security / ops / analytics / release','Agents can author comments and tasks'], affects: ['board','ai-chat'], docs: [], pages: ['/dev-portal/agents'] },
  channels: { label: 'Channels & Inbox', tables: ['dev_channels','dev_channel_members','dev_messages','dev_inbox'], api: '/api/v1/dev-portal/channels', rules: ['Threaded replies via reply_to_id','last_read_at drives unread counts','is_default channels auto-join new members','Inbox aggregates mentions and DMs'], affects: ['activity'], docs: [], pages: ['/dev-portal/channels','/dev-portal/inbox'] },
  wiki: { label: 'Wiki & Docs', tables: ['dev_wiki_pages','dev_docs','dev_spaces','dev_favorites'], api: '/api/v1/dev-portal/wiki', rules: ['parent_id builds page hierarchy','Markdown content','Auto-sync docs from repo scan','Favorites pin frequently used pages'], affects: ['activity'], docs: ['README.md'], pages: ['/dev-portal/wiki','/dev-portal/knowledge'] },
  deployments: { label: 'Deployments & Mobile', tables: ['dev_mobile_credentials','dev_mobile_builds','dev_mobile_ota_updates','dev_sessions'], api: '/api/v1/dev-portal/deployments', rules: ['AES-256-GCM encrypted creds (MOBILE_DEPLOY_KEY)','EAS Build + OTA update tracking','dev_sessions support revocation','Build status history per release'], affects: ['activity'], docs: [], pages: ['/dev-portal/deployments','/dev-portal/environments'] },
};

// ── Prompt Templates ──
const PROMPT_TEMPLATES = [
  { id: 'new_feature', name: 'New Feature', icon: '✨', desc: 'Full stack: migration + service + route + page', template: `Add a [FEATURE NAME] feature to VibeStudio.

## Page
New page at /dev-portal/[path].
Add to the DevPortalLayout sidebar under "[section]".

## Database (Migration 081)
Table: dev_[table_name]
- id (uuid PK, gen_random_uuid)
- [columns...]
- created_at, updated_at (timestamps)

## API Endpoints
POST /api/v1/dev-portal/[resource] — create
GET /api/v1/dev-portal/[resource] — list
PUT /api/v1/dev-portal/[resource]/:id — update
DELETE /api/v1/dev-portal/[resource]/:id — delete

## Frontend
- Hero with gradient
- Table/list with filters
- Create/edit modal
- Status badges

## Auth & Access
All routes require dev_portal_token auth (httpOnly cookie + Bearer fallback).
RLS on dev_* tables: SET LOCAL app.current_member_id in direct DB scripts.
Next migration: 081.` },
  { id: 'bug_fix', name: 'Bug Fix', icon: '🐛', desc: 'Debug + fix with context', template: `Bug on http://localhost:3100/dev-portal/[page-url]
Logged in as: [user@codes-ai.uk]

What I see: [describe the bug]
Expected: [what should happen]

Console error: [paste error]
at [file:line]

Steps to reproduce:
1. [step 1]
2. [step 2]

Fix Rules:
- Keep dev_portal_token auth + RLS on dev_* tables intact
- All API responses: { success, data, error }
- React hooks before any conditional return
- Prefer latest Claude models for any AI calls` },
  { id: 'api_endpoint', name: 'API Endpoint', icon: '🔌', desc: 'New REST endpoint', template: `Add new API endpoint to VibeStudio:

Endpoint: [METHOD] /api/v1/dev-portal/[resource]/[path]
Auth: dev_portal_token (httpOnly cookie + Bearer fallback)
Input: { [fields] }
Output: { success: true, data: { [fields] } }

Service: domains/dev-portal/src/dev-portal-service.ts
Route file: apps/api/src/routes/dev-portal.ts
Frontend call: devApi('get' | 'post' | ..., '/[resource]') via apps/web/src/hooks/useDevAuth.ts

Data lives in dev_* tables (RLS via SET LOCAL app.current_member_id).
Validate inputs before hitting the service layer.` },
  { id: 'page', name: 'Frontend Page', icon: '🖥', desc: 'New Next.js page', template: `Create a new page at /dev-portal/[path].

## Requirements
- Use DevPortalLayout + useDevAuth()
- Tab-based design with [tabs]
- Data from API: GET /api/v1/dev-portal/[endpoint] via devApi
- Table with columns: [columns]
- Filters: [filters]
- Create modal with form fields

## UI Pattern
- Hero gradient (from-[color]-50 to-[color]-50)
- Cards with border border-gray-200 rounded-xl
- Status badges, progress bars

## Auth
useDevAuth() returns { user }; guard with an early return while loading or unauthenticated.
Page lives under apps/web/src/pages/dev-portal/.` },
  { id: 'migration', name: 'DB Migration', icon: '🗄', desc: 'New database table', template: `Create migration 081 for dev_[table_name]:

Columns:
- id (uuid, PK, gen_random_uuid)
- [column] ([type]) — [description]
- created_at (timestamp, default now)
- updated_at (timestamp, default now)

File: infrastructure/migrations/081_create_[name].js
Pattern: exports.up/down with knex.schema, guard with hasTable / hasColumn
Rules: snake_case, uuid PKs, tables prefixed dev_, JSONB for flexible data` },
  { id: 'refactor', name: 'Refactor', icon: '♻', desc: 'Code improvement', template: `Refactor: [what to refactor]

Current state: [describe current code/pattern]
Problem: [why it needs refactoring]
Target: [desired outcome]

Files to change:
- [file1]
- [file2]

Constraints:
- Don't break existing API contracts ({ success, data, error })
- Keep dev_portal_token auth + RLS on dev_* tables intact
- Keep backward compatibility
- Update tests if affected` },
];

// ── Project .md Files ──
const PROJECT_DOCS = [
  { cat: 'Project Docs', files: ['CLAUDE.md','README.md','ACTION_PLAN.md','MIGRATION_GUIDE.md'] },
];

export default function TaskDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [task, setTask] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sprints, setSprints] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'prompt' | 'knowledge' | 'docs' | 'activity'>('details');
  const [taskActivity, setTaskActivity] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [copied, setCopied] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [timeLogHours, setTimeLogHours] = useState('');

  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    if (!user || !id) return;
    loadTask();
    devApi('get', '/team').then(r => setMembers(r.data.data || []));
    if (activeProjectId) {
      setProjectId(activeProjectId);
      devApi('get', `/projects/${activeProjectId}/sprints`).then(s => setSprints(s.data.data || []));
    } else {
      devApi('get', '/projects').then(r => {
        if (r.data.data?.[0]) {
          setProjectId(r.data.data[0].id);
          devApi('get', `/projects/${r.data.data[0].id}/sprints`).then(s => setSprints(s.data.data || []));
        }
      });
    }
  }, [user, id, activeProjectId]);

  useEffect(() => {
    if (task) setPromptText(buildFullPrompt(task, selectedTemplate));
  }, [task, selectedTemplate]);

  const loadTask = () => { if (id) devApi('get', `/tasks/${id}`).then(r => setTask(r.data.data)); };

  const updateField = async (field: string, value: any) => {
    await devApi('put', `/tasks/${id}`, { [field]: value });
    loadTask();
    setEditing(null);
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    await devApi('post', `/tasks/${id}/comments`, { content: newComment });
    setNewComment('');
    loadTask();
  };

  const copyPrompt = async () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Auto-save to prompt history
    if (projectId && task) {
      const labels = (() => { try { return typeof task.labels === 'string' ? JSON.parse(task.labels || '[]') : (task.labels || []); } catch { return []; } })();
      devApi('post', `/projects/${projectId}/prompts`, {
        task_id: task.id,
        template: selectedTemplate || 'custom',
        title: `${task.task_key}: ${task.title}`,
        prompt: promptText,
        labels,
        metadata: { task_key: task.task_key, component: task.component, story_points: task.story_points },
      }).catch(() => {}); // fire-and-forget
    }
  };

  const logTime = async () => {
    const h = parseFloat(timeLogHours);
    if (!h || h <= 0 || !id) return;
    await devApi('post', `/tasks/${id}/time-log`, { hours: h });
    setTimeLogHours('');
    loadTask();
  };

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => setImages(prev => [...prev, reader.result as string]);
          reader.readAsDataURL(file);
        }
      }
    }
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  if (!task) return <DevPortalLayout user={user} title="Task"><div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div></DevPortalLayout>;

  const labels = (() => { try { return typeof task.labels === 'string' ? JSON.parse(task.labels || '[]') : (task.labels || []); } catch { return []; } })();
  const domainKey = labels.find((l: string) => DOMAIN_KB[l]) || task.component || '';
  const domainInfo = DOMAIN_KB[domainKey] || null;

  return (
    <DevPortalLayout user={user} title={task.task_key}>
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link href="/dev-portal/tasks" className="hover:text-gray-700">Tasks</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{task.task_key}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-2xs px-2 py-0.5 rounded-full font-medium text-white ${STATUS_COLORS[task.status]}`}>{task.status.replace(/_/g, ' ')}</span>
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} title={task.priority} />
          </div>
        </div>

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{TYPE_ICONS[task.type] || '✅'}</span>
            <span className="text-sm font-mono text-gray-400">{task.task_key}</span>
            {task.is_ai_generated && <span className="text-2xs px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-md font-medium">AI Generated</span>}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{task.title}</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-200 pb-px">
          {[
            { key: 'details', label: 'Details & Comments', icon: '📝' },
            { key: 'activity', label: 'Activity', icon: '📊' },
            { key: 'prompt', label: 'AI Prompt Builder', icon: '🤖' },
            { key: 'knowledge', label: 'Module Knowledge', icon: '📚' },
            { key: 'docs', label: 'Project Docs', icon: '📂' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-1.5 -mb-px ${activeTab === t.key ? 'bg-white border border-gray-200 border-b-white text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-5">
          {/* MAIN CONTENT */}
          <div className="flex-1 min-w-0 space-y-5">

            {activeTab === 'details' && (<>
              {/* Description */}
              <Card title="Description">
                {editing === 'description' ? (
                  <div>
                    <textarea value={editValue} onChange={e => setEditValue(e.target.value)} rows={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => updateField('description', editValue)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg">Save</button>
                      <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-gray-500 text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div onClick={() => { setEditing('description'); setEditValue(task.description || ''); }} className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 min-h-[60px]">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description || 'Click to add description...'}</p>
                  </div>
                )}
              </Card>

              {/* Images */}
              {images.length > 0 && (
                <Card title={`Attachments (${images.length})`}>
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((img, i) => (
                      <div key={i} className="relative group">
                        <img src={img} alt={`Attachment ${i + 1}`} className="rounded-lg border border-gray-200 max-h-48 w-full object-cover" />
                        <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-2xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              <div onPaste={handleImagePaste} className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-3 text-center">
                <p className="text-2xs text-gray-400">Paste images here (Ctrl+V) to attach screenshots</p>
              </div>

              {/* Subtasks */}
              {task.subtasks?.length > 0 && (
                <Card title={`Subtasks (${task.subtasks.length})`}>
                  <div className="space-y-1.5">
                    {task.subtasks.map((st: any) => (
                      <div key={st.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => router.push('/dev-portal/tasks/' + st.id)}>
                        <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[st.status] || 'bg-gray-400'}`} />
                        <span className="text-2xs font-mono text-gray-400">{st.task_key}</span>
                        <span className="text-xs text-gray-700 flex-1">{st.title}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Comments */}
              <Card title={`Comments (${task.comments?.length || 0})`}>
                <div className="space-y-4">
                  {(task.comments || []).map((c: any) => (
                    <div key={c.id} className="flex gap-3">
                      <div className={`w-8 h-8 rounded-lg ${c.author_is_ai ? 'bg-indigo-500' : 'bg-blue-500'} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {c.author_is_ai ? '🤖' : (c.author_display_name?.[0] || c.author_name?.[0] || '?')}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-900">{c.author_display_name || c.author_name}</span>
                          {c.type === 'status_change' && <span className="text-2xs px-1 py-0.5 bg-amber-100 text-amber-600 rounded">Status</span>}
                          <span className="text-2xs text-gray-400">{new Date(c.created_at).toLocaleString('de-DE')}</span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={3} placeholder="Add a comment..." className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20" />
                  <div className="flex justify-end mt-2">
                    <button onClick={addComment} disabled={!newComment.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold rounded-lg">Comment</button>
                  </div>
                </div>
              </Card>
            </>)}

            {activeTab === 'prompt' && (<>
              {/* Template Selection */}
              <Card title="Prompt Templates">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {PROMPT_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => setSelectedTemplate(t.id === selectedTemplate ? null : t.id)}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${selectedTemplate === t.id ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{t.icon}</span>
                        <span className="text-xs font-semibold">{t.name}</span>
                      </div>
                      <p className="text-2xs text-gray-400 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
                {selectedTemplate && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-2xs font-semibold text-amber-700">Template: {PROMPT_TEMPLATES.find(t => t.id === selectedTemplate)?.name}</p>
                    <p className="text-2xs text-amber-600 mt-0.5">This template is merged with the task context below. Edit the prompt as needed.</p>
                  </div>
                )}
              </Card>

              {/* Generated Prompt */}
              <Card title="Generated Prompt — Ready for Claude / AI">
                <textarea value={promptText} onChange={e => setPromptText(e.target.value)} rows={20}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:ring-2 focus:ring-indigo-500/20 leading-relaxed" />
                <div className="flex items-center justify-between mt-3">
                  <p className="text-2xs text-gray-400">{promptText.length} characters · {promptText.split('\n').length} lines</p>
                  <div className="flex gap-2">
                    <button onClick={() => setPromptText(buildFullPrompt(task, selectedTemplate))} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">Regenerate</button>
                    <button onClick={copyPrompt} className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${copied ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                      {copied ? '✓ Copied!' : '📋 Copy Prompt'}
                    </button>
                  </div>
                </div>
              </Card>

              {/* Attached Images for Prompt */}
              <Card title="Screenshot Attachments">
                <div onPaste={handleImagePaste} className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-4 text-center min-h-[80px]">
                  {images.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {images.map((img, i) => (
                        <div key={i} className="relative group">
                          <img src={img} alt="" className="rounded-lg border border-gray-200 h-24 w-full object-cover" />
                          <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-2xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xs text-gray-400 py-3">Paste screenshots here (Ctrl+V) and they are attached to the prompt context</p>
                  )}
                </div>
              </Card>

              {/* AI Context Engineering */}
              <Card title="Context Quality Analysis">
                {(() => {
                  const checks = [
                    { label: 'Task context', pass: promptText.includes('Task') && promptText.includes(task.task_key), tip: 'Include task key and title for traceability' },
                    { label: 'Module specified', pass: !!domainInfo || promptText.includes('Module:'), tip: 'Add a module label to auto-inject tables, API, rules' },
                    { label: 'Auth and access rule', pass: promptText.includes('dev_portal_token') || promptText.includes('app.current_member_id'), tip: 'Mention dev_portal_token auth + RLS on dev_* tables' },
                    { label: 'DB schema context', pass: promptText.includes('Table:') || promptText.includes('tables:') || promptText.includes('snake_case') || promptText.includes('dev_'), tip: 'Include relevant dev_* table names and column conventions' },
                    { label: 'API contract', pass: promptText.includes('{ success') || promptText.includes('/api/v1/dev-portal/'), tip: 'Specify API response format: { success, data, error }' },
                    { label: 'Provider noted', pass: promptText.includes('Claude') || promptText.includes('Anthropic') || promptText.includes('provider'), tip: 'Prefer latest Claude models; 503 if no provider key set' },
                    { label: 'Migration guard', pass: promptText.includes('hasTable') || promptText.includes('081') || promptText.includes('migration'), tip: 'New tables: Migration 081 with knex up/down + hasTable guards' },
                    { label: 'Template used', pass: !!selectedTemplate, tip: 'Select a template to structure your prompt professionally' },
                    { label: 'Acceptance criteria', pass: promptText.includes('expect') || promptText.includes('should') || promptText.includes('must') || promptText.length > 500, tip: 'Add clear what-should-happen criteria' },
                  ];
                  const passed = checks.filter(c => c.pass).length;
                  const score = Math.round((passed / checks.length) * 100);
                  const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
                  const gradeColor = score >= 90 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : score >= 70 ? 'text-blue-600 bg-blue-50 border-blue-200' : score >= 50 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200';
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-black ${gradeColor}`}>{grade}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-gray-900">{score}% Context Quality</span>
                            <span className="text-2xs text-gray-400">{passed}/{checks.length} checks passed</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {checks.map((c, i) => (
                          <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-2xs ${c.pass ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
                            <span className="shrink-0 mt-0.5">{c.pass ? '✓' : '○'}</span>
                            <div>
                              <span className={c.pass ? 'font-medium' : ''}>{c.label}</span>
                              {!c.pass && <p className="text-gray-400 mt-0.5">{c.tip}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </Card>

              {/* Context Tips */}
              <Card title="AI Context Engineering Tips">
                <div className="space-y-2">
                  {[
                    { icon: '🎯', title: 'Be Specific, Not Vague', tip: 'Instead of fix the bug, say: fix the board where dragging a card to in_progress does not update position in dev_tasks.' },
                    { icon: '📐', title: 'Include Architecture Constraints', tip: 'Always mention: dev_portal_token auth, dev_* tables, { success, data, error } API format, React hooks before returns.' },
                    { icon: '🔗', title: 'Reference Existing Patterns', tip: 'Say: follow the same pattern as the sprints module in dev-portal-service.ts. Claude will read that code and replicate the structure.' },
                    { icon: '🧪', title: 'Define Acceptance Criteria', tip: 'Add Expected: X should happen when Y so the AI knows what success looks like.' },
                    { icon: '🤖', title: 'Name the Provider', tip: 'Prefer the latest Claude models for AI features; remember the API returns 503 when no provider key is set.' },
                    { icon: '⚡', title: 'One Task Per Prompt', tip: 'A prompt that does one thing well beats a prompt that attempts five things poorly.' },
                    { icon: '📊', title: 'Provide Sample Data', tip: 'Include example inputs/outputs: given task VS-12 moved to done, expect completed_at set and story_points counted toward the active sprint.' },
                    { icon: '🛡', title: 'State What NOT to Do', tip: 'Constraints prevent mistakes: do NOT bypass dev_portal_token auth, do NOT add a multi-tenant org model.' },
                  ].map((tip, i) => (
                    <div key={i} className="flex gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <span className="text-sm shrink-0">{tip.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{tip.title}</p>
                        <p className="text-2xs text-gray-500 mt-0.5">{tip.tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Quick Context Injectors */}
              <Card title="Quick Context Inject">
                <p className="text-2xs text-gray-500 mb-2">Click to append project-specific context to your prompt:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Auth & Access', text: '\n\n## Auth & Access\n- dev_portal_token auth: httpOnly cookie + Bearer fallback\n- RLS on dev_* tables via SET LOCAL app.current_member_id (direct DB scripts)\n- No multi-tenant org model — security = dev_portal_token + RLS\n' },
                    { label: 'API Response Format', text: '\n\n## API Response Contract\n- Success: { success: true, data: T }\n- Error: { success: false, error: { code: string, message: string } }\n- Routes: apps/api/src/routes/dev-portal.ts -> domains/dev-portal/src/dev-portal-service.ts\n- Frontend: devApi(method, path) via apps/web/src/hooks/useDevAuth.ts\n' },
                    { label: 'DB Conventions', text: '\n\n## Database Conventions\n- Columns: snake_case, UUID PKs (gen_random_uuid), timestamps (created_at, updated_at)\n- Flexible data: JSONB\n- All tables prefixed dev_\n- Next migration: 081 (knex up/down + hasTable / hasColumn guards)\n' },
                    { label: 'React Hooks Rule', text: '\n\n## React Hooks Rule\nAll useState, useEffect, useMemo, useCallback MUST come before any conditional return (return null, return loading).\nNever put hooks after an early return.\n' },
                    { label: 'AI Providers', text: '\n\n## AI Providers\n- Supported: Anthropic / OpenAI / DeepSeek / Moonshot / Groq\n- Prefer the latest Claude models\n- API returns 503 if no provider key is configured\n- Each run logged to dev_prompt_history\n' },
                    { label: 'Auth Pattern', text: '\n\n## Auth Pattern\n- DevPortal JWT in the dev_portal_token cookie (httpOnly)\n- useDevAuth() returns { user } (no acca_token, no orgId)\n- Bearer fallback supported for API clients\n' },
                    { label: 'Full Project Stats', text: '\n\n## VibeStudio Project Stats\n- Turborepo + npm workspaces, Node >= 20, TypeScript strict\n- API: Express on :4100, Web: Next.js Pages Router on :3100, DB tunnel on 127.0.0.1:5545\n- Single dev-portal route + single service (domains/dev-portal/src/dev-portal-service.ts), 29 dev_* tables\n- Repo: github.com/codes-ai/vibestudio · Demo identity: @codes-ai.uk\n' },
                  ].map((ctx, i) => (
                    <button key={i} onClick={() => setPromptText(prev => prev + ctx.text)}
                      className="text-left px-3 py-2 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                      <span className="text-2xs font-medium text-gray-700">{ctx.label}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </>)}

            {activeTab === 'knowledge' && (<>
              {domainInfo ? (
                <>
                  <Card title={`Module: ${domainInfo.label}`}>
                    <div className="space-y-4">
                      <div>
                        <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Database Tables</p>
                        <div className="flex flex-wrap gap-1.5">
                          {domainInfo.tables.map(t => <span key={t} className="text-2xs px-2 py-1 bg-purple-50 text-purple-700 rounded-lg font-mono">{t}</span>)}
                        </div>
                      </div>
                      <div>
                        <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1">API Endpoints</p>
                        <p className="text-xs text-gray-700 font-mono">{domainInfo.api}</p>
                      </div>
                      <div>
                        <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Business Rules</p>
                        <ul className="space-y-1">
                          {domainInfo.rules.map((r, i) => <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-indigo-400 shrink-0">•</span>{r}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1">App Pages</p>
                        <div className="flex flex-wrap gap-1.5">
                          {domainInfo.pages.map(p => <a key={p} href={p} target="_blank" rel="noopener" className="text-2xs px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">{p}</a>)}
                        </div>
                      </div>
                    </div>
                  </Card>
                  <Card title="Cross-Module Impact">
                    <p className="text-xs text-gray-500 mb-3">Changes to <b>{domainInfo.label}</b> may affect these modules:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {domainInfo.affects.map(a => {
                        const affected = DOMAIN_KB[a];
                        return affected ? (
                          <div key={a} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                            <span className="text-amber-500 text-xs mt-0.5">⚠</span>
                            <div>
                              <p className="text-xs font-semibold text-gray-800">{affected.label}</p>
                              <p className="text-2xs text-gray-500">Tables: {affected.tables.slice(0, 3).join(', ')}</p>
                            </div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </Card>
                  {domainInfo.docs.length > 0 && (
                    <Card title="Related Documentation">
                      <div className="space-y-1.5">
                        {domainInfo.docs.map(d => (
                          <div key={d} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50">
                            <span className="text-gray-400">📄</span>
                            <span className="text-xs text-gray-700 font-mono">{d}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </>
              ) : (
                <Card title="Module Knowledge">
                  <p className="text-sm text-gray-500 py-6 text-center">Add a module label to this task to see related tables, APIs, rules, and cross-module impact.</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(DOMAIN_KB).map(([key, val]) => (
                      <button key={key} onClick={() => updateField('labels', JSON.stringify([...labels, key]))} className="text-left px-3 py-2 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                        <p className="text-xs font-medium text-gray-700">{val.label}</p>
                        <p className="text-2xs text-gray-400">{val.tables.length} tables · {val.rules.length} rules</p>
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </>)}

            {activeTab === 'activity' && (<>
              <Card title="Task Activity Timeline">
                <div className="space-y-0">
                  {/* Built-in timeline from task data */}
                  {[
                    ...(task.created_at ? [{ time: task.created_at, icon: '➕', label: 'Task created', detail: `by ${task.reporter_name || 'Unknown'}`, color: 'bg-gray-400' }] : []),
                    ...(task.started_at ? [{ time: task.started_at, icon: '▶', label: 'Work started', detail: task.assignee_display_name || task.assignee_name || '', color: 'bg-blue-500' }] : []),
                    ...(task.completed_at ? [{ time: task.completed_at, icon: '✅', label: 'Completed', detail: `${task.story_points || 0}p · ${task.time_spent || 0}h spent`, color: 'bg-emerald-500' }] : []),
                    ...(task.comments || []).filter((c: any) => c.type === 'status_change').map((c: any) => ({
                      time: c.created_at,
                      icon: '🔄',
                      label: c.content,
                      detail: c.author_display_name || c.author_name,
                      color: 'bg-amber-500',
                    })),
                    ...(task.comments || []).filter((c: any) => c.type === 'comment').map((c: any) => ({
                      time: c.created_at,
                      icon: '💬',
                      label: `Comment by ${c.author_display_name || c.author_name}`,
                      detail: c.content.length > 80 ? c.content.substring(0, 80) + '...' : c.content,
                      color: c.author_is_ai ? 'bg-indigo-500' : 'bg-blue-400',
                    })),
                  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()).map((ev, i) => (
                    <div key={i} className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-full ${ev.color} flex items-center justify-center text-white text-2xs shrink-0`}>{ev.icon}</div>
                        {i < 99 && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-800 font-medium">{ev.label}</p>
                        {ev.detail && <p className="text-2xs text-gray-500 mt-0.5 truncate">{ev.detail}</p>}
                        <p className="text-2xs text-gray-400 mt-0.5">{new Date(ev.time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))}
                  {!task.started_at && !task.completed_at && (task.comments || []).length === 0 && (
                    <p className="text-sm text-gray-400 py-6 text-center">No activity yet. Start working on this task to see the timeline.</p>
                  )}
                </div>
              </Card>

              {/* Time Tracking Summary */}
              <Card title="Time Tracking">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Estimated</span>
                    <span className="text-xs font-semibold text-gray-900">{task.time_estimate || 0}h</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Spent</span>
                    <span className={`text-xs font-semibold ${(task.time_spent || 0) > (task.time_estimate || 999) ? 'text-red-500' : 'text-gray-900'}`}>{task.time_spent || 0}h</span>
                  </div>
                  {task.time_estimate > 0 && (
                    <>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${(task.time_spent || 0) > task.time_estimate ? 'bg-red-500' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min(100, ((task.time_spent || 0) / task.time_estimate) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-2xs text-gray-400">
                        <span>{Math.round(((task.time_spent || 0) / task.time_estimate) * 100)}% used</span>
                        <span>{Math.max(0, task.time_estimate - (task.time_spent || 0))}h remaining</span>
                      </div>
                    </>
                  )}
                  {task.story_points && task.time_spent > 0 && (
                    <div className="pt-2 border-t border-gray-100 text-2xs text-gray-500">
                      <p>Velocity: {(task.story_points / (task.time_spent || 1)).toFixed(1)} points/hour</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Task Meta */}
              <Card title="Task Metadata">
                <div className="grid grid-cols-2 gap-2 text-2xs">
                  <div className="px-2 py-1.5 bg-gray-50 rounded-lg"><span className="text-gray-400 block">Type</span><span className="text-gray-700 font-medium capitalize">{task.type}</span></div>
                  <div className="px-2 py-1.5 bg-gray-50 rounded-lg"><span className="text-gray-400 block">Priority</span><span className="text-gray-700 font-medium capitalize">{task.priority}</span></div>
                  <div className="px-2 py-1.5 bg-gray-50 rounded-lg"><span className="text-gray-400 block">Component</span><span className="text-gray-700 font-medium">{task.component || '—'}</span></div>
                  <div className="px-2 py-1.5 bg-gray-50 rounded-lg"><span className="text-gray-400 block">Points</span><span className="text-gray-700 font-medium">{task.story_points || '—'}</span></div>
                </div>
              </Card>
            </>)}

            {activeTab === 'docs' && (<>
              {PROJECT_DOCS.map(cat => (
                <Card key={cat.cat} title={cat.cat}>
                  <div className="space-y-1">
                    {cat.files.map(f => (
                      <div key={f} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <span className="text-gray-400">📄</span>
                        <span className="text-xs text-gray-700 font-mono flex-1">{f}</span>
                        <button onClick={() => {
                          const content = `Reference: ${f}\nLinked to task: ${task.task_key} — ${task.title}`;
                          setNewComment(content);
                          setActiveTab('details');
                        }} className="text-2xs text-indigo-500 hover:text-indigo-700 font-medium">Link to task</button>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </>)}
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="w-64 shrink-0 space-y-3 hidden lg:block">
            <PropCard label="Status">
              <div className="flex flex-wrap gap-1">
                {STATUSES.map(s => (
                  <button key={s} onClick={() => updateField('status', s)} className={`px-2 py-0.5 text-2xs rounded-md font-medium capitalize transition-colors ${task.status === s ? `${STATUS_COLORS[s]} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{s.replace(/_/g, ' ')}</button>
                ))}
              </div>
            </PropCard>
            <PropCard label="Assignee">
              <select value={task.assignee_id || ''} onChange={e => updateField('assignee_id', e.target.value || null)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option value="">Unassigned</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.is_ai_agent ? '🤖 ' : ''}{m.display_name || m.name}</option>)}
              </select>
            </PropCard>
            <PropCard label="Priority">
              <div className="flex gap-1">
                {['critical','high','medium','low'].map(p => (
                  <button key={p} onClick={() => updateField('priority', p)} className={`flex items-center gap-1 px-2 py-0.5 text-2xs rounded-md font-medium capitalize ${task.priority === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[p]}`} />{p}
                  </button>
                ))}
              </div>
            </PropCard>
            <PropCard label="Points">
              <div className="flex gap-0.5">
                {[1,2,3,5,8,13,21].map(sp => (
                  <button key={sp} onClick={() => updateField('story_points', sp)} className={`w-7 h-7 text-2xs rounded-md font-bold ${task.story_points === sp ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{sp}</button>
                ))}
              </div>
            </PropCard>
            <PropCard label="Sprint">
              <select value={task.sprint_id || ''} onChange={e => updateField('sprint_id', e.target.value || null)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-2xs">{
                [<option key="" value="">No Sprint</option>, ...sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)]
              }</select>
            </PropCard>
            <PropCard label="Time Estimate">
              <div className="flex items-center gap-1">
                <input type="number" min="0" step="0.5" value={task.time_estimate || ''} onChange={e => updateField('time_estimate', e.target.value ? Number(e.target.value) : null)} placeholder="hours" className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-2xs" />
                <span className="text-2xs text-gray-400 shrink-0">h</span>
              </div>
            </PropCard>
            <PropCard label="Time Spent">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900">{task.time_spent || 0}h</span>
                  {task.time_estimate > 0 && (
                    <span className="text-2xs text-gray-400">/ {task.time_estimate}h ({Math.round(((task.time_spent || 0) / task.time_estimate) * 100)}%)</span>
                  )}
                </div>
                {task.time_estimate > 0 && (
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${(task.time_spent || 0) > task.time_estimate ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, ((task.time_spent || 0) / task.time_estimate) * 100)}%` }} />
                  </div>
                )}
                <div className="flex gap-1">
                  <input type="number" min="0.5" step="0.5" value={timeLogHours} onChange={e => setTimeLogHours(e.target.value)} placeholder="Log hours" className="flex-1 px-2 py-1 border border-gray-200 rounded-md text-2xs" />
                  <button onClick={logTime} disabled={!timeLogHours} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-2xs rounded-md">+ Log</button>
                </div>
              </div>
            </PropCard>
            <PropCard label="Due Date">
              <input type="date" value={task.due_date || ''} onChange={e => updateField('due_date', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-2xs" />
            </PropCard>
            <PropCard label="Type">
              <select value={task.type} onChange={e => updateField('type', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-2xs">
                {TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
              </select>
            </PropCard>
            <PropCard label="Component">
              <select value={task.component || ''} onChange={e => updateField('component', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-2xs">
                <option value="">None</option>
                {['api','web','desktop','mobile','packages','infrastructure','domains','dev-portal'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </PropCard>
            <PropCard label="Labels">
              <div className="flex flex-wrap gap-1">
                {labels.map((l: string) => <span key={l} className="text-2xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">{l}</span>)}
                {labels.length === 0 && <span className="text-2xs text-gray-400">No labels</span>}
              </div>
            </PropCard>
            <PropCard label="Info">
              <div className="space-y-1.5 text-2xs text-gray-500">
                <div className="flex justify-between"><span className="text-gray-400">Reporter</span><span className="text-gray-700">{task.reporter_name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Created</span><span className="text-gray-700">{new Date(task.created_at).toLocaleDateString('de-DE')}</span></div>
                {task.started_at && <div className="flex justify-between"><span className="text-gray-400">Started</span><span className="text-gray-700">{new Date(task.started_at).toLocaleDateString('de-DE')}</span></div>}
                {task.completed_at && <div className="flex justify-between"><span className="text-gray-400">Done</span><span className="text-emerald-600 font-medium">{new Date(task.completed_at).toLocaleDateString('de-DE')}</span></div>}
                {task.sprint_name && <div className="flex justify-between"><span className="text-gray-400">Sprint</span><span className="text-blue-600 font-medium">{task.sprint_name}</span></div>}
                {task.reviewer_name && <div className="flex justify-between"><span className="text-gray-400">Reviewer</span><span className="text-gray-700">{task.reviewer_name}</span></div>}
                {task.started_at && !task.completed_at && (
                  <div className="flex justify-between"><span className="text-gray-400">Elapsed</span><span className="text-gray-700">{Math.ceil((Date.now() - new Date(task.started_at).getTime()) / 86400000)}d</span></div>
                )}
                {task.started_at && task.completed_at && (
                  <div className="flex justify-between"><span className="text-gray-400">Lead Time</span><span className="text-gray-700">{Math.ceil((new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) / 86400000)}d</span></div>
                )}
              </div>
            </PropCard>
            {/* VibeStudio Module Link */}
            {domainInfo && (
              <PropCard label="VibeStudio Module">
                <div className="space-y-1 text-2xs">
                  <p className="font-semibold text-indigo-700">{domainInfo.label}</p>
                  <p className="text-gray-400">{domainInfo.tables.length} tables · {domainInfo.rules.length} rules</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {domainInfo.pages.slice(0, 3).map((p: string) => (
                      <a key={p} href={p} target="_blank" rel="noopener" className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">{p}</a>
                    ))}
                  </div>
                </div>
              </PropCard>
            )}
          </div>
        </div>
      </div>
    </DevPortalLayout>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function PropCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function buildFullPrompt(task: any, templateId: string | null): string {
  const labels = (() => { try { return typeof task.labels === 'string' ? JSON.parse(task.labels || '[]') : (task.labels || []); } catch { return []; } })();
  const domainKey = labels.find((l: string) => DOMAIN_KB[l]) || '';
  const domain = DOMAIN_KB[domainKey];

  let prompt = `VibeStudio Project - Task ${task.task_key}
${'='.repeat(50)}
Title: ${task.title}
Type: ${task.type} | Priority: ${task.priority} | Points: ${task.story_points || '-'}
Component: ${task.component || '-'} | Module: ${domain?.label || '-'}
Status: ${task.status} | Assignee: ${task.assignee_name || task.assignee_display_name || 'Unassigned'}
${labels.length ? 'Labels: ' + labels.join(', ') : ''}

`;

  const template = PROMPT_TEMPLATES.find(t => t.id === templateId);
  if (template) {
    prompt += `── Template: ${template.name} ──\n${template.template}\n\n`;
  }

  prompt += `── Description ──\n${task.description || 'No description provided.'}\n\n`;

  if (domain) {
    prompt += `── Module Context: ${domain.label} ──
Tables: ${domain.tables.join(', ')}
API: ${domain.api}
Rules:
${domain.rules.map(r => '  • ' + r).join('\n')}
Affects: ${domain.affects.join(', ')}
Pages: ${domain.pages.join(', ')}
\n`;
  }

  prompt += `── VibeStudio Project Context ──
• Vibe Code Prompt Studio — Turborepo + npm workspaces, TypeScript strict
• API: Express on :4100 · Web: Next.js Pages Router on :3100 · DB tunnel on 127.0.0.1:5545
• Single dev-portal route (apps/api/src/routes/dev-portal.ts) + single service (domains/dev-portal/src/dev-portal-service.ts)
• Auth: dev_portal_token (httpOnly cookie + Bearer fallback) — no multi-tenant org model
• Security: RLS on dev_* tables via SET LOCAL app.current_member_id
• DB: snake_case columns, UUID PKs, all tables prefixed dev_, JSONB for flexible data
• API response: { success: boolean, data?: T, error?: { code, message } }
• AI providers: Anthropic / OpenAI / DeepSeek / Moonshot / Groq (503 if no key); prefer latest Claude models
• React hooks: ALL before conditional returns
• Next migration: 081 (knex up/down + hasTable / hasColumn guards)
• Repo: github.com/codes-ai/vibestudio · Demo identity: @codes-ai.uk

── Rules ──
1. Keep dev_portal_token auth + RLS on dev_* tables intact on every route
2. Follow snake_case for DB, camelCase for TypeScript
3. Frontend API calls go through devApi() in apps/web/src/hooks/useDevAuth.ts
4. New tables: Migration 081 in infrastructure/migrations/081_create_[name].js with hasTable guards
5. AI features: check process.env.<PROVIDER>_API_KEY first; prefer latest Claude models
6. All API responses: { success, data, error }
7. React hooks before any conditional return`;

  return prompt;
}
