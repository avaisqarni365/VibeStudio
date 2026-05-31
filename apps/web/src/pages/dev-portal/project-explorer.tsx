import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

type FileEntry = { name: string; path: string; type: 'file' | 'directory'; size?: number; ext?: string; children?: number; modified?: string };
type OpenFile = { path: string; content: string; lines: number; size: number; ext: string; language: string; binary?: boolean; modified?: string; projectRoot?: string };
type CodeNote = { id: string; member_id: string; file_path: string; line_start: number | null; line_end: number | null; content: string; note_type: string; is_shared: boolean; tags: string[]; created_at: string; author?: { name: string; display_name?: string; role: string } };
type LinkedProject = { id: string; name: string; path: string; isCurrent?: boolean };

// ── Comprehensive file icons (50+ extensions) ──
const FILE_ICON: Record<string, { icon: string; color: string }> = {
  ts:   { icon: 'TS', color: 'bg-blue-500' }, tsx:  { icon: 'TX', color: 'bg-blue-400' },
  js:   { icon: 'JS', color: 'bg-yellow-400' }, jsx:  { icon: 'JX', color: 'bg-yellow-300' },
  mjs:  { icon: 'MJ', color: 'bg-yellow-500' }, cjs:  { icon: 'CJ', color: 'bg-yellow-600' },
  json: { icon: '{}', color: 'bg-amber-500' }, json5: { icon: '{5', color: 'bg-amber-400' },
  md:   { icon: 'MD', color: 'bg-gray-500' }, mdx:  { icon: 'MX', color: 'bg-gray-600' },
  css:  { icon: '#', color: 'bg-sky-500' }, scss: { icon: 'SC', color: 'bg-pink-400' },
  less: { icon: 'LE', color: 'bg-indigo-400' }, sass: { icon: 'SA', color: 'bg-pink-500' },
  html: { icon: '<>', color: 'bg-orange-500' }, htm:  { icon: '<>', color: 'bg-orange-400' },
  xml:  { icon: 'XL', color: 'bg-orange-300' }, svg:  { icon: 'SV', color: 'bg-amber-400' },
  sql:  { icon: 'SQ', color: 'bg-violet-500' }, prisma: { icon: 'PR', color: 'bg-indigo-500' },
  graphql: { icon: 'GQ', color: 'bg-pink-600' }, gql: { icon: 'GQ', color: 'bg-pink-600' },
  sh:   { icon: '$_', color: 'bg-green-600' }, bash: { icon: '$_', color: 'bg-green-600' },
  ps1:  { icon: 'PS', color: 'bg-blue-700' }, bat:  { icon: 'BA', color: 'bg-gray-600' },
  yml:  { icon: 'YM', color: 'bg-red-400' }, yaml: { icon: 'YM', color: 'bg-red-400' },
  toml: { icon: 'TM', color: 'bg-gray-500' }, ini:  { icon: 'IN', color: 'bg-gray-400' },
  py:   { icon: 'PY', color: 'bg-blue-400' }, rb:   { icon: 'RB', color: 'bg-red-500' },
  go:   { icon: 'GO', color: 'bg-cyan-500' }, rs:   { icon: 'RS', color: 'bg-orange-600' },
  java: { icon: 'JV', color: 'bg-red-400' }, kt:   { icon: 'KT', color: 'bg-purple-500' },
  swift:{ icon: 'SW', color: 'bg-orange-400' }, dart: { icon: 'DA', color: 'bg-teal-500' },
  c:    { icon: 'C', color: 'bg-blue-600' }, cpp:  { icon: 'C+', color: 'bg-blue-700' },
  h:    { icon: 'H', color: 'bg-purple-400' }, cs:   { icon: 'C#', color: 'bg-green-500' },
  php:  { icon: 'PH', color: 'bg-indigo-600' }, lua:  { icon: 'LU', color: 'bg-blue-800' },
  vue:  { icon: 'VU', color: 'bg-emerald-500' }, svelte: { icon: 'SV', color: 'bg-orange-500' },
  astro:{ icon: 'AS', color: 'bg-purple-600' },
  dockerfile: { icon: 'DK', color: 'bg-blue-500' }, docker: { icon: 'DK', color: 'bg-blue-500' },
  tf:   { icon: 'TF', color: 'bg-violet-600' }, proto: { icon: 'PB', color: 'bg-green-600' },
  lock: { icon: '🔒', color: 'bg-gray-400' }, txt:  { icon: 'TX', color: 'bg-gray-400' },
  log:  { icon: 'LG', color: 'bg-gray-500' }, csv:  { icon: 'CS', color: 'bg-green-400' },
  env:  { icon: 'EN', color: 'bg-yellow-600' },
  png:  { icon: '🖼', color: 'bg-emerald-400' }, jpg:  { icon: '🖼', color: 'bg-emerald-400' },
  gif:  { icon: '🖼', color: 'bg-emerald-400' }, webp: { icon: '🖼', color: 'bg-emerald-400' },
  pdf:  { icon: 'PD', color: 'bg-red-600' }, zip:  { icon: 'ZP', color: 'bg-amber-600' },
  gitignore: { icon: 'GI', color: 'bg-gray-600' }, editorconfig: { icon: 'EC', color: 'bg-gray-500' },
  prettierrc: { icon: 'PR', color: 'bg-gray-500' }, eslintrc: { icon: 'ES', color: 'bg-purple-500' },
};

const DIR_ICONS: Record<string, { icon: string; color: string }> = {
  apps: { icon: '📱', color: 'bg-blue-100' }, api: { icon: '⚡', color: 'bg-emerald-100' },
  src: { icon: '📦', color: 'bg-indigo-100' }, components: { icon: '🧩', color: 'bg-purple-100' },
  pages: { icon: '📄', color: 'bg-amber-100' }, hooks: { icon: '🪝', color: 'bg-cyan-100' },
  domains: { icon: '🏛', color: 'bg-violet-100' }, infrastructure: { icon: '🏗', color: 'bg-orange-100' },
  packages: { icon: '📦', color: 'bg-teal-100' }, docs: { icon: '📚', color: 'bg-sky-100' },
  tests: { icon: '🧪', color: 'bg-pink-100' }, scripts: { icon: '⚙', color: 'bg-gray-100' },
  migrations: { icon: '🔄', color: 'bg-purple-100' }, seeds: { icon: '🌱', color: 'bg-green-100' },
  routes: { icon: '🔀', color: 'bg-blue-100' }, layouts: { icon: '📐', color: 'bg-indigo-100' },
  styles: { icon: '🎨', color: 'bg-pink-100' }, lib: { icon: '📚', color: 'bg-gray-100' },
  utils: { icon: '🔧', color: 'bg-gray-100' }, config: { icon: '⚙', color: 'bg-gray-100' },
  public: { icon: '🌐', color: 'bg-blue-100' }, deploy: { icon: '🚀', color: 'bg-red-100' },
  desktop: { icon: '🖥', color: 'bg-violet-100' },
};

const NOTE_TYPES = [
  { key: 'annotation', label: 'Note', icon: '📝', color: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  { key: 'explanation', label: 'Explanation', icon: '💡', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  { key: 'question', label: 'Question', icon: '❓', color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  { key: 'todo', label: 'TODO', icon: '✅', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { key: 'warning', label: 'Warning', icon: '⚠', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  { key: 'tip', label: 'Tip', icon: '🎯', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500' },
];

export default function ProjectExplorer() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [tab, setTab] = useState((router.query.tab as string) || 'explorer');
  const [projectId, setProjectId] = useState('');

  // Multi-project
  const [projects, setProjects] = useState<LinkedProject[]>([]);
  const [activeProject, setActiveProject] = useState<LinkedProject | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [addMode, setAddMode] = useState<'browse' | 'git'>('browse');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitName, setGitName] = useState('');
  const [cloning, setCloning] = useState(false);
  // Folder browser
  const [folderEntries, setFolderEntries] = useState<any[]>([]);
  const [folderPath, setFolderPath] = useState('');
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderIsRoot, setFolderIsRoot] = useState(true);

  // Explorer
  const [insideProject, setInsideProject] = useState(false); // false = show project gallery
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pathHistory, setPathHistory] = useState<string[]>(['']);
  const [fileSearch, setFileSearch] = useState('');
  const [browsing, setBrowsing] = useState(false);
  // Tree state: expanded dirs in sidebar tree
  const [treeExpanded, setTreeExpanded] = useState<Record<string, FileEntry[]>>({});
  const [treeLoading, setTreeLoading] = useState<string | null>(null);

  // Viewer
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  // Notes
  const [notes, setNotes] = useState<CodeNote[]>([]);
  const [allNotes, setAllNotes] = useState<CodeNote[]>([]);
  const [noteStats, setNoteStats] = useState<any>(null);
  const [noteFilter, setNoteFilter] = useState('');
  const [noteTypeFilter, setNoteTypeFilter] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState({ file_path: '', line_start: '', line_end: '', content: '', note_type: 'annotation', is_shared: true });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [showNotePanel, setShowNotePanel] = useState(true);

  // ── Init ──
  useEffect(() => {
    if (!user) return;
    if (activeProjectId) {
      setProjectId(activeProjectId);
    } else {
      devApi('get', '/projects').then(r => { if (r.data.data?.[0]) setProjectId(r.data.data[0].id); }).catch(() => {});
    }
    loadProjects();
  }, [user, activeProjectId]);

  useEffect(() => {
    if (router.query.tab && typeof router.query.tab === 'string') setTab(router.query.tab);
    if (router.query.file && typeof router.query.file === 'string') { openFile(router.query.file); setTab('viewer'); }
  }, [router.query]);

  // ── Projects ──
  const loadProjects = async () => {
    try {
      const r = await devApi('get', '/code-files/projects');
      setProjects(r.data.data || []);
    } catch {}
  };

  const enterProject = (p: LinkedProject) => {
    setActiveProject(p);
    setInsideProject(true);
    setCurrentPath('');
    setPathHistory(['']);
    setTreeExpanded({});
    browseDir('', p.path);
  };

  const exitToGallery = () => {
    setInsideProject(false);
    setActiveProject(null);
    setEntries([]);
    setCurrentPath('');
    setTreeExpanded({});
  };

  const switchProject = (p: LinkedProject) => {
    enterProject(p);
  };

  // Folder browser for picker
  const browseFolders = async (dir?: string) => {
    setFolderLoading(true);
    try {
      const params = dir ? `?path=${encodeURIComponent(dir)}` : '';
      const r = await devApi('get', `/code-files/browse-folders${params}`);
      setFolderEntries(r.data.data?.entries || []);
      setFolderPath(r.data.data?.path || '');
      setFolderIsRoot(r.data.data?.isRoot || false);
    } catch { setFolderEntries([]); }
    setFolderLoading(false);
  };

  const selectFolder = (path: string, name: string) => {
    setNewProjectPath(path);
    if (!newProjectName) setNewProjectName(name);
  };

  const openAddProjectModal = () => {
    setShowAddProject(true);
    setAddMode('browse');
    setNewProjectName('');
    setNewProjectPath('');
    setGitUrl('');
    setGitName('');
    browseFolders(); // Load root locations
  };

  const addProjectLocal = async () => {
    if (!newProjectName || !newProjectPath || !projectId) return;
    try {
      await devApi('post', '/code-files/projects', { project_id: projectId, name: newProjectName, path: newProjectPath });
      setShowAddProject(false);
      loadProjects();
    } catch (e: any) { alert(e?.response?.data?.error?.message || 'Failed to link'); }
  };

  const cloneRepo = async () => {
    if (!gitUrl || !projectId) return;
    setCloning(true);
    try {
      const r = await devApi('post', '/code-files/clone', { project_id: projectId, url: gitUrl, name: gitName || undefined });
      setShowAddProject(false);
      loadProjects();
    } catch (e: any) { alert(e?.response?.data?.error?.message || 'Clone failed'); }
    setCloning(false);
  };

  const removeProject = async (p: LinkedProject) => {
    if (!projectId || p.isCurrent) return;
    if (!confirm(`Remove "${p.name}" from linked projects?`)) return;
    try { await devApi('delete', '/code-files/projects', { data: { project_id: projectId, path: p.path } }); loadProjects(); } catch {}
  };

  // ── Browse ──
  const browseDir = async (dirPath: string, root?: string) => {
    setBrowsing(true);
    try {
      const params = new URLSearchParams({ path: dirPath });
      if (root || activeProject?.path) params.set('root', root || activeProject?.path || '');
      const r = await devApi('get', `/code-files?${params}`);
      setEntries(r.data.data?.entries || []);
      setCurrentPath(r.data.data?.path || '');
    } catch { setEntries([]); }
    setBrowsing(false);
  };

  const nav = (path: string) => { setPathHistory(prev => [...prev, path]); browseDir(path); };
  const goBack = () => { if (pathHistory.length > 1) { browseDir(pathHistory[pathHistory.length - 2]); setPathHistory(h => h.slice(0, -1)); } };
  const goUp = () => { if (!currentPath) { exitToGallery(); return; } const parts = currentPath.split('/'); parts.pop(); nav(parts.join('/')); };

  // Tree expand/collapse
  const toggleTreeDir = async (dirPath: string) => {
    if (treeExpanded[dirPath]) {
      const next = { ...treeExpanded };
      delete next[dirPath];
      setTreeExpanded(next);
      return;
    }
    setTreeLoading(dirPath);
    try {
      const params = new URLSearchParams({ path: dirPath });
      if (activeProject?.path) params.set('root', activeProject.path);
      const r = await devApi('get', `/code-files?${params}`);
      setTreeExpanded(prev => ({ ...prev, [dirPath]: r.data.data?.entries || [] }));
    } catch {}
    setTreeLoading(null);
  };

  // ── File ──
  const openFile = async (path: string) => {
    if (openFiles.find(f => f.path === path)) { setActiveFile(path); setTab('viewer'); return; }
    setFileLoading(true);
    try {
      const params = new URLSearchParams({ path });
      if (activeProject?.path) params.set('root', activeProject.path);
      const r = await devApi('get', `/code-files/content?${params}`);
      setOpenFiles(prev => [...prev, { ...r.data.data, projectRoot: activeProject?.path }]);
      setActiveFile(path);
      setTab('viewer');
      if (projectId) loadFileNotes(path);
    } catch {}
    setFileLoading(false);
  };

  const closeFile = (path: string) => {
    setOpenFiles(prev => prev.filter(f => f.path !== path));
    if (activeFile === path) { const rem = openFiles.filter(f => f.path !== path); setActiveFile(rem[rem.length - 1]?.path || ''); }
  };

  // ── Notes (resilient) ──
  const loadFileNotes = async (fp: string) => {
    if (!projectId) return;
    try { setNotes((await devApi('get', `/projects/${projectId}/code-notes?file_path=${encodeURIComponent(fp)}`)).data.data || []); } catch { setNotes([]); }
  };
  const loadAllNotes = async () => {
    if (!projectId) return;
    try {
      const p = new URLSearchParams();
      if (noteFilter) p.set('search', noteFilter);
      if (noteTypeFilter) p.set('note_type', noteTypeFilter);
      setAllNotes((await devApi('get', `/projects/${projectId}/code-notes?${p}`)).data.data || []);
    } catch { setAllNotes([]); }
  };
  const loadStats = async () => {
    if (!projectId) return;
    try { setNoteStats((await devApi('get', `/projects/${projectId}/code-notes/stats`)).data.data); } catch { setNoteStats(null); }
  };

  useEffect(() => { if (!projectId) return; if (tab === 'notes') loadAllNotes(); if (tab === 'learning') { loadAllNotes(); loadStats(); } }, [tab, projectId, noteFilter, noteTypeFilter]);
  useEffect(() => { if (activeFile && projectId) loadFileNotes(activeFile); }, [activeFile, projectId]);

  const saveNote = async () => {
    if (!projectId || !newNote.content.trim()) return;
    try {
      await devApi('post', `/projects/${projectId}/code-notes`, { file_path: newNote.file_path || activeFile, line_start: newNote.line_start ? parseInt(newNote.line_start) : null, line_end: newNote.line_end ? parseInt(newNote.line_end) : null, content: newNote.content, note_type: newNote.note_type, is_shared: newNote.is_shared });
      setShowAddNote(false); setNewNote({ file_path: '', line_start: '', line_end: '', content: '', note_type: 'annotation', is_shared: true });
      if (activeFile) loadFileNotes(activeFile); if (tab === 'notes' || tab === 'learning') loadAllNotes();
    } catch {}
  };
  const updateNote = async (id: string) => { try { await devApi('put', `/code-notes/${id}`, { content: editNoteContent }); setEditingNote(null); if (activeFile) loadFileNotes(activeFile); loadAllNotes(); } catch {} };
  const deleteNote = async (id: string) => { try { await devApi('delete', `/code-notes/${id}`); if (activeFile) loadFileNotes(activeFile); loadAllNotes(); } catch {} };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  const af = openFiles.find(f => f.path === activeFile);
  const fileNotes = notes.filter(n => n.file_path === activeFile);
  const notesByLine: Record<number, CodeNote[]> = {};
  fileNotes.forEach(n => { if (n.line_start) { if (!notesByLine[n.line_start]) notesByLine[n.line_start] = []; notesByLine[n.line_start].push(n); } });
  const filtered = fileSearch ? entries.filter(e => (e.name || '').toLowerCase().includes((fileSearch || '').toLowerCase())) : entries;
  const isMgr = ['ceo', 'lead'].includes(user.role);

  const getFileIcon = (ext?: string) => FILE_ICON[ext || ''] || { icon: '📄', color: 'bg-gray-400' };
  const getDirIcon = (name: string) => DIR_ICONS[(name || '').toLowerCase()] || { icon: '📁', color: 'bg-gray-100' };

  return (
    <DevPortalLayout user={user} title="Project">
      {/* ── FULL-HEIGHT IDE LAYOUT ── */}
      <div style={{ height: 'calc(100vh - 120px)' }} className="flex flex-col gap-2">

        {/* Top bar */}
        <div className="flex items-center gap-3 shrink-0">
          {/* View tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
            {[
              { key: 'explorer', label: 'Explorer', icon: '📂' },
              { key: 'viewer', label: 'Code', icon: '👁' },
              { key: 'notes', label: 'Notes', icon: '📝', badge: allNotes.length || undefined },
              { key: 'learning', label: 'Learning', icon: '🎓' },
            ].map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); router.replace({ query: { ...router.query, tab: t.key } }, undefined, { shallow: true }); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.icon} {t.label}
                {t.badge ? <span className="bg-indigo-100 text-indigo-600 text-2xs px-1.5 rounded-full font-bold">{t.badge}</span> : null}
              </button>
            ))}
          </div>

          {/* Notes panel toggle */}
          <button onClick={() => setShowNotePanel(!showNotePanel)} className={`p-2 rounded-xl border transition-all ${showNotePanel ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'}`} title="Toggle notes panel">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
          </button>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">

          {/* ═══ EXPLORER ═══ */}
          {tab === 'explorer' && !insideProject && (
            /* ── PROJECT GALLERY (first level) ── */
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Projects</h2>
                  <p className="text-2xs text-gray-400">{projects.length} project{projects.length !== 1 ? 's' : ''} linked</p>
                </div>
                {isMgr && (
                  <button onClick={openAddProjectModal} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Link Project
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.map(p => (
                  <div key={p.id} onClick={() => enterProject(p)}
                    className="group bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all relative overflow-hidden">
                    {/* Decorative corner */}
                    <div className={`absolute top-0 right-0 w-20 h-20 rounded-bl-[40px] ${p.isCurrent ? 'bg-gradient-to-br from-indigo-500/10 to-violet-500/10' : 'bg-gradient-to-br from-gray-100 to-gray-50'}`} />
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-3 ${p.isCurrent ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isCurrent ? '🏠' : '📂'}
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">{p.name}</h3>
                    <p className="text-2xs text-gray-400 font-mono mt-1 truncate">{p.path.replace(/\\/g, '/')}</p>
                    <div className="flex items-center gap-2 mt-3">
                      {p.isCurrent && <span className="text-2xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">Current</span>}
                      <span className="text-2xs text-gray-400 ml-auto group-hover:text-indigo-500 transition-colors flex items-center gap-1">
                        Open
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                      </span>
                    </div>
                    {/* Remove button for non-current projects */}
                    {!p.isCurrent && isMgr && (
                      <button onClick={ev => { ev.stopPropagation(); removeProject(p); }}
                        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 hidden group-hover:flex items-center justify-center transition-all" title="Remove">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}

                {/* Add project card */}
                {isMgr && (
                  <div onClick={openAddProjectModal}
                    className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 p-5 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center text-gray-400 hover:text-indigo-500 min-h-[160px]">
                    <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    <p className="text-xs font-medium">Link Project</p>
                    <p className="text-2xs mt-0.5">Local folder or Git repo</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'explorer' && insideProject && (
            /* ── FILE BROWSER (inside a project) — Windows Explorer style with tree sidebar ── */
            <>
              <div className="flex-1 flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                {/* LEFT: Tree sidebar */}
                <div className="w-56 border-r border-gray-100 flex flex-col shrink-0 bg-gray-50/50">
                  {/* Project header */}
                  <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
                    <button onClick={exitToGallery} className="text-gray-400 hover:text-indigo-600 transition-colors" title="Back to projects">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                    </button>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs ${activeProject?.isCurrent ? 'bg-indigo-500 text-white' : 'bg-gray-200'}`}>
                      {activeProject?.isCurrent ? '🏠' : '📂'}
                    </div>
                    <span className="text-xs font-bold text-gray-800 truncate">{activeProject?.name}</span>
                  </div>
                  {/* Tree */}
                  <div className="flex-1 overflow-y-auto py-1">
                    {entries.filter(e => e.type === 'directory').map(dir => (
                      <TreeNode key={dir.path} entry={dir} depth={0} expanded={treeExpanded} loading={treeLoading}
                        onToggle={toggleTreeDir} onNavigate={nav} onOpenFile={openFile}
                        getFileIcon={getFileIcon} getDirIcon={getDirIcon} currentPath={currentPath} />
                    ))}
                  </div>
                </div>

                {/* RIGHT: File list (main panel) */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Toolbar */}
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 shrink-0">
                    <TBtn onClick={goBack} disabled={pathHistory.length <= 1}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg></TBtn>
                    <TBtn onClick={goUp}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg></TBtn>
                    <TBtn onClick={() => browseDir(currentPath)}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg></TBtn>
                    <div className="h-4 w-px bg-gray-200" />
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-0.5 text-2xs flex-1 min-w-0 overflow-x-auto">
                      <button onClick={() => nav('')} className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 font-semibold shrink-0">{activeProject?.name}</button>
                      {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                        <span key={i} className="flex items-center gap-0.5 shrink-0">
                          <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                          <button onClick={() => nav(arr.slice(0, i + 1).join('/'))} className="px-1 py-0.5 rounded text-gray-600 hover:bg-gray-100">{part}</button>
                        </span>
                      ))}
                    </div>
                    <div className="relative shrink-0">
                      <svg className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                      <input type="text" value={fileSearch} onChange={e => setFileSearch(e.target.value)} placeholder="Filter..." className="w-36 pl-7 pr-2 py-1 border border-gray-200 rounded-lg text-2xs focus:ring-2 focus:ring-indigo-500/20" />
                    </div>
                    <span className="text-2xs text-gray-400 tabular-nums shrink-0">{entries.length}</span>
                  </div>

                  {/* File list — Windows Explorer style */}
                  <div className="flex-1 overflow-y-auto">
                    {browsing && entries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <div className="w-6 h-6 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin mb-2" />
                        <p className="text-xs">Loading...</p>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <span className="text-3xl mb-2">📂</span>
                        <p className="text-xs">{fileSearch ? 'No matches' : 'Empty'}</p>
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 text-2xs text-gray-400 font-semibold uppercase">
                          <tr><th className="text-left px-3 py-1.5">Name</th><th className="text-right px-3 py-1.5 w-20">Size</th><th className="text-right px-3 py-1.5 w-14">Type</th></tr>
                        </thead>
                        <tbody>
                          {filtered.map(e => {
                            const isDir = e.type === 'directory';
                            const fi = isDir ? getDirIcon(e.name) : getFileIcon(e.ext);
                            const isActive = isDir && currentPath === e.path;
                            return (
                              <tr key={e.path} onClick={() => isDir ? nav(e.path) : openFile(e.path)}
                                className={`cursor-pointer border-b border-gray-50 transition-colors group ${isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-1.5">
                                  <div className="flex items-center gap-2">
                                    {isDir ? (
                                      <div className={`w-5 h-5 rounded ${fi.color} flex items-center justify-center text-xs shrink-0`}>{fi.icon}</div>
                                    ) : (
                                      <div className={`w-5 h-5 rounded ${fi.color} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{fi.icon}</div>
                                    )}
                                    <span className={`text-xs truncate ${isDir ? 'font-semibold text-gray-900' : 'text-gray-700 group-hover:text-indigo-700'}`}>{e.name}</span>
                                    {isDir && e.children !== undefined && <span className="text-2xs bg-gray-100 text-gray-400 px-1 py-px rounded-full">{e.children}</span>}
                                  </div>
                                </td>
                                <td className="text-right px-3 py-1.5 text-2xs text-gray-400 tabular-nums">{!isDir && e.size ? fmtSize(e.size) : ''}</td>
                                <td className="text-right px-3 py-1.5">{e.ext && <span className="text-2xs font-mono text-gray-300">.{e.ext}</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes side panel */}
              {showNotePanel && <NotesPanel notes={allNotes} noteStats={noteStats} onOpen={openFile} onLoadAll={loadAllNotes} />}
            </>
          )}

          {/* ═══ CODE VIEWER ═══ */}
          {tab === 'viewer' && (
            <>
              <div className="flex-1 bg-[#1e1e2e] rounded-2xl overflow-hidden flex flex-col min-w-0 shadow-lg">
                {/* File tabs */}
                <div className="flex items-center bg-[#181825] overflow-x-auto shrink-0">
                  {openFiles.map(f => {
                    const active = f.path === activeFile;
                    const fi = getFileIcon(f.ext);
                    return (
                      <div key={f.path} onClick={() => setActiveFile(f.path)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-2xs cursor-pointer border-r border-[#313244] shrink-0 transition-all ${active ? 'bg-[#1e1e2e] text-[#cdd6f4] border-t-2 border-t-indigo-500' : 'text-[#6c7086] hover:text-[#bac2de] hover:bg-[#1e1e2e]/50 border-t-2 border-t-transparent'}`}>
                        <span className={`w-3.5 h-3.5 rounded-sm ${fi.color} text-white text-[8px] font-bold flex items-center justify-center`}>{fi.icon.substring(0, 2)}</span>
                        <span className="font-medium">{f.path.split('/').pop()}</span>
                        <button onClick={ev => { ev.stopPropagation(); closeFile(f.path); }} className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    );
                  })}
                  {openFiles.length === 0 && <span className="text-2xs text-[#6c7086] px-4 py-2">Open a file from Explorer</span>}
                </div>

                {/* Status bar */}
                {af && (
                  <div className="flex items-center justify-between px-4 py-1 bg-[#181825]/80 text-2xs text-[#6c7086]">
                    <span className="font-mono truncate">{af.path}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[#89b4fa]">{af.language}</span>
                      <span>{af.lines} ln</span>
                      <span>{fmtSize(af.size)}</span>
                      <button onClick={() => setShowLineNumbers(!showLineNumbers)} className={`px-1 py-0.5 rounded ${showLineNumbers ? 'bg-[#313244] text-[#cdd6f4]' : 'text-[#6c7086]'}`}>#</button>
                      <button onClick={() => setWordWrap(!wordWrap)} className={`px-1 py-0.5 rounded ${wordWrap ? 'bg-[#313244] text-[#cdd6f4]' : 'text-[#6c7086]'}`}>wrap</button>
                      <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="bg-transparent text-[#6c7086]">
                        {[10, 11, 12, 13, 14, 16].map(s => <option key={s} value={s}>{s}px</option>)}
                      </select>
                      <button onClick={() => { setNewNote({ file_path: activeFile, line_start: selectedLine?.toString() || '', line_end: '', content: '', note_type: 'annotation', is_shared: true }); setShowAddNote(true); }}
                        className="px-2 py-0.5 rounded bg-indigo-500/80 text-white hover:bg-indigo-500 font-medium">+ Note</button>
                    </div>
                  </div>
                )}

                {/* Code */}
                {af ? (
                  <div className="flex-1 overflow-auto font-mono" style={{ fontSize: `${fontSize}px`, lineHeight: '1.7' }}>
                    <table className="w-full border-collapse">
                      <tbody>
                        {af.content.split('\n').map((line, i) => {
                          const ln = i + 1;
                          const hasNote = notesByLine[ln];
                          const isSel = selectedLine === ln;
                          return (
                            <tr key={i} className={`hover:bg-white/[0.03] ${hasNote ? 'bg-[#f9e2af]/10' : ''} ${isSel ? 'bg-[#89b4fa]/10' : ''}`} onClick={() => setSelectedLine(ln)}>
                              {showLineNumbers && <td className="text-right pr-4 pl-4 text-[#45475a] select-none w-12 border-r border-[#313244] align-top">{ln}</td>}
                              <td className="pl-4 pr-4 text-[#cdd6f4]" style={{ whiteSpace: wordWrap ? 'pre-wrap' : 'pre', wordBreak: wordWrap ? 'break-all' : undefined }}>{line || ' '}</td>
                              {hasNote && <td className="w-6 text-center align-top text-[#f9e2af] cursor-pointer text-xs">💬</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[#6c7086]">
                    <div className="text-center"><span className="text-5xl block mb-4 opacity-20">{'</>'}</span><p className="text-sm">No file open</p></div>
                  </div>
                )}
              </div>

              {/* Notes sidebar */}
              {showNotePanel && af && (
                <div className="w-72 bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden shadow-sm shrink-0">
                  <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-800">Notes <span className="text-gray-400 font-normal">({fileNotes.length})</span></h3>
                    <button onClick={() => { setNewNote({ file_path: activeFile, line_start: selectedLine?.toString() || '', line_end: '', content: '', note_type: 'annotation', is_shared: true }); setShowAddNote(true); }}
                      className="text-2xs font-semibold text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50">+ Add</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {fileNotes.length === 0 && <p className="text-center text-2xs text-gray-400 py-8">No notes yet</p>}
                    {fileNotes.map(note => {
                      const tp = NOTE_TYPES.find(t => t.key === note.note_type) || NOTE_TYPES[0];
                      const isEdit = editingNote === note.id;
                      return (
                        <div key={note.id} className={`border rounded-xl p-2.5 ${tp.color}`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${tp.dot}`} />
                              <span className="text-2xs font-bold">{tp.label}{note.line_start ? ` L${note.line_start}` : ''}</span>
                            </div>
                          </div>
                          {isEdit ? (
                            <div className="space-y-1">
                              <textarea value={editNoteContent} onChange={e => setEditNoteContent(e.target.value)} className="w-full text-2xs border rounded-lg p-1.5 resize-none h-14 bg-white" />
                              <div className="flex gap-1">
                                <button onClick={() => updateNote(note.id)} className="text-2xs bg-indigo-600 text-white px-2 py-0.5 rounded-lg">Save</button>
                                <button onClick={() => setEditingNote(null)} className="text-2xs text-gray-500 border px-2 py-0.5 rounded-lg">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-2xs leading-relaxed">{note.content}</p>
                              <div className="flex items-center justify-between mt-1.5">
                                <p className="text-2xs opacity-50">{note.author?.display_name || note.author?.name}</p>
                                <div className="flex gap-1">
                                  <button onClick={() => { setEditingNote(note.id); setEditNoteContent(note.content); }} className="text-2xs opacity-40 hover:opacity-100">Edit</button>
                                  <button onClick={() => deleteNote(note.id)} className="text-2xs text-red-500 opacity-40 hover:opacity-100">Del</button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ NOTES TAB ═══ */}
          {tab === 'notes' && (
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <div className="flex gap-2 shrink-0">
                <div className="relative flex-1">
                  <svg className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  <input type="text" value={noteFilter} onChange={e => setNoteFilter(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs" />
                </div>
                <select value={noteTypeFilter} onChange={e => setNoteTypeFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
                  <option value="">All</option>
                  {NOTE_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
                <button onClick={() => { setNewNote({ file_path: '', line_start: '', line_end: '', content: '', note_type: 'annotation', is_shared: true }); setShowAddNote(true); }} className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl shadow-sm">+ New</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {(() => {
                  const g: Record<string, CodeNote[]> = {};
                  allNotes.forEach(n => { if (!g[n.file_path]) g[n.file_path] = []; g[n.file_path].push(n); });
                  return Object.entries(g).map(([file, fN]) => (
                    <div key={file} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between cursor-pointer" onClick={() => openFile(file)}>
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded ${getFileIcon(file.split('.').pop()).color} text-white text-2xs font-bold flex items-center justify-center`}>{getFileIcon(file.split('.').pop()).icon.substring(0, 2)}</div>
                          <span className="text-xs font-mono text-gray-800">{file}</span>
                        </div>
                        <span className="text-2xs bg-indigo-100 text-indigo-600 px-1.5 rounded-full font-bold">{fN.length}</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {fN.map(n => { const tp = NOTE_TYPES.find(t => t.key === n.note_type) || NOTE_TYPES[0]; return (
                          <div key={n.id} className="px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${tp.dot}`} /><span className="text-2xs font-bold text-gray-500">{tp.label}</span>
                              {n.line_start && <span className="text-2xs text-gray-400 font-mono bg-gray-100 px-1 rounded">L{n.line_start}</span>}
                              <span className="text-2xs text-gray-300 ml-auto">{n.author?.display_name || n.author?.name}</span>
                            </div>
                            <p className="text-xs text-gray-700">{n.content}</p>
                          </div>
                        ); })}
                      </div>
                    </div>
                  ));
                })()}
                {allNotes.length === 0 && <div className="bg-white rounded-xl border p-12 text-center text-gray-400"><span className="text-3xl block mb-2">📝</span><p className="text-sm">No notes yet</p></div>}
              </div>
            </div>
          )}

          {/* ═══ LEARNING TAB ═══ */}
          {tab === 'learning' && (
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: 'Total Notes', v: noteStats?.total || 0, icon: '📝', g: 'from-indigo-500 to-blue-600' },
                  { l: 'Files', v: noteStats?.topFiles?.length || 0, icon: '📁', g: 'from-emerald-500 to-teal-600' },
                  { l: 'Authors', v: Object.keys(noteStats?.byAuthor || {}).length, icon: '👥', g: 'from-purple-500 to-violet-600' },
                  { l: 'Types', v: Object.keys(noteStats?.byType || {}).length, icon: '🏷', g: 'from-amber-500 to-orange-600' },
                ].map(s => (
                  <div key={s.l} className="bg-white rounded-xl border border-gray-200 p-3 relative overflow-hidden">
                    <div className={`absolute top-0 right-0 w-12 h-12 rounded-bl-2xl bg-gradient-to-br ${s.g} opacity-10`} />
                    <span className="text-lg">{s.icon}</span>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{s.v}</p>
                    <p className="text-2xs text-gray-500">{s.l}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border p-4">
                  <h3 className="text-xs font-bold text-gray-800 mb-3">By Type</h3>
                  {NOTE_TYPES.map(t => {
                    const c = noteStats?.byType?.[t.key] || 0;
                    const p = (noteStats?.total || 0) > 0 ? (c / noteStats.total) * 100 : 0;
                    return (<div key={t.key} className="flex items-center gap-2 mb-2"><span className="text-xs w-4">{t.icon}</span><span className="text-2xs w-16 text-gray-600">{t.label}</span><div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${t.dot}`} style={{ width: `${p}%` }} /></div><span className="text-2xs font-bold text-gray-600 w-6 text-right">{c}</span></div>);
                  })}
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <h3 className="text-xs font-bold text-gray-800 mb-3">Top Files</h3>
                  {(noteStats?.topFiles || []).slice(0, 8).map((f: any, i: number) => (
                    <div key={f.file} className="flex items-center gap-2 mb-1.5 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded -mx-1" onClick={() => openFile(f.file)}>
                      <span className="text-2xs text-gray-400 font-bold w-4">{i + 1}</span>
                      <span className="text-2xs font-mono text-gray-700 truncate flex-1">{f.file}</span>
                      <span className="text-2xs font-bold text-indigo-600">{f.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b"><h3 className="text-xs font-bold text-gray-800">Recent</h3></div>
                <div className="divide-y divide-gray-50 max-h-[35vh] overflow-y-auto">
                  {allNotes.slice(0, 20).map(n => { const tp = NOTE_TYPES.find(t => t.key === n.note_type) || NOTE_TYPES[0]; return (
                    <div key={n.id} className="px-4 py-2.5 hover:bg-gray-50/50">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${tp.dot}`} /><span className="text-2xs font-bold text-gray-500">{tp.label}</span>
                        <span className="text-2xs font-mono text-indigo-600 cursor-pointer" onClick={() => openFile(n.file_path)}>{n.file_path.split('/').pop()}</span>
                        <span className="ml-auto text-2xs text-gray-300">{n.author?.display_name || n.author?.name}</span>
                      </div>
                      <p className="text-xs text-gray-700">{n.content}</p>
                    </div>
                  ); })}
                  {allNotes.length === 0 && <div className="py-10 text-center text-sm text-gray-400">No notes yet</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ ADD NOTE MODAL ═══ */}
      {showAddNote && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAddNote(false)}>
          <div className="bg-white rounded-2xl p-5 w-[460px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-900 mb-4">Add Code Note</h3>
            <div className="space-y-3">
              <input type="text" value={newNote.file_path || activeFile} onChange={e => setNewNote({ ...newNote, file_path: e.target.value })} placeholder="File path" className="w-full px-3 py-2 border rounded-xl text-xs font-mono" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={newNote.line_start} onChange={e => setNewNote({ ...newNote, line_start: e.target.value })} placeholder="Start line" className="px-3 py-2 border rounded-xl text-xs" />
                <input type="number" value={newNote.line_end} onChange={e => setNewNote({ ...newNote, line_end: e.target.value })} placeholder="End line" className="px-3 py-2 border rounded-xl text-xs" />
              </div>
              <div className="flex flex-wrap gap-1">
                {NOTE_TYPES.map(t => (
                  <button key={t.key} onClick={() => setNewNote({ ...newNote, note_type: t.key })} className={`px-2 py-1 text-2xs rounded-lg border ${newNote.note_type === t.key ? t.color + ' font-bold' : 'text-gray-500 border-gray-200'}`}>{t.icon} {t.label}</button>
                ))}
              </div>
              <textarea value={newNote.content} onChange={e => setNewNote({ ...newNote, content: e.target.value })} placeholder="Your note..." className="w-full h-20 px-3 py-2 border rounded-xl text-xs resize-none" autoFocus />
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={newNote.is_shared} onChange={e => setNewNote({ ...newNote, is_shared: e.target.checked })} className="rounded" />Share with team</label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddNote(false)} className="px-3 py-1.5 text-xs text-gray-500 border rounded-xl">Cancel</button>
                <button onClick={saveNote} disabled={!newNote.content.trim()} className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 disabled:opacity-50 rounded-xl">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD PROJECT MODAL — Folder Browser + Git Clone ═══ */}
      {showAddProject && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAddProject(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[580px] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Link Project</h3>
                <p className="text-2xs text-gray-400 mt-0.5">Browse local folders or clone a Git repository</p>
              </div>
              <button onClick={() => setShowAddProject(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex mx-5 mt-3 gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
              <button onClick={() => { setAddMode('browse'); browseFolders(); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${addMode === 'browse' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                📁 Browse Local Folder
              </button>
              <button onClick={() => setAddMode('git')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${addMode === 'git' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                🔗 Git Repository
              </button>
            </div>

            {/* ── BROWSE MODE ── */}
            {addMode === 'browse' && (
              <div className="flex-1 flex flex-col min-h-0 px-5 py-3 gap-3">
                {/* Selected path */}
                {newProjectPath && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-sm">✅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs font-semibold text-emerald-800">Selected</p>
                      <p className="text-xs font-mono text-emerald-700 truncate">{newProjectPath}</p>
                    </div>
                    <button onClick={() => { setNewProjectPath(''); setNewProjectName(''); }} className="text-emerald-400 hover:text-emerald-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}

                {/* Folder browser */}
                <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
                  {/* Path bar */}
                  {!folderIsRoot && (
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 text-2xs shrink-0">
                      <button onClick={() => browseFolders()} className="text-indigo-600 hover:underline font-medium">Locations</button>
                      {folderPath && folderPath.split('/').filter(Boolean).map((part, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-gray-300">/</span>
                          <button onClick={() => {
                            const full = (folderPath.startsWith('/') ? '/' : '') + arr.slice(0, i + 1).join('/');
                            browseFolders(full);
                          }} className="text-gray-600 hover:text-indigo-600 truncate max-w-[100px]">{part}</button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Entries */}
                  <div className="flex-1 overflow-y-auto" style={{ maxHeight: '280px' }}>
                    {folderLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="w-5 h-5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : folderEntries.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs">No folders found</div>
                    ) : (
                      folderEntries.map((e: any) => (
                        <div key={e.path} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-gray-50 transition-colors ${newProjectPath === e.path ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                          {/* Double click to navigate, single click to select */}
                          <div className="flex items-center gap-2.5 flex-1 min-w-0" onDoubleClick={() => !e.isRoot && browseFolders(e.path)} onClick={() => folderIsRoot ? browseFolders(e.path) : selectFolder(e.path, e.name)}>
                            <span className="text-lg shrink-0">{e.icon || (e.isProject ? '📦' : '📁')}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs truncate ${e.isProject ? 'font-semibold text-indigo-700' : 'text-gray-800'}`}>{e.name}</p>
                              {!folderIsRoot && <p className="text-2xs text-gray-400 truncate">{e.path}</p>}
                            </div>
                            {e.isProject && <span className="text-2xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">project</span>}
                          </div>
                          {!folderIsRoot && (
                            <button onClick={() => browseFolders(e.path)} className="text-gray-300 hover:text-indigo-500 shrink-0" title="Open">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Name + confirm */}
                <div className="flex items-center gap-2 shrink-0">
                  <input type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs" />
                  <button onClick={addProjectLocal} disabled={!newProjectName || !newProjectPath} className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl shadow-sm whitespace-nowrap">Link Project</button>
                </div>
              </div>
            )}

            {/* ── GIT MODE ── */}
            {addMode === 'git' && (
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Repository URL</label>
                  <input type="text" value={gitUrl} onChange={e => setGitUrl(e.target.value)} placeholder="https://github.com/user/repo.git" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-mono mt-1 focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <div>
                  <label className="text-2xs text-gray-500 font-semibold">Project Name <span className="text-gray-300">(optional)</span></label>
                  <input type="text" value={gitName} onChange={e => setGitName(e.target.value)} placeholder="Auto-detected from URL" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs mt-1" />
                </div>
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  <p className="text-2xs font-semibold text-gray-600">How it works:</p>
                  <div className="flex items-start gap-2 text-2xs text-gray-500">
                    <span className="text-sm mt-px">1️⃣</span>
                    <span>Clones the repo (shallow, depth=1) into <code className="bg-gray-200 px-1 rounded font-mono">.workspaces/</code></span>
                  </div>
                  <div className="flex items-start gap-2 text-2xs text-gray-500">
                    <span className="text-sm mt-px">2️⃣</span>
                    <span>Auto-links it as a project you can browse, read, and annotate</span>
                  </div>
                  <div className="flex items-start gap-2 text-2xs text-gray-500">
                    <span className="text-sm mt-px">3️⃣</span>
                    <span>Supports GitHub, GitLab, Bitbucket, or any git URL</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setShowAddProject(false)} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl">Cancel</button>
                  <button onClick={cloneRepo} disabled={!gitUrl || cloning} className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-sm flex items-center gap-2">
                    {cloning ? (
                      <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Cloning...</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> Clone &amp; Link</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </DevPortalLayout>
  );
}

// ── Sub-components ──

// ── Recursive Tree Node (Windows Explorer sidebar) ──
function TreeNode({ entry, depth, expanded, loading, onToggle, onNavigate, onOpenFile, getFileIcon, getDirIcon, currentPath }: {
  entry: FileEntry; depth: number; expanded: Record<string, FileEntry[]>; loading: string | null;
  onToggle: (path: string) => void; onNavigate: (path: string) => void; onOpenFile: (path: string) => void;
  getFileIcon: (ext?: string) => { icon: string; color: string }; getDirIcon: (name: string) => { icon: string; color: string };
  currentPath: string;
}) {
  const isOpen = !!expanded[entry.path];
  const isLoading = loading === entry.path;
  const isActive = currentPath === entry.path;
  const di = getDirIcon(entry.name);
  const children = expanded[entry.path] || [];

  return (
    <div>
      <div className={`flex items-center gap-1 pr-2 py-[3px] cursor-pointer transition-colors ${isActive ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-gray-100 text-gray-700'}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => { onToggle(entry.path); onNavigate(entry.path); }}>
        {/* Chevron */}
        {isLoading ? (
          <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          <svg className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        )}
        <span className="text-xs shrink-0">{isOpen ? '📂' : (di.icon.length <= 2 ? '📁' : di.icon)}</span>
        <span className={`text-2xs truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{entry.name}</span>
      </div>
      {/* Children */}
      {isOpen && children.length > 0 && (
        <div>
          {/* Sub-directories first */}
          {children.filter(c => c.type === 'directory').map(child => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} expanded={expanded} loading={loading}
              onToggle={onToggle} onNavigate={onNavigate} onOpenFile={onOpenFile}
              getFileIcon={getFileIcon} getDirIcon={getDirIcon} currentPath={currentPath} />
          ))}
          {/* Files */}
          {children.filter(c => c.type === 'file').map(child => {
            const fi = getFileIcon(child.ext);
            return (
              <div key={child.path}
                className="flex items-center gap-1 pr-2 py-[2px] cursor-pointer hover:bg-gray-100 text-gray-600 group"
                style={{ paddingLeft: `${22 + (depth + 1) * 14}px` }}
                onClick={() => onOpenFile(child.path)}>
                <div className={`w-3.5 h-3.5 rounded-sm ${fi.color} flex items-center justify-center text-white text-[7px] font-bold shrink-0`}>{fi.icon.substring(0, 2)}</div>
                <span className="text-2xs truncate group-hover:text-indigo-700">{child.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={disabled} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors">{children}</button>;
}

function NotesPanel({ notes, noteStats, onOpen, onLoadAll }: { notes: CodeNote[]; noteStats: any; onOpen: (f: string) => void; onLoadAll: () => void }) {
  return (
    <div className="w-64 bg-white rounded-2xl border border-gray-200 flex flex-col overflow-hidden shadow-sm shrink-0">
      <div className="px-3 py-2.5 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-800">Notes Overview</h3>
        <p className="text-2xs text-gray-400">{notes.length} total</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {notes.slice(0, 15).map(n => {
          const tp = NOTE_TYPES.find(t => t.key === n.note_type) || NOTE_TYPES[0];
          return (
            <div key={n.id} className="px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(n.file_path)}>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${tp.dot}`} />
                <span className="text-2xs font-mono text-gray-600 truncate">{n.file_path.split('/').pop()}</span>
              </div>
              <p className="text-2xs text-gray-500 truncate mt-0.5">{n.content}</p>
            </div>
          );
        })}
        {notes.length === 0 && <p className="text-center text-2xs text-gray-400 py-4">No notes</p>}
      </div>
    </div>
  );
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
