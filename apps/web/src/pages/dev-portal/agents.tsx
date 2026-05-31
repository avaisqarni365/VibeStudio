import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

const AGENT_PROFILES: Record<string, { desc: string; icon: string; color: string; capabilities: string[]; domains: string[]; automations: string[] }> = {
  coding: { desc: 'Full-stack code generation agent. Creates migrations, services, routes, pages, and tests following VibeStudio conventions.', icon: '⚡', color: 'from-violet-500 to-indigo-600', capabilities: ['Generate Express routes on /api/v1/dev-portal', 'Create Next.js pages with DevPortalLayout + useDevAuth()', 'Write Knex migrations (dev_* tables, snake_case, UUID PKs)', 'Extend the dev-portal service layer', 'Wire the devApi helper for new endpoints', 'Generate the AI Prompt Builder context'], domains: ['board', 'sprints', 'prompts', 'channels', 'wiki', 'agents'], automations: ['PR creation with task link', 'Code review suggestions', 'Test generation', 'Migration validation'] },
  ops: { desc: 'Infrastructure and operations agent. Monitors health, manages the IONOS deploy, tunnel, and backups.', icon: '🔧', color: 'from-cyan-500 to-blue-600', capabilities: ['systemd service management (vibestudio-api/web)', 'deploy.sh on the IONOS VM', 'SSH tunnel health (127.0.0.1:5545)', 'Database backup scheduling', 'SSL certificate rotation (certbot)', 'Log aggregation & analysis'], domains: ['infrastructure', 'dev-portal', 'deployments'], automations: ['Tunnel watchdog', 'Nightly DB backup', 'Deploy on merge to main', 'Certificate renewal'] },
  qa: { desc: 'Quality assurance and testing agent. Validates API contracts, runs regression suites, checks accessibility.', icon: '🧪', color: 'from-emerald-500 to-teal-600', capabilities: ['API contract validation (Zod schemas)', 'Auth/RLS verification per role', 'Accessibility audit (WCAG 2.1)', 'Visual regression testing', 'Playwright e2e (planned)', 'Performance profiling'], domains: ['all'], automations: ['Pre-merge test suite', 'Nightly regression', 'Flaky-test detection', 'Accessibility scan'] },
  security: { desc: 'Security audit agent. Validates the dev_portal_token auth, RLS policies, and detects suspicious patterns.', icon: '🔒', color: 'from-red-500 to-rose-600', capabilities: ['Auth flow review (dev_portal_token, refresh tokens)', 'RLS policy validation on dev_* tables', 'SQL injection scan', 'XSS detection', 'Dependency vulnerability scan', 'Secret/credential scan (AES-256-GCM keys)'], domains: ['auth', 'rls', 'deployments'], automations: ['Daily auth/RLS audit', 'Weekly dependency scan', 'Auth flow monitor', 'Suspicious pattern alert'] },
  analytics: { desc: 'Insights agent. Reports AI usage, token/cost trends, and team throughput across the studio.', icon: '📊', color: 'from-amber-500 to-orange-600', capabilities: ['AI usage analytics dashboard', 'Token + cost trend reporting', 'Sprint throughput / burndown analysis', 'Per-provider model comparison', 'API usage statistics', 'Performance metrics'], domains: ['usage', 'prompts', 'sprints'], automations: ['Monthly usage report', 'Cost-spike alerts', 'Throughput digest', 'Performance digest'] },
  release: { desc: 'Release management agent. Builds the desktop/mobile apps, manages deployments and auto-updates.', icon: '🚀', color: 'from-pink-500 to-fuchsia-600', capabilities: ['Standalone desktop build (.exe — Win/Mac/Linux)', 'Mobile build via EAS', 'Semantic versioning', 'Changelog generation', 'Auto-update channel (EAS OTA)', 'Rollback management'], domains: ['desktop', 'deployments', 'ci-cd'], automations: ['Tag → build → publish', 'Staging deploy on PR', 'Production deploy on merge', 'Rollback on failure'] },
};

const STATUS_COLORS: Record<string, string> = { backlog: 'text-gray-400', todo: 'text-amber-500', in_progress: 'text-blue-500', in_review: 'text-purple-500', testing: 'text-cyan-500', done: 'text-emerald-500' };
const PRIORITY_DOT: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-400' };
const TYPE_ICONS: Record<string, string> = { epic: '⚡', story: '📖', task: '✅', bug: '🐛', improvement: '✨', spike: '🔬', ai_task: '🤖' };

export default function DevPortalAgents() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [agentWorkload, setAgentWorkload] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    devApi('get', '/team/workload').then(r => {
      const all = r.data.data?.members || [];
      setAgents(all.filter((m: any) => m.is_ai_agent));
    }).catch(() => {
      devApi('get', '/team?role=ai_agent').then(r => setAgents(r.data.data || []));
    });
  }, [user]);

  const openAgent = async (agent: any) => {
    setSelectedAgent(agent);
    devApi('get', `/team/${agent.id}/workload`).then(r => setAgentWorkload(r.data.data)).catch(() => {});
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>;

  // Agent detail view
  if (selectedAgent && agentWorkload) {
    const profile = AGENT_PROFILES[selectedAgent.agent_type] || AGENT_PROFILES.coding;
    const w = agentWorkload;
    return (
      <DevPortalLayout user={user} title={selectedAgent.display_name || selectedAgent.name}>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedAgent(null); setAgentWorkload(null); }} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${profile.color} flex items-center justify-center text-3xl shadow-lg`}>{profile.icon}</div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{selectedAgent.display_name || selectedAgent.name}</h1>
              <p className="text-xs text-indigo-500 capitalize">{selectedAgent.agent_type} Agent</p>
            </div>
            <span className="ml-auto text-2xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full font-semibold">Online</span>
          </div>

          <p className="text-sm text-gray-600">{profile.desc}</p>

          {/* KPIs */}
          <div className="grid grid-cols-5 gap-3">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3"><p className="text-2xs text-gray-400 uppercase font-semibold">Active</p><p className="text-xl font-bold text-gray-900">{w.stats?.inProgressTasks || 0}</p></div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3"><p className="text-2xs text-gray-400 uppercase font-semibold">Done</p><p className="text-xl font-bold text-gray-900">{w.stats?.doneTasks || 0}</p></div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3"><p className="text-2xs text-gray-400 uppercase font-semibold">Points</p><p className="text-xl font-bold text-gray-900">{w.stats?.donePoints || 0}/{w.stats?.totalPoints || 0}</p></div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3"><p className="text-2xs text-gray-400 uppercase font-semibold">Hours</p><p className="text-xl font-bold text-gray-900">{w.stats?.totalHoursSpent || 0}h</p></div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3"><p className="text-2xs text-gray-400 uppercase font-semibold">Rate</p><p className="text-xl font-bold text-gray-900">{w.stats?.completionRate || 0}%</p></div>
          </div>

          <div className="flex gap-5">
            <div className="flex-1 min-w-0 space-y-4">
              {/* Active Tasks */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><h3 className="text-xs font-semibold text-gray-700">Assigned Tasks ({w.activeTasks?.length || 0})</h3></div>
                {(w.activeTasks || []).length === 0 ? (
                  <div className="px-4 py-8 text-center text-2xs text-gray-400">No tasks assigned</div>
                ) : (w.activeTasks || []).map((t: any) => (
                  <div key={t.id} onClick={() => router.push('/dev-portal/tasks/' + t.id)} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-indigo-50/30 cursor-pointer">
                    <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
                    <span className="text-2xs font-mono text-gray-400 w-16">{t.task_key}</span>
                    <span className="text-xs text-gray-900 font-medium flex-1 truncate">{t.title}</span>
                    <span className={`text-2xs capitalize ${STATUS_COLORS[t.status]}`}>{t.status.replace(/_/g, ' ')}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                  </div>
                ))}
              </div>

              {/* Completed Tasks */}
              {(w.completedTasks || []).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><h3 className="text-xs font-semibold text-gray-700">Completed ({w.completedTasks.length})</h3></div>
                  {w.completedTasks.map((t: any) => (
                    <div key={t.id} onClick={() => router.push('/dev-portal/tasks/' + t.id)} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 cursor-pointer opacity-60">
                      <span className="text-sm">{TYPE_ICONS[t.type] || '✅'}</span>
                      <span className="text-2xs font-mono text-gray-400">{t.task_key}</span>
                      <span className="text-xs text-gray-700 flex-1 truncate line-through">{t.title}</span>
                      {t.completed_at && <span className="text-2xs text-gray-400">{new Date(t.completed_at).toLocaleDateString('de-DE')}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Capabilities */}
            <div className="w-72 shrink-0 hidden lg:block space-y-3">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Capabilities</h3>
                <div className="space-y-1.5">
                  {profile.capabilities.map((c, i) => (
                    <div key={i} className="flex gap-2 text-2xs"><span className="text-indigo-400 shrink-0">*</span><span className="text-gray-600">{c}</span></div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ACCA Domains</h3>
                <div className="flex flex-wrap gap-1">{profile.domains.map(d => <span key={d} className="text-2xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg">{d}</span>)}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Automations</h3>
                <div className="space-y-1">{profile.automations.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-2xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-gray-600">{a}</span></div>
                ))}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Activity</h3>
                {(w.activity || []).length === 0 ? <p className="text-2xs text-gray-400">No recent activity</p> : (
                  <div className="space-y-2">{(w.activity || []).slice(0, 8).map((a: any) => (
                    <div key={a.id} className="text-2xs"><p className="text-gray-600">{a.action.replace(/_/g, ' ')} <span className="text-gray-400">"{a.entity_name}"</span></p><p className="text-gray-400">{new Date(a.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p></div>
                  ))}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DevPortalLayout>
    );
  }

  // Agent grid
  return (
    <DevPortalLayout user={user} title="AI Agents">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Agents</h1>
          <p className="text-xs text-gray-500 mt-0.5">{agents.length} autonomous agents for coding, operations, quality, and security</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(a => {
            const profile = AGENT_PROFILES[a.agent_type] || AGENT_PROFILES.coding;
            const w = a.workload;
            return (
              <div key={a.id} onClick={() => openAgent(a)} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${profile.color} flex items-center justify-center text-2xl shadow-sm`}>{profile.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{a.display_name || a.name}</p>
                    <p className="text-2xs text-indigo-500 capitalize">{a.agent_type} Agent</p>
                  </div>
                  <span className="text-2xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Online</span>
                </div>
                <p className="text-2xs text-gray-500 mb-3 line-clamp-2">{profile.desc}</p>

                {/* Workload stats */}
                {w && (
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-100">
                    <div className="text-center"><p className="text-xs font-bold text-blue-600">{w.inProgress || 0}</p><p className="text-2xs text-gray-400">active</p></div>
                    <div className="text-center"><p className="text-xs font-bold text-emerald-600">{w.done || 0}</p><p className="text-2xs text-gray-400">done</p></div>
                    <div className="text-center"><p className="text-xs font-bold text-gray-900">{w.donePoints || 0}p</p><p className="text-2xs text-gray-400">points</p></div>
                    <div className="text-center"><p className="text-xs font-bold text-purple-600">{w.hoursSpent || 0}h</p><p className="text-2xs text-gray-400">spent</p></div>
                  </div>
                )}

                {/* Domain tags */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {profile.domains.slice(0, 4).map(d => <span key={d} className="text-2xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{d}</span>)}
                  {profile.domains.length > 4 && <span className="text-2xs text-gray-400">+{profile.domains.length - 4}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {agents.length === 0 && (
          <div className="text-center py-16 text-gray-400"><span className="text-4xl block mb-3">🤖</span><p className="text-sm">No AI agents found</p></div>
        )}

        {/* Agent Overview */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Agent Architecture</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { title: 'Prompt-Driven', desc: 'Agents receive structured prompts from the AI Prompt Builder with full VibeStudio context (module KB, rules, conventions).' },
              { title: 'Task-Linked', desc: 'Each agent task is linked to a dev_tasks record with sprint, assignee, story points, and time tracking.' },
              { title: 'Convention-Aware', desc: 'Agents follow VibeStudio rules: dev_portal_token auth, RLS on dev_* tables, snake_case DB, { success, data, error } responses, logActivity() on mutations.' },
            ].map(item => (
              <div key={item.title} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-800">{item.title}</p>
                <p className="text-2xs text-gray-500 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DevPortalLayout>
  );
}
