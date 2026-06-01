import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

const TEMPLATE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  new_feature: { label: 'New Feature', icon: '✨', color: 'bg-emerald-100 text-emerald-700' },
  bug_fix: { label: 'Bug Fix', icon: '🐛', color: 'bg-red-100 text-red-700' },
  api_endpoint: { label: 'API Endpoint', icon: '🔌', color: 'bg-blue-100 text-blue-700' },
  page: { label: 'Frontend Page', icon: '🖥', color: 'bg-cyan-100 text-cyan-700' },
  migration: { label: 'DB Migration', icon: '🗄', color: 'bg-purple-100 text-purple-700' },
  refactor: { label: 'Refactor', icon: '♻', color: 'bg-amber-100 text-amber-700' },
  i18n: { label: 'Add i18n', icon: '🌍', color: 'bg-teal-100 text-teal-700' },
  design: { label: 'Design', icon: '🎨', color: 'bg-pink-100 text-pink-700' },
  custom: { label: 'Custom', icon: '📝', color: 'bg-gray-100 text-gray-700' },
};

const STATUS_COLORS: Record<string, string> = { sent: 'bg-blue-100 text-blue-700', in_progress: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-700' };

export default function DevPortalPrompts() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [prompts, setPrompts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [projectId, setProjectId] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [filters, setFilters] = useState<any>({});
  const [members, setMembers] = useState<any[]>([]);
  const [tab, setTab] = useState<'history' | 'stats' | 'connect'>('history');
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = (pid: string) => {
      setProjectId(pid);
      loadPrompts(pid);
      devApi('get', `/projects/${pid}/prompt-stats`).then(s => setStats(s.data.data)).catch(() => {});
    };
    if (activeProjectId) {
      load(activeProjectId);
    } else {
      devApi('get', '/projects').then(r => {
        if (r.data.data?.[0]) load(r.data.data[0].id);
      });
    }
    devApi('get', '/team').then(r => setMembers(r.data.data || []));
    devApi('get', '/device-info').then(r => setDeviceInfo(r.data.data)).catch(() => {});
  }, [user, activeProjectId]);

  const loadPrompts = async (pid?: string) => {
    const id = pid || projectId;
    if (!id) return;
    const params = new URLSearchParams();
    if (filters.author_id) params.set('author_id', filters.author_id);
    if (filters.status) params.set('status', filters.status);
    if (filters.template) params.set('template', filters.template);
    const r = await devApi('get', `/projects/${id}/prompts?${params}`);
    setPrompts(r.data.data || []);
  };

  useEffect(() => { if (projectId) loadPrompts(); }, [filters]);

  const openPrompt = async (id: string) => {
    const r = await devApi('get', `/prompts/${id}`);
    setSelected(r.data.data);
  };

  const updateStatus = async (promptId: string, status: string) => {
    await devApi('put', `/prompts/${promptId}`, { status });
    loadPrompts();
    if (selected?.id === promptId) setSelected({ ...selected, status });
  };

  const ratePrompt = async (promptId: string, rating: number) => {
    await devApi('put', `/prompts/${promptId}`, { rating });
    if (selected?.id === promptId) setSelected({ ...selected, rating });
  };

  // A5: redact PII in place, and share with the redaction guard.
  const redactSelected = async () => {
    const r = await devApi('post', `/prompts/${selected.id}/redact`);
    if (r.data?.success) { await openPrompt(selected.id); }
  };
  const toggleShare = async () => {
    try {
      const r = await devApi('post', `/prompts/${selected.id}/share`, { is_shared: !selected.is_shared });
      if (r.data?.success) setSelected({ ...selected, ...r.data.data });
    } catch (e: any) { alert(e?.response?.data?.error?.message || 'Cannot share — redact PII first.'); }
  };

  const refresh = () => {
    loadPrompts();
    if (projectId) devApi('get', `/projects/${projectId}/prompt-stats`).then(s => setStats(s.data.data)).catch(() => {});
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  // Detail view
  if (selected) {
    const tpl = TEMPLATE_LABELS[selected.template] || TEMPLATE_LABELS.custom;
    return (
      <DevPortalLayout user={user} title="Prompt Detail">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{selected.title}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${tpl.color}`}>{tpl.icon} {tpl.label}</span>
                <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selected.status] || STATUS_COLORS.sent}`}>{selected.status}</span>
                {selected.task_key && <span className="text-2xs font-mono text-gray-400">{selected.task_key}</span>}
              </div>
            </div>
            <div className="flex gap-1">
              {['sent', 'in_progress', 'completed', 'failed'].map(s => (
                <button key={s} onClick={() => updateStatus(selected.id, s)} className={`px-2 py-1 text-2xs rounded-md capitalize ${selected.status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{s.replace('_', ' ')}</button>
              ))}
            </div>
          </div>

          <div className="flex gap-5">
            {/* Prompt Content */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-700">Prompt ({selected.prompt?.length || 0} chars)</h3>
                  <button onClick={() => { navigator.clipboard.writeText(selected.prompt || ''); }} className="text-2xs text-indigo-500 hover:text-indigo-700 font-medium">Copy</button>
                </div>
                <pre className="px-4 py-3 text-xs font-mono text-gray-700 whitespace-pre-wrap max-h-[50vh] overflow-y-auto leading-relaxed">{selected.prompt}</pre>
              </div>

              {selected.response_summary && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Response Summary</h3>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{selected.response_summary}</p>
                </div>
              )}

              {selected.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-amber-700 mb-1">Notes</h3>
                  <p className="text-xs text-amber-600">{selected.notes}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="w-64 shrink-0 space-y-3 hidden lg:block">
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Author</p>
                <p className="text-xs font-medium text-gray-900">{selected.author_display_name || selected.author_name || '—'}</p>
                <p className="text-2xs text-gray-400 capitalize">{selected.author_role}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Device</p>
                <div className="space-y-1 text-2xs">
                  {selected.device_name && <div className="flex justify-between"><span className="text-gray-400">Name</span><span className="text-gray-700">{selected.device_name}</span></div>}
                  {selected.os && <div className="flex justify-between"><span className="text-gray-400">OS</span><span className="text-gray-700">{selected.os}</span></div>}
                  {selected.device_type && <div className="flex justify-between"><span className="text-gray-400">Type</span><span className="text-gray-700 capitalize">{selected.device_type}</span></div>}
                  {selected.ip_address && <div className="flex justify-between"><span className="text-gray-400">IP</span><span className="text-gray-700 font-mono">{selected.ip_address}</span></div>}
                  {selected.hostname && <div className="flex justify-between"><span className="text-gray-400">Host</span><span className="text-gray-700">{selected.hostname}</span></div>}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Details</p>
                <div className="space-y-1 text-2xs">
                  <div className="flex justify-between"><span className="text-gray-400">Model</span><span className="text-gray-700">{selected.model || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Sent</span><span className="text-gray-700">{new Date(selected.created_at).toLocaleString('de-DE')}</span></div>
                  {selected.completed_at && <div className="flex justify-between"><span className="text-gray-400">Done</span><span className="text-gray-700">{new Date(selected.completed_at).toLocaleString('de-DE')}</span></div>}
                  {selected.duration_seconds && <div className="flex justify-between"><span className="text-gray-400">Duration</span><span className="text-gray-700">{selected.duration_seconds}s</span></div>}
                  {selected.prompt_tokens && <div className="flex justify-between"><span className="text-gray-400">Tokens</span><span className="text-gray-700">{(selected.prompt_tokens || 0) + (selected.response_tokens || 0)}</span></div>}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Rating</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => ratePrompt(selected.id, star)} className={`w-7 h-7 rounded-md flex items-center justify-center text-sm ${(selected.rating || 0) >= star ? 'bg-amber-100 text-amber-500' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
              {/* A5: Sharing & PII */}
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sharing & PII</p>
                <div className="space-y-1.5 text-2xs mb-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">PII redacted</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${selected.is_pii_redacted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{selected.is_pii_redacted ? 'yes' : 'no'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Shared with team</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${selected.is_shared ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{selected.is_shared ? 'yes' : 'no'}</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={redactSelected} disabled={selected.is_pii_redacted} className="flex-1 px-2 py-1.5 text-2xs font-semibold rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-white">🛡 Redact PII</button>
                  <button onClick={toggleShare} className={`flex-1 px-2 py-1.5 text-2xs font-semibold rounded-lg ${selected.is_shared ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>{selected.is_shared ? 'Unshare' : 'Share'}</button>
                </div>
                {!selected.is_pii_redacted && <p className="text-2xs text-gray-400 mt-1.5">Sharing is blocked until PII is redacted (or none is found).</p>}
              </div>
              {selected.task_key && (
                <button onClick={() => router.push('/dev-portal/tasks/' + selected.task_id)} className="w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                  <p className="text-2xs text-gray-400">Linked Task</p>
                  <p className="text-xs font-medium text-indigo-600">{selected.task_key}: {selected.task_title}</p>
                </button>
              )}
            </div>
          </div>
        </div>
      </DevPortalLayout>
    );
  }

  // List view
  return (
    <DevPortalLayout user={user} title="Prompt History">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Prompt History</h1>
            <p className="text-xs text-gray-500 mt-0.5">{prompts.length} prompts · {stats?.total || 0} total</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(['history', 'stats', 'connect'] as const).map(v => (
                <button key={v} onClick={() => setTab(v)} className={`px-3 py-1 text-2xs font-medium rounded-md capitalize ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {v === 'connect' ? '🔗 Connect' : v}
                </button>
              ))}
            </div>
            <button onClick={refresh} className="px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg font-medium hover:bg-indigo-50">Refresh</button>
          </div>
        </div>

        {tab === 'history' && (<>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <select value={filters.author_id || ''} onChange={e => setFilters({ ...filters, author_id: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs">
              <option value="">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.is_ai_agent ? '🤖 ' : ''}{m.display_name || m.name}</option>)}
            </select>
            <select value={filters.template || ''} onChange={e => setFilters({ ...filters, template: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs">
              <option value="">All Templates</option>
              {Object.entries(TEMPLATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filters.status || ''} onChange={e => setFilters({ ...filters, status: e.target.value })} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs">
              <option value="">All Status</option>
              {['sent', 'in_progress', 'completed', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {Object.values(filters).some(Boolean) && <button onClick={() => setFilters({})} className="text-2xs text-gray-400 hover:text-red-500">Clear</button>}
          </div>

          {/* Prompt List */}
          <div className="space-y-2">
            {prompts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                <span className="text-3xl block mb-3">📝</span>
                <p className="text-sm text-gray-500">No prompts yet</p>
                <p className="text-2xs text-gray-400 mt-1">Prompts are saved when you use the AI Prompt Builder on any task.</p>
              </div>
            ) : prompts.map((p: any) => {
              const tpl = TEMPLATE_LABELS[p.template] || TEMPLATE_LABELS.custom;
              return (
                <div key={p.id} onClick={() => openPrompt(p.id)} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-200 transition-colors cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg ${p.author_is_ai ? 'bg-indigo-500' : 'bg-blue-500'} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {p.author_is_ai ? '🤖' : (p.author_display_name || p.author_name || '?').charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-gray-900 truncate">{p.title}</span>
                        <span className={`text-2xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${tpl.color}`}>{tpl.icon} {tpl.label}</span>
                        <span className={`text-2xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[p.status] || STATUS_COLORS.sent}`}>{p.status}</span>
                      </div>
                      <p className="text-2xs text-gray-500 line-clamp-1 font-mono">{p.prompt?.substring(0, 120)}...</p>
                      <div className="flex items-center gap-3 mt-1.5 text-2xs text-gray-400">
                        <span>{p.author_display_name || p.author_name}</span>
                        {p.task_key && <span className="font-mono text-indigo-500">{p.task_key}</span>}
                        {p.os && <span>{p.os}</span>}
                        {p.device_type && <span className="capitalize">{p.device_type}</span>}
                        <span>{new Date(p.created_at).toLocaleString('de-DE')}</span>
                        {p.rating && <span className="text-amber-400">{'★'.repeat(p.rating)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

        {tab === 'stats' && stats && (
          <div className="grid grid-cols-2 gap-4">
            {/* By Member */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Prompts by Team Member</h3>
              {Object.entries(stats.byAuthor).length === 0 ? <p className="text-2xs text-gray-400">No data</p> : (
                <div className="space-y-2">
                  {Object.entries(stats.byAuthor).sort((a: any, b: any) => b[1].count - a[1].count).map(([id, data]: [string, any]) => (
                    <div key={id} className="flex items-center justify-between">
                      <span className="text-xs text-gray-700">{data.name || 'Unknown'}</span>
                      <span className="text-xs font-bold text-indigo-600">{data.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* By Template */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Prompts by Template</h3>
              <div className="space-y-2">
                {Object.entries(stats.byTemplate).sort((a: any, b: any) => b[1] - a[1]).map(([tpl, count]: [string, any]) => {
                  const info = TEMPLATE_LABELS[tpl] || TEMPLATE_LABELS.custom;
                  return (
                    <div key={tpl} className="flex items-center justify-between">
                      <span className="text-xs text-gray-700">{info.icon} {info.label}</span>
                      <span className="text-xs font-bold text-gray-900">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* By Device */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Prompts by Device</h3>
              <div className="space-y-2">
                {Object.entries(stats.byDevice).length === 0 ? <p className="text-2xs text-gray-400">No device data</p> : Object.entries(stats.byDevice).sort((a: any, b: any) => b[1] - a[1]).map(([device, count]: [string, any]) => (
                  <div key={device} className="flex items-center justify-between">
                    <span className="text-xs text-gray-700">{device}</span>
                    <span className="text-xs font-bold text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* By Status */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Prompts by Status</h3>
              <div className="space-y-2">
                {Object.entries(stats.byStatus).map(([status, count]: [string, any]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>{status}</span>
                    <span className="text-xs font-bold text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'connect' && (() => {
          // B-5: dev portal token moved to httpOnly cookie — the browser can't
          // read it any more. CLI users need to obtain a token through the
          // /auth/login endpoint directly; the copy-token UX below is a
          // known follow-up (issue VIBE-DEV-CLI-TOKEN).
          const token = '';
          const copyToken = () => { navigator.clipboard.writeText(token); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000); };
          return (
            <div className="space-y-5">
              {/* Current Device */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl">🖥</div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">This Device</h3>
                    <p className="text-2xs text-emerald-500 font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Connected</p>
                  </div>
                </div>
                {deviceInfo && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Hostname', deviceInfo.server_hostname],
                      ['Platform', deviceInfo.server_platform],
                      ['OS', deviceInfo.os],
                      ['Device Type', deviceInfo.device_type],
                      ['Node.js', deviceInfo.node_version],
                      ['Architecture', deviceInfo.server_arch],
                      ['User', deviceInfo.user],
                      ['Role', deviceInfo.role],
                      ['IP', deviceInfo.ip_address],
                      ['Working Dir', deviceInfo.cwd],
                    ].map(([label, value]) => (
                      <div key={label} className="px-3 py-2 bg-gray-50 rounded-lg">
                        <p className="text-2xs text-gray-400">{label}</p>
                        <p className="text-xs font-mono text-gray-700 truncate">{value || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Auth Token */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Your Auth Token</h3>
                <p className="text-2xs text-gray-500 mb-3">Use this token to connect Claude Code, scripts, or CI/CD to the prompt history.</p>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-900 text-gray-300 text-2xs font-mono rounded-lg overflow-hidden truncate">{token.substring(0, 50)}...</code>
                  <button onClick={copyToken} className={`px-3 py-2 text-2xs font-semibold rounded-lg shrink-0 ${tokenCopied ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                    {tokenCopied ? '✓ Copied' : 'Copy Token'}
                  </button>
                </div>
              </div>

              {/* Claude Code Hook Setup */}
              <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                  <span className="text-lg">🔗</span>
                  <h3 className="text-sm font-bold text-indigo-900">Connect Claude Code</h3>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-gray-600">Auto-log every Claude Code prompt to the dev portal. Add this hook to your Claude Code settings:</p>

                  <div>
                    <p className="text-2xs font-semibold text-gray-500 mb-1">Step 1 — Set environment variable</p>
                    <div className="bg-gray-900 rounded-xl p-3">
                      <pre className="text-2xs text-gray-300 font-mono whitespace-pre-wrap">{`# Add to your shell profile (.bashrc, .zshrc, or PowerShell profile)
export DEV_PORTAL_TOKEN="${token.substring(0, 20)}..."

# Or for this session only:
set DEV_PORTAL_TOKEN=${token.substring(0, 20)}...`}</pre>
                    </div>
                  </div>

                  <div>
                    <p className="text-2xs font-semibold text-gray-500 mb-1">Step 2 — Add Claude Code hook</p>
                    <p className="text-2xs text-gray-400 mb-1">Open Claude Code settings (type /settings) and add this hook:</p>
                    <div className="bg-gray-900 rounded-xl p-3">
                      <pre className="text-2xs text-gray-300 font-mono whitespace-pre-wrap">{`{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "node D:/VibeStudio/scripts/log-prompt.js \\"Code change\\" \\"Tool used on $(date +%Y-%m-%d_%H:%M)\\""
      }
    ]
  }
}`}</pre>
                    </div>
                  </div>

                  <div>
                    <p className="text-2xs font-semibold text-gray-500 mb-1">Step 3 — Test the connection</p>
                    <div className="bg-gray-900 rounded-xl p-3">
                      <pre className="text-2xs text-gray-300 font-mono whitespace-pre-wrap">{`# Run from terminal in D:/VibeStudio:
node scripts/log-prompt.js "Test prompt" "Hello from CLI"

# Check it appeared in the Prompt History tab above`}</pre>
                    </div>
                  </div>
                </div>
              </div>

              {/* Manual Log */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Quick Log a Prompt</h3>
                <ManualPromptLog devApi={devApi} projectId={projectId} onLogged={refresh} />
              </div>

              {/* Integration Options */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Integration Methods</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: '🤖', title: 'Claude Code Hook', desc: 'Auto-logs on every Write/Edit tool use. Runs in background.', status: 'recommended' },
                    { icon: '📋', title: 'AI Prompt Builder', desc: 'Prompts auto-saved when you click "Copy Prompt" on any task.', status: 'active' },
                    { icon: '💻', title: 'CLI Script', desc: 'Run node scripts/log-prompt.js from terminal or CI/CD.', status: 'available' },
                  ].map(m => (
                    <div key={m.title} className="px-3 py-3 border border-gray-100 rounded-xl">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-lg">{m.icon}</span>
                        <span className="text-xs font-semibold text-gray-800">{m.title}</span>
                      </div>
                      <p className="text-2xs text-gray-500">{m.desc}</p>
                      <span className={`text-2xs px-1.5 py-0.5 rounded-full font-medium mt-2 inline-block ${m.status === 'recommended' ? 'bg-indigo-100 text-indigo-700' : m.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{m.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </DevPortalLayout>
  );
}

function ManualPromptLog({ devApi, projectId, onLogged }: { devApi: any; projectId: string; onLogged: () => void }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [logging, setLogging] = useState(false);

  const logPrompt = async () => {
    if (!title.trim() || !prompt.trim() || !projectId) return;
    setLogging(true);
    try {
      await devApi('post', `/projects/${projectId}/prompts`, { title, prompt, template: 'custom', labels: ['manual'] });
      setTitle('');
      setPrompt('');
      onLogged();
    } catch {}
    setLogging(false);
  };

  return (
    <div className="space-y-2">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Prompt title..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20" />
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder="Paste your prompt here..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500/20" />
      <button onClick={logPrompt} disabled={!title.trim() || !prompt.trim() || logging} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold rounded-lg">{logging ? 'Logging...' : 'Log Prompt'}</button>
    </div>
  );
}
