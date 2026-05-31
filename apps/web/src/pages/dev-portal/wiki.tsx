import { useState, useEffect, useRef } from 'react';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';
import { SafeMarkdown } from '@/components/dev-portal/SafeMarkdown';

const ICONS = ['📄', '📋', '📖', '📝', '📚', '📐', '📊', '📁', '🔧', '🏗', '🚀', '💡', '🎯', '🛡', '⚙', '🔌', '🗄', '🧪', '🌍', '📦', '🏛', '🧮', '💰', '🤖', '🔄', '🏢', '📡', '🧾', '💳', '📈', '📒', '🏦', '🎯', '👥'];

const DOMAIN_TEMPLATES: Record<string, { label: string; icon: string; template: string }> = {
  api: { label: 'API Endpoint Guide', icon: '🔌', template: `# API Endpoint Guide\n\n## Overview\nDescribe the endpoint purpose.\n\n## Endpoint\n\`\`\`\nGET /api/v1/dev-portal/resource\n\`\`\`\n\n## Authentication\n- Requires: dev_portal_token (dev-portal middleware)\n\n## Request\n\`\`\`json\n{ "field": "value" }\n\`\`\`\n\n## Response\n\`\`\`json\n{ "success": true, "data": {} }\n\`\`\`\n\n## Error Codes\n| Code | Message |\n|------|---------|\n| 400 | Validation error |\n| 404 | Not found |` },
  migration: { label: 'Database Migration', icon: '🗄', template: `# Migration: dev_[table_name]\n\n## Purpose\nDescribe what this migration adds.\n\n## Table Schema\n| Column | Type | Description |\n|--------|------|-------------|\n| id | uuid PK | gen_random_uuid |\n| created_at | timestamp | Auto |\n\n## Security\n- RLS policy on the new dev_* table\n- Scripts SET LOCAL app.current_member_id\n\n## File\ninfrastructure/migrations/081_dev_[name].js (knex up/down + hasTable guard)\n\n## Rollback\n\`DROP TABLE dev_[table_name]\`` },
  feature: { label: 'Feature Spec', icon: '✨', template: `# Feature: [Name]\n\n## Overview\nBrief description of the feature.\n\n## User Stories\n- As a [role], I want to [action] so that [benefit]\n\n## UI/UX\n- Page: \`/dev-portal/[path]\`\n- Layout: DevPortalLayout with tabs\n- Components: Hero, Table, Modal\n\n## API\n- \`GET /api/v1/dev-portal/resource\` — list\n- \`POST /api/v1/dev-portal/resource\` — create\n\n## Database\n- Table: \`dev_[table_name]\`\n- Migration: \`081_dev_[name].js\`\n\n## Security\nValidated by the dev_portal_token middleware; RLS on dev_* tables.` },
  process: { label: 'Team Process', icon: '📋', template: `# Process: [Name]\n\n## Overview\nBrief description of the team process.\n\n## Steps\n1. **Step 1** — Description\n2. **Step 2** — Description\n3. **Step 3** — Description\n\n## Roles Involved\n- Lead: initiates\n- Reviewer: reviews\n- Agent: automates\n\n## Rules\n- Rule 1\n- Rule 2\n\n## Related Modules\n- Module A → impact\n- Module B → dependency` },
  troubleshoot: { label: 'Troubleshooting', icon: '🔧', template: `# Troubleshooting: [Topic]\n\n## Common Issues\n\n### Issue 1: [Description]\n**Symptoms:** What the user sees\n**Cause:** Root cause\n**Fix:**\n\`\`\`bash\nnpm run fix\n\`\`\`\n\n### Issue 2: [Description]\n**Symptoms:** What the user sees\n**Cause:** Root cause\n**Fix:** Steps to resolve\n\n## Debug Checklist\n- [ ] Check console for errors\n- [ ] Verify API response\n- [ ] Check data isolation\n- [ ] Test with different roles` },
  design: { label: 'Design / UI Pattern', icon: '🎨', template: `# UI Pattern: [Component Name]\n\n## Preview\nDescribe what this component looks like.\n\n## Usage\n\`\`\`tsx\n<Component prop="value" />\n\`\`\`\n\n## Tailwind Classes\n\`\`\`\nbg-white border border-gray-200 rounded-xl p-4\n\`\`\`\n\n## Variants\n| Variant | Class | Use Case |\n|---------|-------|----------|\n| Default | bg-white | Standard |\n| Active | bg-indigo-50 | Selected |\n| Danger | bg-red-50 | Error |\n\n## Design Tokens\n- Border radius: rounded-xl (12px)\n- Border: border-gray-200\n- Text: text-sm text-gray-700\n- Heading: text-xs font-semibold` },
  architecture: { label: 'Architecture Decision', icon: '🏗', template: `# ADR: [Title]\n\n## Status\nAccepted / Proposed / Deprecated\n\n## Context\nWhat is the issue that we're seeing that is motivating this decision?\n\n## Decision\nWhat is the change that we're proposing?\n\n## Consequences\n### Positive\n- Benefit 1\n- Benefit 2\n\n### Negative\n- Trade-off 1\n\n## Alternatives Considered\n- Option A: rejected because...\n- Option B: rejected because...` },
};

export default function DevPortalWiki() {
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [pages, setPages] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newPage, setNewPage] = useState({ title: '', icon: '📄', content: '', parent_id: '' });
  const [editData, setEditData] = useState({ title: '', icon: '', content: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [showToc, setShowToc] = useState(true);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
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

  const loadPages = async (pid?: string) => {
    const id = pid || projectId;
    if (!id) return;
    const r = await devApi('get', `/projects/${id}/wiki`);
    const list = r.data.data || [];
    setPages(list);
    // Auto-expand all categories
    const cats = new Set<string>();
    list.filter((p: any) => !p.parent_id && list.some((c: any) => c.parent_id === p.id)).forEach((p: any) => cats.add(p.id));
    setExpandedCats(cats);
  };

  const loadPage = async (page: any) => {
    const r = await devApi('get', `/wiki/${page.id}`);
    setSelected(r.data.data);
    setEditing(false);
    setConfirmDelete(null);
  };

  const createPage = async () => {
    if (!newPage.title.trim() || !projectId) return;
    const payload = { ...newPage, parent_id: newPage.parent_id || undefined };
    const r = await devApi('post', `/projects/${projectId}/wiki`, payload);
    setShowCreate(false);
    setNewPage({ title: '', icon: '📄', content: '', parent_id: '' });
    await loadPages();
    if (r.data.data) loadPage(r.data.data);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditData({ title: selected.title, icon: selected.icon || '📄', content: selected.content || '' });
    setEditing(true);
    setTimeout(() => contentRef.current?.focus(), 100);
  };

  const saveEdit = async () => {
    if (!selected) return;
    await devApi('put', `/wiki/${selected.id}`, editData);
    const r = await devApi('get', `/wiki/${selected.id}`);
    setSelected(r.data.data);
    setEditing(false);
    await loadPages();
  };

  const deletePage = async (pageId: string) => {
    await devApi('delete', `/wiki/${pageId}`);
    setSelected(null);
    setConfirmDelete(null);
    await loadPages();
  };

  const generateDomainPages = async () => {
    if (!projectId) return;
    setGenerating(true);
    try {
      await devApi('post', `/projects/${projectId}/wiki/generate-domains`);
      await loadPages();
    } catch {}
    setGenerating(false);
  };

  const applyTemplate = (key: string) => {
    const t = DOMAIN_TEMPLATES[key];
    if (t) setNewPage({ ...newPage, icon: t.icon, content: t.template, title: newPage.title || t.label });
  };

  const toggleCat = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  // Build tree
  const childMap: Record<string, any[]> = {};
  pages.forEach(p => { if (p.parent_id) { if (!childMap[p.parent_id]) childMap[p.parent_id] = []; childMap[p.parent_id].push(p); } });
  const rootPages = pages.filter(p => !p.parent_id);

  const filteredPages = search
    ? pages.filter(p => (p.title || '').toLowerCase().includes((search || '').toLowerCase()) || (p.content || '').toLowerCase().includes((search || '').toLowerCase()))
    : null;

  // TOC from selected page content
  const tocItems = selected?.content ? selected.content.split('\n').filter((l: string) => /^#{1,3} /.test(l)).map((l: string) => {
    const level = l.match(/^(#+)/)?.[0].length || 1;
    const text = l.replace(/^#+\s*/, '');
    return { level, text };
  }) : [];

  const isMgr = ['ceo', 'lead', 'product_owner'].includes(user.role);
  const hasDomainPages = pages.some(p => p.slug?.startsWith('domain-'));


  return (
    <DevPortalLayout user={user} title="Wiki">
      <div className="flex h-[calc(100vh-7rem)] gap-0">

        {/* ── Sidebar ── */}
        <div className="w-64 shrink-0 flex flex-col bg-white rounded-l-2xl border border-gray-200 border-r-0 overflow-hidden">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-900">Wiki</h2>
              <div className="flex gap-1">
                {isMgr && !hasDomainPages && (
                  <button onClick={generateDomainPages} disabled={generating} title="Generate domain knowledge pages"
                    className="w-6 h-6 rounded-md bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white flex items-center justify-center text-2xs transition-colors font-bold">
                    {generating ? '...' : '🧠'}
                  </button>
                )}
                <button onClick={() => setShowCreate(true)} className="w-6 h-6 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center text-xs transition-colors" title="New Page">+</button>
              </div>
            </div>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search wiki..."
              className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-2xs text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20" />
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {(filteredPages || rootPages).length === 0 && (
              <div className="text-center py-8 px-3">
                <p className="text-2xs text-gray-400">No pages yet</p>
                {isMgr && <button onClick={generateDomainPages} disabled={generating} className="mt-2 text-2xs text-indigo-500 hover:text-indigo-700 font-medium">{generating ? 'Generating...' : 'Generate Domain Knowledge'}</button>}
              </div>
            )}
            {filteredPages ? (
              filteredPages.map(p => (
                <SidebarItem key={p.id} page={p} selected={selected} onSelect={loadPage} isChild={false} />
              ))
            ) : (
              rootPages.map(p => {
                const children = childMap[p.id] || [];
                const hasChildren = children.length > 0;
                const isExpanded = expandedCats.has(p.id);
                return (
                  <div key={p.id}>
                    <div className="flex items-center">
                      {hasChildren && (
                        <button onClick={() => toggleCat(p.id)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0 ml-1">
                          <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        </button>
                      )}
                      <SidebarItem page={p} selected={selected} onSelect={loadPage} isChild={false} indent={!hasChildren} />
                    </div>
                    {hasChildren && isExpanded && children.map(child => (
                      <SidebarItem key={child.id} page={child} selected={selected} onSelect={loadPage} isChild={true} />
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 text-2xs text-gray-400 flex justify-between">
            <span>{pages.length} pages</span>
            {hasDomainPages && <span className="text-indigo-400">{pages.filter(p => p.slug?.startsWith('domain-')).length} domains</span>}
          </div>
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 min-w-0 bg-white rounded-r-2xl border border-gray-200 border-l flex flex-col overflow-hidden relative">

          {/* Create Page Modal */}
          {showCreate && (
            <div className="absolute inset-0 bg-black/20 z-50 flex items-start justify-center pt-16 overflow-y-auto" onClick={() => setShowCreate(false)}>
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-[600px] my-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">New Wiki Page</h3>
                  <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {/* Templates */}
                  <div>
                    <label className="text-2xs text-gray-500 font-semibold uppercase tracking-wider mb-2 block">Start from Template</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Object.entries(DOMAIN_TEMPLATES).map(([key, t]) => (
                        <button key={key} onClick={() => applyTemplate(key)}
                          className="text-left px-2.5 py-2 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                          <div className="flex items-center gap-1.5"><span className="text-sm">{t.icon}</span><span className="text-2xs font-medium text-gray-700">{t.label}</span></div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="shrink-0">
                      <label className="text-2xs text-gray-500 font-medium mb-1 block">Icon</label>
                      <div className="flex flex-wrap gap-0.5 w-28">
                        {ICONS.slice(0, 16).map(ic => (
                          <button key={ic} onClick={() => setNewPage({ ...newPage, icon: ic })} className={`w-6 h-6 rounded flex items-center justify-center text-xs ${newPage.icon === ic ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-100'}`}>{ic}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="text-2xs text-gray-500 font-medium mb-1 block">Title *</label>
                        <input value={newPage.title} onChange={e => setNewPage({ ...newPage, title: e.target.value })} placeholder="e.g. API Authentication Guide" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" autoFocus />
                      </div>
                      <div>
                        <label className="text-2xs text-gray-500 font-medium mb-1 block">Parent Page</label>
                        <select value={newPage.parent_id} onChange={e => setNewPage({ ...newPage, parent_id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700">
                          <option value="">No parent (root page)</option>
                          {pages.filter(p => !p.parent_id).map(p => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-2xs text-gray-500 font-medium mb-1 block">Content (Markdown)</label>
                    <textarea value={newPage.content} onChange={e => setNewPage({ ...newPage, content: e.target.value })} rows={12} placeholder="# Getting Started&#10;&#10;Write your documentation here using Markdown..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 leading-relaxed" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg font-medium">Cancel</button>
                    <button onClick={createPage} disabled={!newPage.title.trim()} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold rounded-lg">Create Page</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Selected Page View */}
          {selected ? (
            <>
              {/* Header */}
              <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {editing ? (
                    <>
                      <div className="flex flex-wrap gap-0.5">
                        {ICONS.slice(0, 10).map(ic => (
                          <button key={ic} onClick={() => setEditData({ ...editData, icon: ic })} className={`w-5 h-5 rounded flex items-center justify-center text-2xs ${editData.icon === ic ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-100'}`}>{ic}</button>
                        ))}
                      </div>
                      <input value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} className="text-base font-bold text-gray-900 border-b-2 border-indigo-300 focus:outline-none px-1 py-0.5 flex-1 min-w-0" />
                    </>
                  ) : (
                    <>
                      <span className="text-xl">{selected.icon || '📄'}</span>
                      <div className="min-w-0">
                        <h1 className="text-base font-bold text-gray-900 truncate">{selected.title}</h1>
                        {selected.slug?.startsWith('domain-') && <span className="text-2xs px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium">Domain Knowledge</span>}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!editing && tocItems.length > 2 && (
                    <button onClick={() => setShowToc(!showToc)} className={`px-2 py-1 text-2xs rounded-md transition-colors ${showToc ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>TOC</button>
                  )}
                  {editing ? (
                    <>
                      <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg font-medium">Cancel</button>
                      <button onClick={saveEdit} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg">Save</button>
                    </>
                  ) : (
                    <>
                      <button onClick={startEdit} className="px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg font-medium hover:bg-indigo-50 transition-colors">Edit</button>
                      {confirmDelete === selected.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-2xs text-red-500">Delete?</span>
                          <button onClick={() => deletePage(selected.id)} className="px-2 py-1 bg-red-500 text-white text-2xs font-bold rounded">Yes</button>
                          <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 text-gray-400 text-2xs">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(selected.id)} className="px-3 py-1.5 text-xs text-red-400 border border-red-200 rounded-lg font-medium hover:bg-red-50 transition-colors">Delete</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Meta bar */}
              <div className="px-6 py-1.5 border-b border-gray-50 flex items-center gap-4 text-2xs text-gray-400 shrink-0">
                <span className="font-mono">{selected.slug}</span>
                <span>{new Date(selected.updated_at || selected.created_at).toLocaleString('de-DE')}</span>
                {selected.content && <span>{selected.content.split('\n').length} lines</span>}
                {selected.parent_id && (() => { const parent = pages.find(p => p.id === selected.parent_id); return parent ? <span>in {parent.icon} {parent.title}</span> : null; })()}
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-y-auto flex">
                {/* TOC sidebar */}
                {showToc && !editing && tocItems.length > 2 && (
                  <div className="w-48 shrink-0 border-r border-gray-100 p-3 overflow-y-auto">
                    <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contents</p>
                    <div className="space-y-0.5">
                      {tocItems.map((item: any, i: number) => (
                        <button key={i} className={`block text-left w-full text-2xs py-0.5 hover:text-indigo-600 transition-colors truncate ${item.level === 1 ? 'font-semibold text-gray-700' : item.level === 2 ? 'pl-2 text-gray-600' : 'pl-4 text-gray-500'}`}>
                          {item.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Main content */}
                <div className="flex-1 px-6 py-5 overflow-y-auto">
                  {editing ? (
                    <textarea ref={contentRef} value={editData.content} onChange={e => setEditData({ ...editData, content: e.target.value })}
                      className="w-full h-full min-h-[500px] px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:ring-2 focus:ring-indigo-500/20 leading-relaxed resize-none"
                      placeholder="Write your content in Markdown..." />
                  ) : (
                    <div className="max-w-3xl"><SafeMarkdown content={selected.content || ''} /></div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4"><span className="text-3xl">📚</span></div>
                <h2 className="text-base font-bold text-gray-900">Developer Wiki</h2>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Select a page from the sidebar or create a new one.</p>
                <div className="flex gap-2 justify-center mt-4">
                  <button onClick={() => setShowCreate(true)} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg">New Page</button>
                  {isMgr && !hasDomainPages && (
                    <button onClick={generateDomainPages} disabled={generating} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5">
                      {generating ? 'Generating...' : '🧠 Generate Domain Knowledge'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DevPortalLayout>
  );
}

function SidebarItem({ page, selected, onSelect, isChild, indent }: { page: any; selected: any; onSelect: (p: any) => void; isChild: boolean; indent?: boolean }) {
  const isDomain = page.slug?.startsWith('domain-');
  const isCat = page.slug?.startsWith('cat-');
  return (
    <button
      onClick={() => onSelect(page)}
      className={`w-full text-left ${isChild ? 'pl-7' : indent ? 'pl-3' : 'pl-0'} pr-3 py-1.5 flex items-center gap-1.5 transition-colors text-xs ${
        selected?.id === page.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : isCat ? 'text-gray-800 font-semibold hover:bg-gray-50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <span className={`shrink-0 ${isChild ? 'text-xs' : 'text-sm'}`}>{page.icon || '📄'}</span>
      <span className="truncate flex-1">{page.title}</span>
      {isDomain && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />}
    </button>
  );
}

