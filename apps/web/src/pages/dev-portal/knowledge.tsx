import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';
import { SafeMarkdown } from '@/components/dev-portal/SafeMarkdown';

const TABS = [
  { key: 'docs', label: 'Docs', icon: '📝' },
  { key: 'guide', label: 'Dev Guide', icon: '📘' },
  { key: 'handbook', label: 'Handbook', icon: '📗' },
  { key: 'map', label: 'Project Map', icon: '📂' },
  { key: 'architecture', label: 'Architecture', icon: '🏗' },
  { key: 'design', label: 'Design', icon: '🎨' },
];

const DOMAIN_TEMPLATES: Record<string, { label: string; icon: string; template: string }> = {
  api: { label: 'API Endpoint', icon: '🔌', template: `# API Endpoint Guide\n\n## Overview\nDescribe the endpoint purpose.\n\n## Endpoint\n\`\`\`\nGET /api/v1/dev-portal/resource\n\`\`\`\n\n## Authentication\n- Requires: dev_portal_token (dev-portal middleware)\n\n## Request\n\`\`\`json\n{ "field": "value" }\n\`\`\`\n\n## Response\n\`\`\`json\n{ "success": true, "data": {} }\n\`\`\`` },
  migration: { label: 'Migration', icon: '🗄', template: `# Migration: dev_[table_name]\n\n## Purpose\nDescribe what this migration adds.\n\n## Schema\n| Column | Type | Description |\n|--------|------|-------------|\n| id | uuid PK | gen_random_uuid |\n| created_at | timestamp | Auto |\n\n_File: infrastructure/migrations/081_dev_[name].js (knex up/down + hasTable guard)._` },
  feature: { label: 'Feature Spec', icon: '✨', template: `# Feature: [Name]\n\n## Overview\nBrief description.\n\n## User Stories\n- As a [role], I want to [action] so that [benefit]` },
  process: { label: 'Business Process', icon: '📋', template: `# Process: [Name]\n\n## Steps\n1. Step 1\n2. Step 2` },
  troubleshoot: { label: 'Troubleshooting', icon: '🔧', template: `# Troubleshooting: [Topic]\n\n## Issues\n### Issue 1\n**Symptoms:** ...\n**Fix:** ...` },
  architecture: { label: 'ADR', icon: '🏗', template: `# ADR: [Title]\n\n## Status\nAccepted\n\n## Context\n...\n\n## Decision\n...` },
};

export default function DevPortalKnowledge() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [tab, setTab] = useState((router.query.tab as string) || 'docs');

  // Shared state
  const [projectId, setProjectId] = useState('');
  const [scan, setScan] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [wikiPages, setWikiPages] = useState<any[]>([]);

  // Wiki/Docs state
  const [selected, setSelected] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newPage, setNewPage] = useState({ title: '', icon: '📄', content: '', parent_id: '' });
  const [editData, setEditData] = useState({ title: '', icon: '', content: '' });
  const [docSearch, setDocSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Guide wiki pages
  const [guideWiki, setGuideWiki] = useState<any>(null);
  const [handbookWiki, setHandbookWiki] = useState<any>(null);
  const [archWiki, setArchWiki] = useState<any>(null);

  // Project Map state
  const [mapTab, setMapTab] = useState<'overview' | 'routes' | 'domains' | 'pages' | 'migrations'>('overview');
  const [mapSearch, setMapSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    devApi('get', '/project-scan').then(r => setScan(r.data.data)).catch(() => {});
    if (activeProjectId) {
      setProjectId(activeProjectId);
      loadPages(activeProjectId);
    } else {
      devApi('get', '/projects').then(r => {
        if (r.data.data?.[0]) {
          const pid = r.data.data[0].id;
          setProjectId(pid);
          loadPages(pid);
        }
      });
    }
  }, [user, activeProjectId]);

  useEffect(() => {
    if (router.query.tab && typeof router.query.tab === 'string') setTab(router.query.tab);
  }, [router.query.tab]);

  const loadPages = async (pid?: string) => {
    const id = pid || projectId;
    if (!id) return;
    const r = await devApi('get', `/projects/${id}/wiki`);
    const list = r.data.data || [];
    setWikiPages(list);
    // Load specific wiki pages for guide/handbook/architecture
    const guideP = list.find((p: any) => p.slug === 'guide-developer');
    const handbookP = list.find((p: any) => p.slug === 'guide-handbook');
    const archP = list.find((p: any) => p.slug === 'guide-architecture');
    if (guideP) devApi('get', `/wiki/${guideP.id}`).then(wp => setGuideWiki(wp.data.data)).catch(() => {});
    if (handbookP) devApi('get', `/wiki/${handbookP.id}`).then(wp => setHandbookWiki(wp.data.data)).catch(() => {});
    if (archP) devApi('get', `/wiki/${archP.id}`).then(wp => setArchWiki(wp.data.data)).catch(() => {});
  };

  const loadPage = async (page: any) => {
    const r = await devApi('get', `/wiki/${page.id}`);
    setSelected(r.data.data);
    setEditing(false);
  };

  const syncAll = async () => {
    if (!projectId) return;
    setSyncing(true);
    await devApi('post', `/projects/${projectId}/wiki/sync-project`);
    const s = await devApi('get', '/project-scan'); setScan(s.data.data);
    await loadPages(projectId);
    setSyncing(false);
  };

  const generateDomains = async () => {
    if (!projectId) return;
    setGenerating(true);
    await devApi('post', `/projects/${projectId}/wiki/generate-domains`);
    await loadPages(projectId);
    setGenerating(false);
  };

  const savePage = async () => {
    if (!selected) return;
    await devApi('put', `/wiki/${selected.id}`, editData);
    setEditing(false);
    await loadPages();
    const r = await devApi('get', `/wiki/${selected.id}`);
    setSelected(r.data.data);
  };

  const createPage = async () => {
    if (!newPage.title.trim()) return;
    await devApi('post', `/projects/${projectId}/wiki`, newPage);
    setShowCreate(false);
    setNewPage({ title: '', icon: '📄', content: '', parent_id: '' });
    await loadPages();
  };

  const deletePage = async (id: string) => {
    await devApi('delete', `/wiki/${id}`);
    setSelected(null);
    await loadPages();
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  const m = scan?.metrics;
  const isMgr = ['ceo', 'lead', 'product_owner'].includes(user.role);
  const filterList = (items: any[], key: string) => mapSearch ? items.filter(i => (i[key] || '').toLowerCase().includes((mapSearch || '').toLowerCase())) : items;

  // Categorize wiki pages
  const rootPages = wikiPages.filter(p => !p.parent_id);
  const childPages = (parentId: string) => wikiPages.filter(p => p.parent_id === parentId);
  const filteredPages = docSearch ? wikiPages.filter(p => (p.title || '').toLowerCase().includes((docSearch || '').toLowerCase())) : rootPages;

  return (
    <DevPortalLayout user={user} title="Knowledge">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Knowledge Base</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {m ? `${m.routeFiles} routes · ${m.totalEndpoints}+ endpoints · ${m.migrations} migrations · ${m.domains} domains · ${m.pages} pages` : 'Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isMgr && <button onClick={syncAll} disabled={syncing} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">{syncing ? 'Syncing...' : 'Sync All'}</button>}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); router.replace({ query: { ...router.query, tab: t.key } }, undefined, { shallow: true }); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${tab === t.key ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ═══════ DOCS TAB ═══════ */}
        {tab === 'docs' && (
          <div className="flex gap-4" style={{ height: 'calc(100vh - 230px)' }}>
            {/* Sidebar */}
            <div className="w-72 bg-white border border-gray-200 rounded-xl flex flex-col shrink-0 overflow-hidden">
              <div className="p-3 border-b border-gray-100 space-y-2">
                <input type="text" value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="Search docs..." className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20" />
                <div className="flex gap-1">
                  {isMgr && <button onClick={() => setShowCreate(true)} className="flex-1 text-2xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg">+ New Page</button>}
                  {isMgr && <button onClick={generateDomains} disabled={generating} className="text-2xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg">{generating ? '...' : 'Auto-gen'}</button>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {filteredPages.map(page => (
                  <div key={page.id}>
                    <button onClick={() => loadPage(page)} className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${selected?.id === page.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <span>{page.icon} {page.title}</span>
                    </button>
                    {childPages(page.id).map(child => (
                      <button key={child.id} onClick={() => loadPage(child)} className={`w-full text-left pl-7 pr-2.5 py-1.5 rounded-lg text-xs transition-colors ${selected?.id === child.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-50'}`}>
                        {child.icon} {child.title}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
              {selected ? (
                <>
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">{selected.icon} {selected.title}</h2>
                      <p className="text-2xs text-gray-400">{selected.last_edited_by ? `Edited ${new Date(selected.updated_at).toLocaleDateString()}` : ''}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {isMgr && !editing && <button onClick={() => { setEditData({ title: selected.title, icon: selected.icon, content: selected.content }); setEditing(true); }} className="px-2.5 py-1 text-2xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">Edit</button>}
                      {editing && <button onClick={savePage} className="px-2.5 py-1 text-2xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Save</button>}
                      {editing && <button onClick={() => setEditing(false)} className="px-2.5 py-1 text-2xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>}
                      {isMgr && !editing && <button onClick={() => deletePage(selected.id)} className="px-2.5 py-1 text-2xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    {editing ? (
                      <div className="space-y-3">
                        <input type="text" value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold" />
                        <textarea ref={contentRef} value={editData.content} onChange={e => setEditData({ ...editData, content: e.target.value })} className="w-full h-[60vh] px-4 py-3 border border-gray-200 rounded-lg text-xs font-mono leading-relaxed resize-none focus:ring-2 focus:ring-indigo-500/20" />
                      </div>
                    ) : (
                      <SafeMarkdown content={selected.content || ''} />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                  <div className="text-center">
                    <span className="text-3xl block mb-2">📝</span>
                    <p>Select a page to view</p>
                    <p className="text-2xs mt-1 text-gray-300">{wikiPages.length} pages available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Create modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
                <div className="bg-white rounded-2xl p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-bold mb-4">New Documentation Page</h3>
                  <div className="space-y-3">
                    <input type="text" value={newPage.title} onChange={e => setNewPage({ ...newPage, title: e.target.value })} placeholder="Page title..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    <select value={newPage.parent_id} onChange={e => setNewPage({ ...newPage, parent_id: e.target.value })} className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs">
                      <option value="">No parent (root)</option>
                      {rootPages.map(p => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
                    </select>
                    <div>
                      <p className="text-2xs text-gray-500 font-semibold mb-1.5">Quick templates:</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(DOMAIN_TEMPLATES).map(([k, v]) => (
                          <button key={k} onClick={() => setNewPage({ ...newPage, icon: v.icon, content: v.template, title: newPage.title || v.label })} className="px-2 py-1 text-2xs border border-gray-200 rounded-lg hover:bg-gray-50">{v.icon} {v.label}</button>
                        ))}
                      </div>
                    </div>
                    <textarea value={newPage.content} onChange={e => setNewPage({ ...newPage, content: e.target.value })} placeholder="Content (markdown)..." className="w-full h-40 px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono resize-none" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                      <button onClick={createPage} className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Create</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ DEV GUIDE TAB ═══════ */}
        {tab === 'guide' && (
          <div className="space-y-4">
            {m && (
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {[['Routes', m.routeFiles], ['Endpoints', m.totalEndpoints + '+'], ['Migrations', m.migrations], ['Tables', m.dbTables + '+'], ['Domains', m.domains], ['Packages', m.packages], ['Pages', m.pages], ['TS Files', m.tsFiles]].map(([l, v]) => (
                  <div key={l as string} className="bg-white border border-gray-200 rounded-xl p-2.5 text-center">
                    <p className="text-base font-bold text-gray-900">{v}</p><p className="text-2xs text-gray-400">{l}</p>
                  </div>
                ))}
              </div>
            )}
            {guideWiki?.content ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 max-h-[60vh] overflow-y-auto"><SafeMarkdown content={guideWiki.content} /></div>
            ) : (
              <EmptyState label="Dev Guide" isMgr={isMgr} syncing={syncing} onSync={syncAll} />
            )}
            {scan?.routes && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-700">API Routes (live)</h3>
                  <span className="text-2xs text-gray-400">{scan.routes.length} files · {m?.totalEndpoints} endpoints</span>
                </div>
                <div className="divide-y divide-gray-50 max-h-[40vh] overflow-y-auto">{scan.routes.map((r: any) => (
                  <div key={r.file} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                    <span className="text-xs font-mono text-gray-700">{r.name}</span>
                    <span className="text-2xs text-gray-400">{r.endpoints} endpoints</span>
                  </div>
                ))}</div>
              </div>
            )}
            {scan?.domains && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100"><h3 className="text-xs font-semibold text-gray-700">Domains (live) — {scan.domains.length}</h3></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0 max-h-[40vh] overflow-y-auto">{scan.domains.map((d: any) => (
                  <div key={d.name} className="px-3 py-2 border-b border-r border-gray-50">
                    <p className="text-xs font-medium text-gray-800">{d.name}</p><p className="text-2xs text-gray-400">{d.files} files</p>
                  </div>
                ))}</div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ HANDBOOK TAB ═══════ */}
        {tab === 'handbook' && (
          <div className="space-y-4">
            {handbookWiki?.content ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 max-h-[75vh] overflow-y-auto"><SafeMarkdown content={handbookWiki.content} /></div>
            ) : (
              <EmptyState label="Handbook" isMgr={isMgr} syncing={syncing} onSync={syncAll} />
            )}
          </div>
        )}

        {/* ═══════ PROJECT MAP TAB ═══════ */}
        {tab === 'map' && (
          <div className="space-y-4">
            {m && (
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {[['Routes', m.routeFiles, 'indigo'], ['Endpoints', m.totalEndpoints + '+', 'blue'], ['Migrations', m.migrations, 'purple'], ['Tables', m.dbTables + '+', 'violet'], ['Domains', m.domains, 'emerald'], ['Packages', m.packages, 'cyan'], ['Pages', m.pages, 'amber'], ['TS Files', m.tsFiles, 'gray']].map(([l, v, c]) => (
                  <div key={l as string} className={`bg-${c}-50 border border-${c}-100 rounded-xl p-2.5 text-center`}>
                    <p className="text-base font-bold text-gray-900">{v}</p><p className="text-2xs text-gray-500">{l}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1 border-b border-gray-200 pb-px">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'routes', label: `Routes (${scan?.routes?.length || 0})` },
                { key: 'domains', label: `Domains (${scan?.domains?.length || 0})` },
                { key: 'pages', label: `Pages (${scan?.pages?.length || 0})` },
                { key: 'migrations', label: `Migrations (${scan?.migrations?.length || 0})` },
              ].map(t => (
                <button key={t.key} onClick={() => setMapTab(t.key as any)} className={`px-4 py-2 text-xs font-medium rounded-t-lg -mb-px ${mapTab === t.key ? 'bg-white border border-gray-200 border-b-white text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
              ))}
            </div>
            {mapTab !== 'overview' && <input type="text" value={mapSearch} onChange={e => setMapSearch(e.target.value)} placeholder="Filter..." className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20" />}

            {mapTab === 'overview' && scan && (
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
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Packages ({scan.packages?.length || 0})</h3>
                  <div className="grid grid-cols-3 gap-2">{(scan.packages || []).map((p: any) => (
                    <div key={p.name} className="px-3 py-2 bg-gray-50 rounded-lg">
                      <p className="text-xs font-mono font-medium text-gray-800">@vibestudio/{p.name}</p>
                      {p.description && <p className="text-2xs text-gray-500 mt-0.5">{p.description}</p>}
                    </div>
                  ))}</div>
                </div>
              </div>
            )}
            {mapTab === 'routes' && scan?.routes && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 text-2xs text-gray-400 font-semibold uppercase sticky top-0 bg-white">
                  <span>Route</span><span>Endpoints</span><span>Path</span>
                </div>
                {filterList(scan.routes, 'name').map((r: any) => (
                  <div key={r.file} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50"><span className="text-xs font-medium text-gray-800">{r.name}</span><span className="text-xs font-bold text-indigo-600">{r.endpoints}</span><span className="text-2xs font-mono text-gray-400">apps/api/src/routes/{r.file}</span></div>
                ))}
              </div>
            )}
            {mapTab === 'domains' && scan?.domains && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                {filterList(scan.domains, 'name').map((d: any) => (
                  <div key={d.name} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 hover:bg-gray-50"><span className="text-xs font-medium text-gray-800">{d.name}</span><span className="text-2xs text-gray-400">{d.files} files · {d.mainFile || ''}</span></div>
                ))}
              </div>
            )}
            {mapTab === 'pages' && scan?.pages && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                {filterList(scan.pages, 'path').map((p: any) => (
                  <div key={p.file} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 hover:bg-gray-50">
                    <a href={`http://localhost:3100${p.path}`} target="_blank" rel="noopener" className="text-xs text-indigo-600 hover:underline font-mono">{p.path}</a>
                    <span className="text-2xs font-mono text-gray-400">{p.file}</span>
                  </div>
                ))}
              </div>
            )}
            {mapTab === 'migrations' && scan?.migrations && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                {filterList(scan.migrations, 'name').reverse().map((mi: any) => (
                  <div key={mi.file} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 hover:bg-gray-50">
                    <span className="text-xs font-bold text-purple-600 w-8">{mi.number}</span>
                    <span className="text-xs text-gray-800 flex-1 capitalize">{mi.name}</span>
                    <span className="text-2xs font-mono text-gray-400">{mi.file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ ARCHITECTURE TAB ═══════ */}
        {tab === 'architecture' && (
          <div className="space-y-4">
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
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-gray-700 mb-3">Access &amp; Security</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { n: 1, title: 'Auth — dev_portal_token', desc: 'httpOnly JWT cookie + Bearer fallback. Validated by the dev-portal middleware (VibeStudio\'s own token).', color: 'border-red-300 bg-red-50' },
                  { n: 2, title: 'Roles', desc: 'ceo / lead / product_owner + AI agent roles (agent_*). Route-level gating.', color: 'border-amber-300 bg-amber-50' },
                  { n: 3, title: 'Database — PostgreSQL RLS', desc: 'RLS on dev_* tables (SET LOCAL app.current_member_id).', color: 'border-blue-300 bg-blue-50' },
                  { n: 4, title: 'Audit', desc: 'logActivity() records every mutation into dev_activity_log.', color: 'border-emerald-300 bg-emerald-50' },
                ].map(l => (
                  <div key={l.n} className={`border rounded-xl p-3 ${l.color}`}>
                    <p className="text-xs font-semibold text-gray-800">Layer {l.n}: {l.title}</p>
                    <p className="text-2xs text-gray-600 mt-1">{l.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            {archWiki?.content && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 max-h-[50vh] overflow-y-auto"><SafeMarkdown content={archWiki.content} /></div>
            )}
          </div>
        )}

        {/* ═══════ DESIGN TAB ═══════ */}
        {tab === 'design' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900">Design System</h3>
                <a href={process.env.NEXT_PUBLIC_FIGMA_DESIGN_SYSTEM_URL || 'https://www.figma.com/'} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-1.5">
                  Open Figma
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                </a>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-700">Colors</h4>
                  {[
                    { name: 'Primary', class: 'bg-indigo-600', hex: '#4F46E5' },
                    { name: 'Success', class: 'bg-emerald-500', hex: '#10B981' },
                    { name: 'Warning', class: 'bg-amber-500', hex: '#F59E0B' },
                    { name: 'Danger', class: 'bg-red-500', hex: '#EF4444' },
                    { name: 'Info', class: 'bg-blue-500', hex: '#3B82F6' },
                  ].map(c => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg ${c.class}`} />
                      <div><p className="text-xs font-medium text-gray-800">{c.name}</p><p className="text-2xs text-gray-400 font-mono">{c.hex}</p></div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-700">Components</h4>
                  {[
                    { name: 'Card', desc: 'bg-white border rounded-xl p-4' },
                    { name: 'Button Primary', desc: 'bg-indigo-600 text-white rounded-lg' },
                    { name: 'Input', desc: 'border rounded-lg text-sm' },
                    { name: 'Badge', desc: 'px-2 py-0.5 rounded-full text-2xs' },
                    { name: 'Table Row', desc: 'border-b hover:bg-gray-50' },
                  ].map(c => (
                    <div key={c.name} className="px-3 py-2 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-800">{c.name}</p>
                      <p className="text-2xs text-gray-400 font-mono">{c.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-700">Role Colors</h4>
                  {[
                    { role: 'CEO', class: 'bg-amber-500' },
                    { role: 'Lead', class: 'bg-blue-600' },
                    { role: 'Developer', class: 'bg-emerald-500' },
                    { role: 'Designer', class: 'bg-pink-500' },
                    { role: 'QA', class: 'bg-purple-500' },
                    { role: 'DevOps', class: 'bg-cyan-500' },
                    { role: 'AI Agent', class: 'bg-indigo-500' },
                  ].map(r => (
                    <div key={r.role} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-md ${r.class}`} />
                      <span className="text-xs text-gray-700">{r.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Typography</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-4"><span className="text-xl font-bold text-gray-900">Heading XL</span><span className="text-2xs text-gray-400 font-mono">text-xl font-bold</span></div>
                <div className="flex items-center gap-4"><span className="text-base font-bold text-gray-900">Heading Base</span><span className="text-2xs text-gray-400 font-mono">text-base font-bold</span></div>
                <div className="flex items-center gap-4"><span className="text-sm font-semibold text-gray-900">Heading SM</span><span className="text-2xs text-gray-400 font-mono">text-sm font-semibold</span></div>
                <div className="flex items-center gap-4"><span className="text-xs text-gray-700">Body Text</span><span className="text-2xs text-gray-400 font-mono">text-xs text-gray-700</span></div>
                <div className="flex items-center gap-4"><span className="text-2xs text-gray-400">Caption</span><span className="text-2xs text-gray-400 font-mono">text-2xs text-gray-400</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DevPortalLayout>
  );
}

function EmptyState({ label, isMgr, syncing, onSync }: { label: string; isMgr: boolean; syncing: boolean; onSync: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 text-center py-10">
      <p className="text-sm text-gray-500 mb-3">No {label} content yet.</p>
      {isMgr && <button onClick={onSync} disabled={syncing} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">{syncing ? 'Generating...' : 'Generate from Project'}</button>}
    </div>
  );
}
