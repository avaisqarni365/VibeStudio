import { useState, useEffect } from 'react';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

const TABS = [
  { key: 'profile', label: 'Profile', icon: '👤' },
  { key: 'docs', label: 'Project Docs', icon: '📖' },
  { key: 'updates', label: 'Project Updates', icon: '📋' },
  { key: 'versions', label: 'Version History', icon: '🏷' },
  { key: 'design', label: 'Design System', icon: '🎨' },
  { key: 'pipeline', label: 'Deployment Pipeline', icon: '🚀' },
  { key: 'github', label: 'GitHub / Git', icon: '🔗' },
];

// TODO: replace with the real ACCA design-system Figma URL.
// Must be a valid Figma file URL: https://www.figma.com/(file|design|proto)/<KEY>/<slug>
const FIGMA_DESIGN_SYSTEM_URL = process.env.NEXT_PUBLIC_FIGMA_DESIGN_SYSTEM_URL || '';

const isValidFigmaUrl = (url: string): boolean =>
  /^https:\/\/(www\.)?figma\.com\/(file|design|proto)\/[A-Za-z0-9]+(\/|$)/.test(url);

const buildFigmaEmbedSrc = (url: string): string =>
  `https://www.figma.com/embed?embed_host=acca-dev-portal&url=${encodeURIComponent(url)}`;

const VERSION_HISTORY = [
  { version: 'v1.0.0', date: '2026-05-31', status: 'current', sessions: '—', changes: ['Extracted into the standalone VibeStudio repo','Removed all accounting concepts (SKR03, journal entries, VAT, GoBD)','Config + DB repointed to vibestudio (ports 3100/4100, tunnel 5545)','AI Prompt Builder repointed to VibeStudio modules','VibeStudio-native Claude skills','Roadmap: standalone desktop (.exe) + mobile + Claude integration'] },
];

const PIPELINE = [
  { n: 1, stage: 'Development', env: 'Local', url: 'localhost:3100', status: 'active', desc: 'npm run dev' },
  { n: 2, stage: 'Build & Test', env: 'CI', url: 'GitHub Actions', status: 'pass', desc: 'ci.yml: lint, typecheck, test' },
  { n: 3, stage: 'Desktop Build', env: 'CI', url: 'GitHub Actions', status: 'planned', desc: 'Standalone .exe (Win/Mac/Linux)' },
  { n: 4, stage: 'Mobile Build', env: 'EAS', url: 'Expo', status: 'planned', desc: 'iOS / Android via EAS' },
  { n: 5, stage: 'Staging', env: 'IONOS', url: 'test-vibestudio.codes-ai.uk', status: 'ready', desc: 'systemd + smoke tests' },
  { n: 6, stage: 'Production', env: 'IONOS', url: 'vibestudio.codes-ai.uk', status: 'ready', desc: 'deploy.sh + systemd restart' },
];

const UPDATES = [
  { date: '2026-05-31', title: 'Standalone Extraction', items: ['Extracted from the host app into D:/VibeStudio','Purged accounting domains + German tax config','Config/DB defaults → vibestudio (ports 3100/4100, tunnel 5545)','AI Prompt Builder → VibeStudio modules','VibeStudio-native Claude skills','Next migration: 081'] },
  { date: 'Planned', title: 'Desktop & Mobile + Claude', items: ['Standalone desktop .exe shell','Mobile app (Expo / EAS)','Deeper Claude subscription + API integration','Version-controlled prompt library','Per-model A/B testing','Dark mode by default'] },
];


export default function DevPortalSettings() {
  const { user, loading, devApi } = useDevAuth();
  const [tab, setTab] = useState('profile');
  // Docs browser state
  const [docFiles, setDocFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<any>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [docCategory, setDocCategory] = useState('all');

  useEffect(() => {
    if (tab === 'docs' && docFiles.length === 0) {
      devApi('get', '/project-files').then(r => setDocFiles(r.data.data || [])).catch(() => {});
    }
  }, [tab]);

  const loadFile = async (filename: string) => {
    setSelectedFile(filename);
    setEditing(false);
    setFileLoading(true);
    try {
      const r = await devApi('get', `/project-files/${filename}`);
      setFileContent(r.data.data);
    } catch {
      setFileContent({ filename, content: 'Failed to load file.', lines: 1, size: 0 });
    }
    setFileLoading(false);
  };

  const startEdit = () => {
    if (!fileContent) return;
    setEditContent(fileContent.content);
    setEditing(true);
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await devApi('put', `/project-files/${selectedFile}`, { content: editContent });
      setFileContent({ ...fileContent, content: editContent, size: editContent.length, lines: editContent.split('\n').length });
      setEditing(false);
    } catch {}
    setSaving(false);
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  const isMgr = ['ceo', 'lead', 'product_owner'].includes(user.role);

  return (
    <DevPortalLayout user={user} title="Platform Settings">
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-gray-900">Project Platform Settings</h1>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap flex items-center gap-1.5 transition-colors ${tab === t.key ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">

          {tab === 'profile' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center text-white text-2xl font-bold shadow-sm">{(user.display_name || user.name).charAt(0)}</div>
                <div><h2 className="text-lg font-bold text-gray-900">{user.name}</h2><p className="text-sm text-gray-500">{user.title || user.role} · {user.email}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[['Email', user.email],['Role', user.role],['Title', user.title || '—'],['Department', (user as any).department || '—']].map(([l,v]) => (
                  <div key={l}><p className="text-2xs text-gray-400 font-medium mb-0.5">{l}</p><p className="text-sm text-gray-900">{v}</p></div>
                ))}
              </div>
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Portal Access</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">URL:</span> <span className="font-mono text-gray-700">/dev-portal/login</span></div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">Password:</span> <span className="font-mono text-gray-700">&lt;set by admin on invite&gt;</span></div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">Auth:</span> <span className="text-gray-700">Separate JWT (isDevPortal)</span></div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-400">Token:</span> <span className="font-mono text-gray-700">dev_portal_token</span></div>
                </div>
              </div>
            </div>
          )}

          {tab === 'docs' && (() => {
            const cats = ['all', ...new Set(docFiles.map((f: any) => f.category))];
            const filtered = docFiles.filter((f: any) => {
              if (docCategory !== 'all' && f.category !== docCategory) return false;
              if (docSearch && !(f.filename || '').toLowerCase().includes((docSearch || '').toLowerCase())) return false;
              return true;
            });
            return (
              <div className="flex gap-0 -m-6" style={{ height: 'calc(70vh)' }}>
                {/* File Sidebar */}
                <div className="w-64 shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-gray-900">Project Files</h3>
                      <span className="text-2xs text-gray-400">{docFiles.length} .md</span>
                    </div>
                    <input type="text" value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="Filter files..." className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-2xs" />
                    <div className="flex gap-1 flex-wrap">
                      {cats.map(c => (
                        <button key={c} onClick={() => setDocCategory(c)} className={`px-2 py-0.5 text-2xs rounded-md ${docCategory === c ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-gray-400 hover:text-gray-600'}`}>{c}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto py-1">
                    {filtered.map((f: any) => (
                      <button key={f.filename} onClick={() => loadFile(f.filename)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${selectedFile === f.filename ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <span className="text-xs shrink-0">{f.category === 'memory' ? '🧠' : f.category === 'docs' ? '📄' : '📋'}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-2xs font-mono truncate ${selectedFile === f.filename ? 'font-semibold' : ''}`}>{f.filename}</p>
                          <p className="text-2xs text-gray-400">{f.dir} · {f.sizeKB}KB</p>
                        </div>
                      </button>
                    ))}
                    {filtered.length === 0 && <p className="text-2xs text-gray-400 text-center py-6">No files found</p>}
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  {fileContent ? (
                    <>
                      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900">{fileContent.filename}</p>
                          <p className="text-2xs text-gray-400">{fileContent.dir} · {fileContent.lines} lines · {Math.round(fileContent.size / 1024)}KB</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {editing ? (
                            <>
                              <button onClick={() => setEditing(false)} className="px-3 py-1 text-2xs text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
                              <button onClick={saveFile} disabled={saving} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-2xs font-semibold rounded-lg">{saving ? 'Saving...' : 'Save'}</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => loadFile(fileContent.filename)} className="px-2 py-1 text-2xs text-gray-400 hover:text-gray-600">Reload</button>
                              {isMgr && <button onClick={startEdit} className="px-3 py-1 text-2xs text-indigo-600 border border-indigo-200 rounded-lg font-medium hover:bg-indigo-50">Edit</button>}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {fileLoading ? (
                          <div className="flex items-center justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
                        ) : editing ? (
                          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full h-full p-4 text-xs font-mono text-gray-800 bg-gray-50 resize-none focus:outline-none leading-relaxed" />
                        ) : (
                          <pre className="p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">{fileContent.content}</pre>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <span className="text-3xl block mb-3">📖</span>
                        <p className="text-sm font-medium text-gray-700">Project Documentation</p>
                        <p className="text-xs text-gray-400 mt-1">Select a file from the sidebar to view and edit</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {tab === 'updates' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-gray-900">Project Update Log</h2><span className="text-2xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">PROJECT_UPDATE.md</span></div>
              {UPDATES.map((u, i) => (
                <div key={i} className={`border rounded-xl p-4 ${i === 0 ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {i === 0 && <span className="text-2xs px-1.5 py-0.5 bg-indigo-500 text-white rounded font-bold">LATEST</span>}
                    <span className="text-xs font-bold text-gray-900">{u.title}</span>
                    <span className="text-2xs text-gray-400 ml-auto">{u.date}</span>
                  </div>
                  <ul className="space-y-0.5">{u.items.map((item, j) => <li key={j} className="text-xs text-gray-600 flex gap-2"><span className="text-emerald-500">✓</span>{item}</li>)}</ul>
                </div>
              ))}
            </div>
          )}

          {tab === 'versions' && (
            <div className="space-y-3">
              {VERSION_HISTORY.map(v => (
                <div key={v.version} className={`border rounded-xl overflow-hidden ${v.status === 'current' ? 'border-indigo-300' : 'border-gray-200'}`}>
                  <div className={`px-4 py-3 flex items-center justify-between ${v.status === 'current' ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold font-mono text-gray-900">{v.version}</span>
                      <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${v.status === 'current' ? 'bg-indigo-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{v.status}</span>
                    </div>
                    <div className="text-right"><p className="text-2xs text-gray-500">{v.date}</p><p className="text-2xs text-gray-400">Sessions: {v.sessions}</p></div>
                  </div>
                  <div className="px-4 py-3"><ul className="space-y-0.5">{v.changes.map((c, i) => <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-gray-300">•</span>{c}</li>)}</ul></div>
                </div>
              ))}
            </div>
          )}

          {tab === 'design' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">ACCA Design System</h2>
                {isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL) && (
                  <a href={FIGMA_DESIGN_SYSTEM_URL} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#0D99FF] hover:bg-[#0B85DE] text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 38 57" fill="currentColor"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/></svg>
                    Open in Figma
                  </a>
                )}
              </div>

              {/* Figma Embed */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#0D99FF]" viewBox="0 0 38 57" fill="currentColor"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/></svg>
                  <span className="text-xs font-semibold text-gray-700">ACCA Design System — Figma</span>
                  {isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL) && (
                    <a href={FIGMA_DESIGN_SYSTEM_URL} target="_blank" rel="noopener noreferrer" className="ml-auto text-2xs text-indigo-500 hover:text-indigo-700">Open full screen</a>
                  )}
                </div>
                {isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL) ? (
                  <iframe
                    src={buildFigmaEmbedSrc(FIGMA_DESIGN_SYSTEM_URL)}
                    title="ACCA Design System — Figma"
                    className="w-full h-[500px] border-0"
                    allowFullScreen
                  />
                ) : (
                  <div className="bg-gray-50 px-6 py-12 text-center">
                    <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" viewBox="0 0 38 57" fill="currentColor"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/></svg>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Figma file not configured</p>
                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                      Set <code className="px-1.5 py-0.5 bg-gray-200 rounded text-[11px] font-mono">NEXT_PUBLIC_FIGMA_DESIGN_SYSTEM_URL</code> to a valid Figma file URL
                      (e.g. <span className="font-mono">https://www.figma.com/design/&lt;KEY&gt;/&lt;slug&gt;</span>) to enable the embed.
                    </p>
                  </div>
                )}
              </div>

              {/* Design Tokens */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Color Palette</h3>
                  <div className="space-y-2">
                    {[
                      { name: 'Sand (Primary BG)', value: '#faf8f5', css: 'bg-sand-50', swatch: 'bg-[#faf8f5] border border-gray-200' },
                      { name: 'Terracotta (Accent)', value: '#c2410c', css: 'text-terracotta', swatch: 'bg-[#c2410c]' },
                      { name: 'Indigo (Dev Portal)', value: '#4f46e5', css: 'bg-indigo-600', swatch: 'bg-indigo-600' },
                      { name: 'Emerald (Success)', value: '#10b981', css: 'text-emerald-500', swatch: 'bg-emerald-500' },
                      { name: 'Red (Error)', value: '#ef4444', css: 'text-red-500', swatch: 'bg-red-500' },
                      { name: 'Gray 900 (Text)', value: '#111827', css: 'text-gray-900', swatch: 'bg-gray-900' },
                      { name: 'Gray 50 (Background)', value: '#f9fafb', css: 'bg-gray-50', swatch: 'bg-gray-50 border border-gray-200' },
                    ].map(c => (
                      <div key={c.name} className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-lg ${c.swatch} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-2xs font-medium text-gray-700">{c.name}</span>
                        </div>
                        <span className="text-2xs font-mono text-gray-400">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Typography</h3>
                  <div className="space-y-3">
                    <div><p className="text-xl font-bold text-gray-900">Heading 1</p><p className="text-2xs text-gray-400 font-mono">text-xl font-bold</p></div>
                    <div><p className="text-base font-bold text-gray-900">Heading 2</p><p className="text-2xs text-gray-400 font-mono">text-base font-bold</p></div>
                    <div><p className="text-sm font-semibold text-gray-900">Heading 3</p><p className="text-2xs text-gray-400 font-mono">text-sm font-semibold</p></div>
                    <div><p className="text-sm text-gray-700">Body text</p><p className="text-2xs text-gray-400 font-mono">text-sm text-gray-700</p></div>
                    <div><p className="text-xs text-gray-500">Small text</p><p className="text-2xs text-gray-400 font-mono">text-xs text-gray-500</p></div>
                    <div><p className="text-2xs text-gray-400">Caption</p><p className="text-2xs text-gray-400 font-mono">text-2xs text-gray-400</p></div>
                  </div>
                </div>
              </div>

              {/* Component Patterns */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Component Patterns</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: 'Card', code: 'bg-white border border-gray-200 rounded-xl p-4', desc: 'Content container' },
                    { name: 'Button Primary', code: 'bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg px-4 py-2', desc: 'Primary action' },
                    { name: 'Button Secondary', code: 'border border-gray-200 text-gray-600 text-xs rounded-lg px-4 py-2', desc: 'Secondary action' },
                    { name: 'Input', code: 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20', desc: 'Form input' },
                    { name: 'Badge', code: 'text-2xs px-2 py-0.5 rounded-full font-medium', desc: 'Status indicator' },
                    { name: 'KPI Card', code: 'rounded-xl border p-3 bg-{color}-50 border-{color}-100', desc: 'Metric display' },
                  ].map(c => (
                    <div key={c.name} className="bg-gray-50 rounded-lg px-3 py-2.5">
                      <p className="text-xs font-semibold text-gray-800">{c.name}</p>
                      <p className="text-2xs text-gray-500 mt-0.5">{c.desc}</p>
                      <p className="text-2xs font-mono text-indigo-600 mt-1 break-all">{c.code}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Design Principles */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-3">Design Principles</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { title: 'Claude.ai-Inspired Minimalism', desc: 'Clean, warm, professional. Sand background with terracotta accents for main platform, indigo for dev portal.' },
                    { title: 'German Business Context', desc: 'Formal tone, de-DE locale defaults, EUR currency, German date format (dd.MM.yyyy).' },
                    { title: 'Density over Whitespace', desc: 'Data-rich screens. Small text (text-xs, text-2xs), compact spacing. More info per viewport.' },
                    { title: 'Rounded-xl Everything', desc: 'Cards, buttons, badges, inputs all use rounded-xl (12px). Consistent border-gray-200.' },
                  ].map(p => (
                    <div key={p.title} className="px-3 py-2.5 bg-gray-50 rounded-lg">
                      <p className="text-xs font-semibold text-gray-800">{p.title}</p>
                      <p className="text-2xs text-gray-500 mt-0.5">{p.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Links */}
              <div className="flex gap-3">
                <a
                  href={isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL) ? FIGMA_DESIGN_SYSTEM_URL : undefined}
                  target={isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL) ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  aria-disabled={!isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL)}
                  onClick={e => { if (!isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL)) e.preventDefault(); }}
                  className={`flex-1 flex items-center gap-3 px-4 py-3 border rounded-xl transition-colors ${isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL) ? 'border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/30' : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
                >
                  <span className="text-lg">🎨</span>
                  <div><p className="text-xs font-semibold text-gray-800">Figma Design System</p><p className="text-2xs text-gray-500">{isValidFigmaUrl(FIGMA_DESIGN_SYSTEM_URL) ? 'Components, tokens, pages' : 'Not configured'}</p></div>
                </a>
                <a href="https://tailwindcss.com/docs" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:border-cyan-200 hover:bg-cyan-50/30 transition-colors">
                  <span className="text-lg">🌊</span>
                  <div><p className="text-xs font-semibold text-gray-800">Tailwind CSS Docs</p><p className="text-2xs text-gray-500">Utility-first CSS framework</p></div>
                </a>
              </div>
            </div>
          )}

          {tab === 'pipeline' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Dev → Production Pipeline</h2>
              <div className="space-y-2">
                {PIPELINE.map((s, i) => (
                  <div key={s.stage} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${s.status === 'active' ? 'bg-blue-500' : s.status === 'pass' ? 'bg-emerald-500' : 'bg-gray-400'}`}>{s.n}</div>
                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                      <div><p className="text-xs font-semibold text-gray-900">{s.stage}</p><p className="text-2xs text-gray-500">{s.desc}</p></div>
                      <div className="text-right">
                        <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${s.status === 'active' ? 'bg-blue-100 text-blue-700' : s.status === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                        <p className="text-2xs text-gray-400 mt-0.5">{s.env}</p>
                      </div>
                    </div>
                    {i < PIPELINE.length - 1 && <span className="text-gray-300 text-xs shrink-0">→</span>}
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-2">CI/CD Workflows</p>
                <div className="grid grid-cols-3 gap-2">
                  {[['ci.yml','Lint → Typecheck → Test','push/PR to main'],['build-desktop.yml','Win + Mac + Linux','desktop-v* tag'],['deploy-cloud.yml','Docker → GHCR → K8s','push to main']].map(([name,desc,trigger]) => (
                    <div key={name} className="bg-white rounded-lg px-3 py-2 border border-amber-200">
                      <p className="text-2xs font-bold text-gray-700">{name}</p>
                      <p className="text-2xs text-gray-500">{desc}</p>
                      <p className="text-2xs text-gray-400">{trigger}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'github' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Git & GitHub</h2>
              <div className="bg-gray-900 rounded-xl p-4">
                <pre className="text-2xs text-gray-300 font-mono whitespace-pre-wrap">{`# Setup
cd D:/ACCA && git init
git add . && git commit -m "ACCA v3.0.0"
git remote add origin https://github.com/codes-ai/vibestudio.git
git push -u origin main

# Branch strategy
main         production-ready
develop      integration
feat/ACCA-*  features (from task key)
fix/ACCA-*   bugfixes
release/*    release candidates`}</pre>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Commit Convention</h3>
                  <div className="space-y-1 text-2xs font-mono text-gray-600">
                    <p><span className="text-emerald-600">feat:</span> Add budget mgmt (ACCA-42)</p>
                    <p><span className="text-red-600">fix:</span> VAT Skonto calc (ACCA-15)</p>
                    <p><span className="text-blue-600">refactor:</span> Extract api-client</p>
                    <p><span className="text-purple-600">docs:</span> Update developer guide</p>
                    <p><span className="text-amber-600">chore:</span> Migration 049</p>
                    <p><span className="text-cyan-600">test:</span> E2E invoice flow</p>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">PR Checklist</h3>
                  <div className="space-y-1 text-2xs text-gray-600">
                    {['Link task: VIBE-[number]','Description of changes','Screenshots (if UI)','Auth/RLS verified','Migration included?','Skills updated?','Tests passing?'].map(c => <p key={c} className="flex gap-2"><span className="text-gray-400">☐</span>{c}</p>)}
                  </div>
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Task → Branch Naming</h3>
                <div className="space-y-1 text-2xs font-mono text-gray-600">
                  <p>ACCA-42 → <span className="text-indigo-600">feat/acca-42-budget-management</span></p>
                  <p>ACCA-15 → <span className="text-indigo-600">fix/acca-15-vat-skonto</span></p>
                  <p>ACCA-30 → <span className="text-indigo-600">chore/acca-30-security-audit</span></p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </DevPortalLayout>
  );
}
