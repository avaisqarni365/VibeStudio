import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';
import { SafeMarkdown } from '@/components/dev-portal/SafeMarkdown';

export default function DevPortalArchitecture() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [wikiPage, setWikiPage] = useState<any>(null);
  const [scan, setScan] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    if (!user) return;
    devApi('get', '/project-scan').then(r => setScan(r.data.data)).catch(() => {});
    const pid = activeProjectId || undefined;
    if (pid) {
      setProjectId(pid);
      devApi('get', `/projects/${pid}/wiki`).then(w => {
        const page = (w.data.data || []).find((p: any) => p.slug === 'guide-architecture');
        if (page) devApi('get', `/wiki/${page.id}`).then(wp => setWikiPage(wp.data.data));
      });
    } else {
      devApi('get', '/projects').then(r => {
        if (r.data.data?.[0]) {
          const fallbackPid = r.data.data[0].id;
          setProjectId(fallbackPid);
          devApi('get', `/projects/${fallbackPid}/wiki`).then(w => {
            const page = (w.data.data || []).find((p: any) => p.slug === 'guide-architecture');
            if (page) devApi('get', `/wiki/${page.id}`).then(wp => setWikiPage(wp.data.data));
          });
        }
      });
    }
  }, [user, activeProjectId]);

  const syncAndReload = async () => {
    if (!projectId) return;
    setSyncing(true);
    await devApi('post', `/projects/${projectId}/wiki/sync-project`);
    const w = await devApi('get', `/projects/${projectId}/wiki`);
    const page = (w.data.data || []).find((p: any) => p.slug === 'guide-architecture');
    if (page) { const wp = await devApi('get', `/wiki/${page.id}`); setWikiPage(wp.data.data); }
    const s = await devApi('get', '/project-scan'); setScan(s.data.data);
    setSyncing(false);
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  const m = scan?.metrics;
  const isMgr = ['ceo', 'lead', 'product_owner'].includes(user.role);

  return (
    <DevPortalLayout user={user} title="Architecture">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Architecture</h1>
            <p className="text-xs text-gray-500 mt-0.5">{m ? `${m.domains} domains · ${m.packages} packages · ${m.dbTables}+ tables · ${m.tsFiles} TS files` : 'Scanning...'}</p>
          </div>
          <div className="flex items-center gap-2">
            {isMgr && <button onClick={syncAndReload} disabled={syncing} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">{syncing ? 'Syncing...' : 'Sync from Project'}</button>}
            {wikiPage && <button onClick={() => router.push('/dev-portal/wiki')} className="px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg font-medium hover:bg-indigo-50">Edit in Wiki</button>}
          </div>
        </div>

        {/* Live Architecture Diagram */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Architecture (live)</h3>
          <div className="space-y-1.5">
            {[
              { n: 4, label: 'Platform Shells', desc: `web (Next.js, ${m?.pages || '?'} pages) · planned: desktop (.exe) · mobile`, color: 'bg-violet-500' },
              { n: 3, label: 'API', desc: `Express · /api/v1/dev-portal · ${m?.totalEndpoints || '?'}+ endpoints`, color: 'bg-cyan-500' },
              { n: 2, label: 'Business Logic', desc: `${m?.domains || '?'} domain(s) · domains/dev-portal`, color: 'bg-emerald-500' },
              { n: 1, label: 'Core Infrastructure', desc: `database · config · logging · utils · ${m?.dbTables || '?'}+ dev_* tables`, color: 'bg-amber-500' },
            ].map(layer => (
              <div key={layer.n} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${layer.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{layer.n}</div>
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-gray-900">{layer.label}</p>
                  <p className="text-2xs text-gray-500">{layer.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Isolation Live */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Access &amp; Security</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { n: 1, title: 'Auth — dev_portal_token', desc: 'httpOnly JWT cookie + Bearer fallback for cross-port localhost. Validated by the dev-portal middleware (never acca_token).', color: 'border-red-300 bg-red-50' },
              { n: 2, title: 'Roles', desc: 'ceo / lead / product_owner, plus AI agent roles (agent_*). Route-level role gating.', color: 'border-amber-300 bg-amber-50' },
              { n: 3, title: 'Database — PostgreSQL RLS', desc: 'RLS enabled on dev_* tables. Direct DB scripts must SET LOCAL app.current_member_id per transaction.', color: 'border-blue-300 bg-blue-50' },
              { n: 4, title: 'Audit', desc: 'logActivity() records every mutation into dev_activity_log for a full trail.', color: 'border-emerald-300 bg-emerald-50' },
            ].map(l => (
              <div key={l.n} className={`border rounded-xl p-3 ${l.color}`}>
                <p className="text-xs font-semibold text-gray-800">Layer {l.n}: {l.title}</p>
                <p className="text-2xs text-gray-600 mt-1">{l.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Wiki Content */}
        {wikiPage?.content ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-h-[60vh] overflow-y-auto"><SafeMarkdown content={wikiPage.content} /></div>
        ) : isMgr ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center py-8">
            <button onClick={syncAndReload} disabled={syncing} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">{syncing ? 'Generating...' : 'Generate Architecture Docs'}</button>
          </div>
        ) : null}
      </div>
    </DevPortalLayout>
  );
}
