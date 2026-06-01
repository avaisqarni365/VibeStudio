import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

export default function DevPortalProject() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [scan, setScan] = useState<any>(null);
  const [wikiPage, setWikiPage] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState<'overview' | 'routes' | 'domains' | 'pages' | 'migrations' | 'cost'>('overview');
  const [search, setSearch] = useState('');
  const [roi, setRoi] = useState<any>(null);
  const [roiLoading, setRoiLoading] = useState(false);

  const fmtUsd = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: n < 1 ? 4 : 2 });

  useEffect(() => {
    if (!user) return;
    devApi('get', '/project-scan').then(r => setScan(r.data.data)).catch(() => {});
    const load = (pid: string) => {
      setProjectId(pid);
      devApi('get', `/projects/${pid}/wiki`).then(w => {
        const page = (w.data.data || []).find((p: any) => p.slug === 'guide-project-map');
        if (page) devApi('get', `/wiki/${page.id}`).then(wp => setWikiPage(wp.data.data));
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

  // Lazily load cost-per-feature ROI when the Cost tab is opened.
  useEffect(() => {
    if (tab !== 'cost' || !projectId || roi) return;
    setRoiLoading(true);
    devApi('get', `/projects/${projectId}/cost-roi`)
      .then(r => setRoi(r.data.data))
      .catch(() => setRoi({ totalCost: 0, tasks: [], sprints: [], untracked: { cost: 0, prompts: 0 } }))
      .finally(() => setRoiLoading(false));
  }, [tab, projectId]);
  // Reset ROI when switching projects so the next open refetches.
  useEffect(() => { setRoi(null); }, [projectId]);

  const syncAndReload = async () => {
    if (!projectId) return;
    setSyncing(true);
    await devApi('post', `/projects/${projectId}/wiki/sync-project`);
    const s = await devApi('get', '/project-scan'); setScan(s.data.data);
    const w = await devApi('get', `/projects/${projectId}/wiki`);
    const page = (w.data.data || []).find((p: any) => p.slug === 'guide-project-map');
    if (page) { const wp = await devApi('get', `/wiki/${page.id}`); setWikiPage(wp.data.data); }
    setSyncing(false);
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  const m = scan?.metrics;
  const isMgr = ['ceo', 'lead', 'product_owner'].includes(user.role);

  const filterList = (items: any[], key: string) => search ? items.filter(i => (i[key] || '').toLowerCase().includes((search || '').toLowerCase())) : items;

  return (
    <DevPortalLayout user={user} title="Project Map">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Project Map</h1>
            <p className="text-xs text-gray-500 mt-0.5">{m ? `Live scan: ${m.routeFiles} routes · ${m.totalEndpoints} endpoints · ${m.migrations} migrations · ${m.domains} domains · ${m.pages} pages · ${m.tsFiles} TS files` : 'Scanning...'}{scan ? ` · ${scan.scannedAt?.split('T')[0]}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {isMgr && <button onClick={syncAndReload} disabled={syncing} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">{syncing ? 'Syncing...' : 'Sync & Refresh'}</button>}
            {wikiPage && <button onClick={() => router.push('/dev-portal/wiki')} className="px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg font-medium hover:bg-indigo-50">Edit in Wiki</button>}
          </div>
        </div>

        {/* KPI row */}
        {m && (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {[['Routes', m.routeFiles, 'indigo'], ['Endpoints', m.totalEndpoints+'+', 'blue'], ['Migrations', m.migrations, 'purple'], ['Tables', m.dbTables+'+', 'violet'], ['Domains', m.domains, 'emerald'], ['Packages', m.packages, 'cyan'], ['Pages', m.pages, 'amber'], ['TS Files', m.tsFiles, 'gray']].map(([l, v, c]) => (
              <div key={l as string} className={`bg-${c}-50 border border-${c}-100 rounded-xl p-2.5 text-center`}>
                <p className="text-base font-bold text-gray-900">{v}</p><p className="text-2xs text-gray-500">{l}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 pb-px">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'routes', label: `Routes (${scan?.routes?.length || 0})` },
            { key: 'domains', label: `Domains (${scan?.domains?.length || 0})` },
            { key: 'pages', label: `Pages (${scan?.pages?.length || 0})` },
            { key: 'migrations', label: `Migrations (${scan?.migrations?.length || 0})` },
            { key: 'cost', label: 'Cost ROI' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 text-xs font-medium rounded-t-lg -mb-px ${tab === t.key ? 'bg-white border border-gray-200 border-b-white text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
          ))}
        </div>

        {tab !== 'overview' && tab !== 'cost' && (
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter..." className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20" />
        )}

        {/* Overview Tab */}
        {tab === 'overview' && scan && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Top Routes by Endpoints</h3>
              {scan.routes.sort((a: any, b: any) => b.endpoints - a.endpoints).slice(0, 10).map((r: any) => (
                <div key={r.file} className="flex items-center justify-between py-1">
                  <span className="text-xs font-mono text-gray-700">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(r.endpoints / (scan.routes[0]?.endpoints || 1)) * 100}%` }} /></div>
                    <span className="text-2xs text-gray-400 w-6 text-right">{r.endpoints}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Top Domains by Files</h3>
              {scan.domains.sort((a: any, b: any) => b.files - a.files).slice(0, 10).map((d: any) => (
                <div key={d.name} className="flex items-center justify-between py-1">
                  <span className="text-xs font-mono text-gray-700">{d.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(d.files / (scan.domains[0]?.files || 1)) * 100}%` }} /></div>
                    <span className="text-2xs text-gray-400 w-6 text-right">{d.files}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 col-span-2">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Packages ({scan.packages.length})</h3>
              <div className="grid grid-cols-3 gap-2">
                {scan.packages.map((p: any) => (
                  <div key={p.name} className="px-3 py-2 bg-gray-50 rounded-lg">
                    <p className="text-xs font-mono font-medium text-gray-800">@vibestudio/{p.name}</p>
                    {p.description && <p className="text-2xs text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Routes Tab */}
        {tab === 'routes' && scan?.routes && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase">
              <span>Route File</span><span>Endpoints</span><span>Path</span>
            </div>
            {filterList(scan.routes, 'name').map((r: any) => (
              <div key={r.file} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 items-center">
                <span className="text-xs font-medium text-gray-800">{r.name}</span>
                <span className="text-xs font-bold text-indigo-600">{r.endpoints}</span>
                <span className="text-2xs font-mono text-gray-400">apps/api/src/routes/{r.file}</span>
              </div>
            ))}
          </div>
        )}

        {/* Domains Tab */}
        {tab === 'domains' && scan?.domains && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase">
              <span>Domain</span><span>Files</span><span>Main Service</span>
            </div>
            {filterList(scan.domains, 'name').map((d: any) => (
              <div key={d.name} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 items-center">
                <span className="text-xs font-medium text-gray-800">{d.name}</span>
                <span className="text-xs font-bold text-emerald-600">{d.files}</span>
                <span className="text-2xs font-mono text-gray-400">{d.mainFile || '—'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pages Tab */}
        {tab === 'pages' && scan?.pages && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase">
              <span>URL Path</span><span>File</span>
            </div>
            {filterList(scan.pages, 'path').map((p: any) => (
              <div key={p.file} className="grid grid-cols-[1fr_1fr] gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 items-center">
                <a href={`http://localhost:3100${p.path}`} target="_blank" rel="noopener" className="text-xs text-indigo-600 hover:underline font-mono">{p.path}</a>
                <span className="text-2xs font-mono text-gray-400">{p.file}</span>
              </div>
            ))}
          </div>
        )}

        {/* Migrations Tab */}
        {tab === 'migrations' && scan?.migrations && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase">
              <span>#</span><span>Migration</span><span>File</span>
            </div>
            {filterList(scan.migrations, 'name').reverse().map((mi: any) => (
              <div key={mi.file} className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 items-center">
                <span className="text-xs font-bold text-purple-600 w-8">{mi.number}</span>
                <span className="text-xs text-gray-800 capitalize">{mi.name}</span>
                <span className="text-2xs font-mono text-gray-400">{mi.file}</span>
              </div>
            ))}
          </div>
        )}

        {/* Cost ROI Tab — AI spend per feature (task) and per sprint */}
        {tab === 'cost' && (
          roiLoading ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-xs text-gray-400">Computing cost per feature…</div>
          ) : !roi ? null : (
            <div className="space-y-4">
              {/* Totals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  ['Total AI spend', fmtUsd(roi.totalCost), 'rose'],
                  ['Tracked tasks', String(roi.tasks?.length || 0), 'indigo'],
                  ['Sprints', String(roi.sprints?.length || 0), 'emerald'],
                  ['Untracked spend', fmtUsd(roi.untracked?.cost || 0), 'amber'],
                ].map(([l, v, c]) => (
                  <div key={l as string} className={`bg-${c}-50 border border-${c}-100 rounded-xl p-3`}>
                    <p className="text-lg font-bold text-gray-900">{v}</p><p className="text-2xs text-gray-500">{l}</p>
                  </div>
                ))}
              </div>
              <p className="text-2xs text-gray-400 -mt-1">
                Spend = AI prompts in this project, costed with <span className="font-mono">.claude/cost-tracking/budget.json</span> prices. Link prompts to a task (<span className="font-mono">task_id</span>) so they leave the “untracked” bucket.
              </p>

              {/* Per-sprint cost / cost-per-point */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100"><h3 className="text-xs font-semibold text-gray-700">Cost by sprint</h3></div>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase">
                  <span>Sprint</span><span>Tasks</span><span>Points</span><span>Cost / pt</span>
                </div>
                {(roi.sprints || []).length === 0 && <div className="px-4 py-3 text-2xs text-gray-400">No sprint-linked spend yet.</div>}
                {(roi.sprints || []).map((s: any) => (
                  <div key={s.sprint_id || s.sprint} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 items-center">
                    <span className="text-xs font-medium text-gray-800">{s.sprint} · <span className="text-rose-600 font-semibold">{fmtUsd(s.cost)}</span></span>
                    <span className="text-2xs text-gray-500 text-right">{s.tasks}</span>
                    <span className="text-2xs text-gray-500 text-right">{s.points || '—'}</span>
                    <span className="text-2xs font-mono text-gray-700 text-right">{s.cost_per_point != null ? fmtUsd(s.cost_per_point) : '—'}</span>
                  </div>
                ))}
              </div>

              {/* Top tasks (features) by cost */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100"><h3 className="text-xs font-semibold text-gray-700">Top features by AI spend</h3></div>
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase">
                  <span>Key</span><span>Feature</span><span>Prompts</span><span>Pts</span><span>Cost</span>
                </div>
                {(roi.tasks || []).length === 0 && <div className="px-4 py-3 text-2xs text-gray-400">No task-linked AI spend yet.</div>}
                {(roi.tasks || []).map((t: any) => (
                  <div key={t.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 items-center">
                    <span className="text-2xs font-mono font-bold text-indigo-600">{t.task_key || '—'}</span>
                    <span className="text-xs text-gray-800 truncate" title={t.title}>{t.title}{t.status && <span className="ml-1.5 text-2xs text-gray-400">· {t.status}</span>}</span>
                    <span className="text-2xs text-gray-500 text-right">{t.prompts}</span>
                    <span className="text-2xs text-gray-500 text-right">{t.story_points || '—'}</span>
                    <span className="text-xs font-semibold text-rose-600 text-right">{fmtUsd(t.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </DevPortalLayout>
  );
}
