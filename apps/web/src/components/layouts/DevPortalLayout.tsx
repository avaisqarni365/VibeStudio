import { useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import axios from 'axios';

interface DevUser {
  id: string; email: string; name: string; display_name?: string;
  role: string; title?: string; avatar_url?: string; is_ai_agent?: boolean;
}

interface Props { children: ReactNode; user: DevUser | null; title?: string; }

const ROLE_COLORS: Record<string, string> = {
  ceo: 'bg-amber-500', lead: 'bg-blue-600', developer: 'bg-emerald-500',
  designer: 'bg-pink-500', qa: 'bg-purple-500', devops: 'bg-cyan-500', ai_agent: 'bg-indigo-500',
};

const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'list', label: 'List' },
  { key: 'board', label: 'Board' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'gantt', label: 'Gantt' },
  { key: 'table', label: 'Table' },
];

export default function DevPortalLayout({ children, user, title }: Props) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedSpaces, setExpandedSpaces] = useState<Record<string, boolean>>({});
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('overview');
  const [showOrgFlow, setShowOrgFlow] = useState(false);
  const [showVibeGuide, setShowVibeGuide] = useState(false);
  // Collapsible sidebar groups (+/- menu items). Default: all expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  const groupOpen = (key: string) => !collapsedGroups[key];

  const [spaces, setSpaces] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [favorites, setFavorites] = useState<any[]>([]);

  // ── Multi-Project Context ──
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  useEffect(() => {
    // B-5: auth is now cookie-based; axios withCredentials sends it automatically.
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';
    const cfg = { withCredentials: true };
    axios.get(`${API}/api/v1/dev-portal/spaces`, cfg).then(r => {
      const s = r.data.data || [];
      setSpaces(s);
      if (!activeSpaceId && s[0]) setActiveSpaceId(s[0].id);
    }).catch(() => {});
    axios.get(`${API}/api/v1/dev-portal/channels`, cfg).then(r => setChannels(r.data.data || [])).catch(() => {});
    axios.get(`${API}/api/v1/dev-portal/inbox/count`, cfg).then(r => setInboxCount(r.data.data?.count || 0)).catch(() => {});
    axios.get(`${API}/api/v1/dev-portal/favorites`, cfg).then(r => setFavorites(r.data.data || [])).catch(() => {});
    // Load projects + active project from DB
    Promise.all([
      axios.get(`${API}/api/v1/dev-portal/projects`, cfg),
      axios.get(`${API}/api/v1/dev-portal/active-project`, cfg).catch(() => ({ data: { data: { active_project_id: null } } })),
    ]).then(([projRes, activeRes]) => {
      const list = projRes.data.data || [];
      setProjects(list);
      const savedId = activeRes.data.data?.active_project_id;
      const match = savedId && list.find((p: any) => p.id === savedId);
      setActiveProjectId(match ? savedId : list[0]?.id || '');
    }).catch(() => {});
  }, [user]);

  const switchProject = (id: string) => {
    setActiveProjectId(id);
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';
    axios.put(`${API}/api/v1/dev-portal/active-project`, { project_id: id }, { withCredentials: true }).catch(() => {});
    setShowProjectPicker(false);
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  useEffect(() => {
    if (activeSpaceId) setExpandedSpaces(prev => ({ ...prev, [activeSpaceId]: true }));
  }, [activeSpaceId]);

  const toggleSpace = (id: string) => setExpandedSpaces(prev => ({ ...prev, [id]: !prev[id] }));
  const logout = async () => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';
    try { await axios.post(`${API}/api/v1/dev-portal/auth/logout`, {}, { withCredentials: true }); } catch { /* non-fatal */ }
    router.push('/dev-portal/login');
  };
  const activeSpace = spaces.find((s: any) => s.id === activeSpaceId);
  const isSpecialPage = ['/dev-portal/team', '/dev-portal/agents', '/dev-portal/architecture', '/dev-portal/deployments', '/dev-portal/settings', '/dev-portal/inbox', '/dev-portal/channels', '/dev-portal/my-tasks', '/dev-portal/wiki', '/dev-portal/guide', '/dev-portal/help', '/dev-portal/project', '/dev-portal/tasks', '/dev-portal/knowledge', '/dev-portal/project-explorer', '/dev-portal/prompts', '/dev-portal/ai', '/dev-portal/environments', '/dev-portal/portfolio'].some(p => router.pathname.startsWith(p));

  return (
    <>
      <Head><title>{title ? `${title} — VibeStudio` : 'VibeStudio'}</title></Head>
      <div className="min-h-screen bg-gray-50 flex">

        {/* ── LEFT SIDEBAR ── */}
        <aside className={`${sidebarCollapsed ? 'w-14' : 'w-60'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 shrink-0`}>

          {/* Workspace Header */}
          <div className="h-13 flex items-center justify-between px-3 py-3 border-b border-gray-100">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <span className="text-white text-xs font-black">V</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">VibeStudio</p>
                  <p className="text-2xs text-gray-400">Workspace</p>
                </div>
              </div>
            )}
            {sidebarCollapsed && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm mx-auto">
                <span className="text-white text-xs font-black">V</span>
              </div>
            )}
          </div>

          {/* ── Work ── */}
          <SidebarGroup title="Work" collapsed={sidebarCollapsed} open={groupOpen('work')} onToggle={() => toggleGroup('work')} first>
            <SidebarLink href="/dev-portal" icon="🏠" label="Home" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal'} />
            <SidebarLink href="/dev-portal/portfolio" icon="🗂" label="Portfolio" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/portfolio'} />
            <SidebarLink href="/dev-portal/inbox" icon="📥" label="Inbox" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/inbox'} badge={inboxCount > 0 ? inboxCount : undefined} />
            <SidebarLink href="/dev-portal/my-tasks" icon="✅" label="My Tasks" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/my-tasks'} />
          </SidebarGroup>

          {/* ── Tasks & Planning ── */}
          <SidebarGroup title="Tasks & Planning" collapsed={sidebarCollapsed} open={groupOpen('planning')} onToggle={() => toggleGroup('planning')}>
            <SidebarLink href="/dev-portal/tasks" icon="📋" label="All Tasks" collapsed={sidebarCollapsed} active={router.pathname.startsWith('/dev-portal/tasks')} />
            <SidebarLink href="/dev-portal/board" icon="🗂" label="Board" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/board'} />
            <SidebarLink href="/dev-portal/sprints" icon="🏃" label="Sprints" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/sprints'} />
            <SidebarLink href="/dev-portal/deployments" icon="🚀" label="Deployments" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/deployments'} />
            <SidebarLink href="/dev-portal/settings" icon="⚙" label="Settings" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/settings'} />
          </SidebarGroup>

          {/* ── People & AI ── */}
          <SidebarGroup title="People & AI" collapsed={sidebarCollapsed} open={groupOpen('people')} onToggle={() => toggleGroup('people')}>
            <SidebarLink href="/dev-portal/team" icon="👥" label="Team" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/team'} />
            <SidebarLink href="/dev-portal/ai" icon="✨" label="AI Panel" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/ai'} />
            <SidebarLink href="/dev-portal/agents" icon="🤖" label="AI Agents" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/agents'} />
            <SidebarLink href="/dev-portal/prompts" icon="📝" label="Prompt History" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/prompts'} />
            <SidebarLink href="/dev-portal/experiments" icon="🧪" label="Prompt A/B Lab" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/experiments'} />
            <SidebarLink href="/dev-portal/usage" icon="📊" label="My AI Usage" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/usage'} />
          </SidebarGroup>

          {/* ── Project ── */}
          <SidebarGroup title="Project" collapsed={sidebarCollapsed} open={groupOpen('project')} onToggle={() => toggleGroup('project')}>
            <SidebarLink href="/dev-portal/project-explorer?tab=explorer" icon="📂" label="Explorer" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/project-explorer' && (!router.query.tab || router.query.tab === 'explorer')} />
            <SidebarLink href="/dev-portal/project-explorer?tab=viewer" icon="📄" label="Code Viewer" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/project-explorer' && router.query.tab === 'viewer'} />
            <SidebarLink href="/dev-portal/project-explorer?tab=notes" icon="📝" label="Code Notes" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/project-explorer' && router.query.tab === 'notes'} />
            <SidebarLink href="/dev-portal/project-explorer?tab=learning" icon="🎓" label="Team Learning" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/project-explorer' && router.query.tab === 'learning'} />
          </SidebarGroup>

          {/* ── Knowledge ── */}
          <SidebarGroup title="Knowledge" collapsed={sidebarCollapsed} open={groupOpen('knowledge')} onToggle={() => toggleGroup('knowledge')}>
            <SidebarLink href="/dev-portal/knowledge?tab=docs" icon="📚" label="Knowledge Base" collapsed={sidebarCollapsed} active={router.pathname === '/dev-portal/knowledge'} />
          </SidebarGroup>

          {/* ── Channels ── */}
          {!sidebarCollapsed && channels.length > 0 && (
            <SidebarGroup title="Channels" collapsed={sidebarCollapsed} open={groupOpen('channels')} onToggle={() => toggleGroup('channels')}>
              {channels.filter((c: any) => c.type === 'channel').map((ch: any) => (
                <Link key={ch.id} href={`/dev-portal/channels/${ch.id}`}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${router.asPath.includes(ch.id) ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                  <span className="flex items-center gap-1.5"><span className="text-gray-400 font-medium">#</span>{ch.name}</span>
                  {ch.unread_count > 0 && <span className="min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-2xs flex items-center justify-center font-bold">{ch.unread_count}</span>}
                </Link>
              ))}
            </SidebarGroup>
          )}

          {/* ── Team Space (bottom, expandable) ── */}
          <div className="flex-1 overflow-y-auto py-2 px-2 border-t border-gray-100">
            {!sidebarCollapsed && (
              <button onClick={() => toggleGroup('spaces')} className="w-full flex items-center justify-between px-2 mb-1.5 group">
                <span className="text-2xs text-gray-400 font-semibold uppercase tracking-wider group-hover:text-gray-600">Spaces</span>
                <span className="text-gray-400 group-hover:text-gray-600 text-sm leading-none select-none w-4 text-center">{groupOpen('spaces') ? '−' : '+'}</span>
              </button>
            )}
            {(sidebarCollapsed || groupOpen('spaces')) && spaces.map((space: any) => (
              <div key={space.id} className="mb-0.5">
                <button
                  onClick={() => { toggleSpace(space.id); setActiveSpaceId(space.id); }}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${activeSpaceId === space.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <svg className={`w-3 h-3 text-gray-400 transition-transform ${expandedSpaces[space.id] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ backgroundColor: space.color + '20', color: space.color }}>{space.icon}</div>
                  {!sidebarCollapsed && <span className="font-medium truncate">{space.name}</span>}
                </button>
                {expandedSpaces[space.id] && !sidebarCollapsed && space.lists && (
                  <div className="ml-6 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-2">
                    {space.lists.map((list: any) => (
                      <button key={list.id} onClick={() => { setActiveSpaceId(space.id); router.push('/dev-portal/tasks'); }}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors">
                        <span className="flex items-center gap-1.5 truncate">
                          <span>{list.icon}</span><span>{list.name}</span>
                        </span>
                        {list.task_count > 0 && <span className="text-2xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">{list.task_count}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── User Profile ── */}
          <div className="border-t border-gray-100">
            <div className="px-3 py-2.5 flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg ${ROLE_COLORS[user?.role || 'developer']} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                {user?.display_name?.[0] || user?.name?.[0] || '?'}
              </div>
              {!sidebarCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{user?.display_name || user?.name}</p>
                    <p className="text-2xs text-gray-400 truncate capitalize">{user?.role}</p>
                  </div>
                  <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors" title="Logout">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* ── MAIN AREA ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Top Bar */}
          <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-5 shrink-0">
            <div className="flex items-center gap-4">
              {/* Collapse toggle */}
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              </button>

              {/* Project Switcher */}
              {activeProject && (
                <div className="relative">
                  <button onClick={() => setShowProjectPicker(!showProjectPicker)}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 hover:border-indigo-300 transition-colors">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ backgroundColor: (activeProject.color || '#6366f1') + '20', color: activeProject.color || '#6366f1' }}>
                      {activeProject.icon || '📦'}
                    </div>
                    <span className="text-xs font-semibold text-gray-800 max-w-[100px] truncate">{activeProject.name}</span>
                    <svg className={`w-3 h-3 text-gray-400 transition-transform ${showProjectPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  {showProjectPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProjectPicker(false)} />
                      <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 max-h-[300px] overflow-y-auto">
                        <p className="px-3 py-1.5 text-2xs text-gray-400 font-semibold uppercase">Switch Project</p>
                        {projects.map(p => (
                          <button key={p.id} onClick={() => switchProject(p.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${p.id === activeProjectId ? 'bg-indigo-50' : ''}`}>
                            <div className="w-6 h-6 rounded-md flex items-center justify-center text-sm" style={{ backgroundColor: (p.color || '#6366f1') + '20', color: p.color || '#6366f1' }}>{p.icon || '📦'}</div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs truncate ${p.id === activeProjectId ? 'font-bold text-indigo-700' : 'text-gray-800'}`}>{p.name}</p>
                              <p className="text-2xs text-gray-400">{p.key} · {p.stats?.total || 0} tasks</p>
                            </div>
                            {p.id === activeProjectId && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                          </button>
                        ))}
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <Link href="/dev-portal/portfolio" onClick={() => setShowProjectPicker(false)}
                            className="flex items-center gap-2 px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50 font-medium">
                            <span>🗂</span> View All Projects
                          </Link>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Breadcrumb */}
              {activeSpace && !isSpecialPage && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ backgroundColor: activeSpace.color + '15', color: activeSpace.color }}>{activeSpace.icon}</div>
                  <span className="font-semibold text-gray-900">{activeSpace.name}</span>
                </div>
              )}
              {isSpecialPage && <span className="text-sm font-semibold text-gray-900">{title}</span>}

              {/* View Tabs — linked to pages */}
              {!isSpecialPage && (
                <div className="flex items-center gap-1 ml-2 border-l border-gray-200 pl-4">
                  {VIEWS.map(v => {
                    const viewPaths: Record<string, string> = {
                      overview: '/dev-portal',
                      list: '/dev-portal/tasks',
                      board: '/dev-portal/board',
                      calendar: '/dev-portal/calendar',
                      gantt: '/dev-portal/gantt',
                      table: '/dev-portal/tasks',
                    };
                    const href = viewPaths[v.key] || '/dev-portal';
                    const isActive = (v.key === 'overview' && router.pathname === '/dev-portal')
                      || (v.key === 'list' && router.pathname.startsWith('/dev-portal/tasks'))
                      || (v.key === 'board' && router.pathname === '/dev-portal/board')
                      || (v.key === 'calendar' && router.pathname === '/dev-portal/calendar')
                      || (v.key === 'gantt' && router.pathname === '/dev-portal/gantt')
                      || (v.key === 'table' && router.pathname.startsWith('/dev-portal/tasks') && activeView === 'table');
                    return (
                      <Link key={v.key} href={href} onClick={() => setActiveView(v.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                        {v.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setShowOrgFlow(!showOrgFlow)} className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 border transition-colors ${showOrgFlow ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border-gray-200'}`}>
                🏢 Org Flow
              </button>
              <button onClick={() => setShowVibeGuide(!showVibeGuide)} className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 border transition-colors ${showVibeGuide ? 'bg-purple-50 text-purple-700 border-purple-200' : 'text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border-gray-200'}`}>
                ⚡ Vibe Code
              </button>
              <button className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center gap-1.5 border border-gray-200 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                Search
              </button>
              <Link href="/dev-portal/tasks" className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                New Task
              </Link>
            </div>
          </header>

          {/* ── Org Flow Panel ── */}
          {showOrgFlow && (
            <div className="bg-white border-b border-gray-200 px-6 py-5 shadow-sm">
              <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-900">🏢 Organization Flow — VibeStudio Team</h2>
                  <button onClick={() => setShowOrgFlow(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                {/* Org Chart */}
                <div className="flex flex-col items-center gap-2 mb-5">
                  <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-center">
                    <p className="text-xs font-bold text-amber-800">👑 CEO / Founder</p>
                    <p className="text-2xs text-amber-600">Vision, strategy, final approval</p>
                  </div>
                  <div className="w-px h-4 bg-gray-300" />
                  <div className="flex gap-3">
                    <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-center">
                      <p className="text-2xs font-bold text-rose-700">📋 Product Owner</p>
                      <p className="text-2xs text-rose-500">Backlog, priorities</p>
                    </div>
                    <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-center">
                      <p className="text-2xs font-bold text-blue-700">🏗 Tech Lead</p>
                      <p className="text-2xs text-blue-500">Architecture, reviews</p>
                    </div>
                    <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                      <p className="text-2xs font-bold text-indigo-700">🏃 Scrum Master</p>
                      <p className="text-2xs text-indigo-500">Sprints, standups</p>
                    </div>
                  </div>
                  <div className="w-px h-4 bg-gray-300" />
                  <div className="flex gap-2 flex-wrap justify-center">
                    {[
                      { icon: '🎨', label: 'Frontend', color: 'cyan' },
                      { icon: '⚙', label: 'Backend', color: 'emerald' },
                      { icon: '🗄', label: 'Database', color: 'violet' },
                      { icon: '📱', label: 'Mobile', color: 'orange' },
                      { icon: '🐳', label: 'DevOps', color: 'sky' },
                      { icon: '🎨', label: 'Design', color: 'pink' },
                      { icon: '🧪', label: 'QA', color: 'purple' },
                    ].map(r => (
                      <div key={r.label} className={`px-2.5 py-1 bg-${r.color}-50 border border-${r.color}-200 rounded-lg text-center`}>
                        <p className="text-2xs font-medium text-gray-700">{r.icon} {r.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="w-px h-4 bg-gray-300" />
                  <div className="px-4 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
                    <p className="text-2xs font-bold text-indigo-700">🤖 AI Agents (6)</p>
                    <p className="text-2xs text-indigo-500">Coding · Ops · QA · Security · Analytics · Release</p>
                  </div>
                </div>
                {/* Sprint Cycle */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sprint Cycle (2 weeks)</p>
                  <div className="flex items-center gap-1">
                    {[
                      { label: 'Planning', desc: 'PO + Team', color: 'bg-blue-500' },
                      { label: 'Daily Standup', desc: 'All team', color: 'bg-emerald-500' },
                      { label: 'Development', desc: 'Dev + AI', color: 'bg-indigo-500' },
                      { label: 'Code Review', desc: 'Lead + Peers', color: 'bg-purple-500' },
                      { label: 'QA Testing', desc: 'QA + AI QA', color: 'bg-amber-500' },
                      { label: 'Deploy', desc: 'DevOps + AI', color: 'bg-cyan-500' },
                      { label: 'Retro', desc: 'All team', color: 'bg-rose-500' },
                    ].map((step, i) => (
                      <div key={step.label} className="flex items-center flex-1">
                        <div className="flex-1 text-center">
                          <div className={`${step.color} text-white text-2xs font-bold px-2 py-1.5 rounded-lg`}>{step.label}</div>
                          <p className="text-2xs text-gray-400 mt-0.5">{step.desc}</p>
                        </div>
                        {i < 6 && <svg className="w-4 h-4 text-gray-300 shrink-0 mx-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Vibe Coding Guide Panel ── */}
          {showVibeGuide && (
            <div className="bg-white border-b border-gray-200 px-6 py-5 shadow-sm">
              <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-900">⚡ Vibe Coding — Prompt-to-Production Flow</h2>
                  <button onClick={() => setShowVibeGuide(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                {/* Flow Steps */}
                <div className="grid grid-cols-7 gap-2 mb-5">
                  {[
                    { n: '1', icon: '💡', label: 'Describe', desc: 'Write what you want in natural language', color: 'from-amber-500 to-orange-500' },
                    { n: '2', icon: '📋', label: 'Create Task', desc: 'Pick domain, type, priority, assign', color: 'from-blue-500 to-indigo-500' },
                    { n: '3', icon: '🤖', label: 'Generate Prompt', desc: 'AI builds context + template + rules', color: 'from-indigo-500 to-purple-500' },
                    { n: '4', icon: '📋', label: 'Copy & Paste', desc: 'Into Claude, Cursor, Copilot, etc.', color: 'from-purple-500 to-pink-500' },
                    { n: '5', icon: '⚡', label: 'AI Codes', desc: 'Migration + route + service + page', color: 'from-pink-500 to-rose-500' },
                    { n: '6', icon: '✅', label: 'Review & Test', desc: 'QA agent + human review', color: 'from-rose-500 to-red-500' },
                    { n: '7', icon: '🚀', label: 'Deploy', desc: 'CI/CD → staging → production', color: 'from-emerald-500 to-teal-500' },
                  ].map((step, i) => (
                    <div key={step.n} className="text-center">
                      <div className={`bg-gradient-to-br ${step.color} text-white rounded-xl p-3 mb-1.5 shadow-sm`}>
                        <span className="text-lg block">{step.icon}</span>
                        <p className="text-2xs font-bold mt-1">{step.label}</p>
                      </div>
                      <p className="text-2xs text-gray-500 leading-tight">{step.desc}</p>
                    </div>
                  ))}
                </div>
                {/* Quick Example */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-900 rounded-xl p-4">
                    <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">You Say (Natural Language)</p>
                    <p className="text-xs text-emerald-400 font-mono leading-relaxed">"Add saved board views so a member can save a column/filter layout, name it, and switch between views. Show the saved views as tabs above the Kanban board."</p>
                  </div>
                  <div className="bg-gray-900 rounded-xl p-4">
                    <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Creates (Full Stack)</p>
                    <div className="space-y-1 text-2xs font-mono text-gray-300">
                      <p><span className="text-blue-400">1.</span> infrastructure/migrations/081_dev_board_views.js</p>
                      <p><span className="text-emerald-400">2.</span> domains/dev-portal/src/dev-portal-service.ts</p>
                      <p><span className="text-purple-400">3.</span> apps/api/src/routes/dev-portal.ts</p>
                      <p><span className="text-amber-400">4.</span> apps/web/src/pages/dev-portal/views.tsx</p>
                      <p><span className="text-cyan-400">5.</span> DevPortalLayout sidebar entry</p>
                      <p><span className="text-rose-400">6.</span> logActivity() → dev_activity_log</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-lg">💡</span>
                  <div>
                    <p className="text-xs font-semibold text-indigo-800">How to Vibe Code with VibeStudio</p>
                    <p className="text-2xs text-indigo-600">Create a task → Pick module → AI generates the prompt with all VibeStudio context → Copy to Claude → Get full implementation → Review → Deploy. Each task has a ready-to-use prompt on the <b>AI Prompt Builder</b> tab.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <main className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-5">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

/** A collapsible sidebar section with a +/- toggle. In icon-only (collapsed)
 *  mode the header is hidden and the links always show. */
function SidebarGroup({ title, collapsed, open, onToggle, first, children }: { title: string; collapsed: boolean; open: boolean; onToggle: () => void; first?: boolean; children: ReactNode }) {
  if (collapsed) {
    return <div className={`py-2 px-2 space-y-0.5 ${first ? '' : 'border-t border-gray-100'}`}>{children}</div>;
  }
  return (
    <div className={`py-2 px-2 ${first ? '' : 'border-t border-gray-100'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-2 mb-1 group" title={open ? `Collapse ${title}` : `Expand ${title}`}>
        <span className="text-2xs text-gray-400 font-semibold uppercase tracking-wider group-hover:text-gray-600">{title}</span>
        <span className="text-gray-400 group-hover:text-gray-600 text-sm leading-none select-none w-4 text-center">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function SidebarLink({ href, icon, label, collapsed, active, badge }: { href: string; icon: string; label: string; collapsed: boolean; active: boolean; badge?: number }) {
  return (
    <Link href={href} className={`flex items-center justify-between px-2 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
      <span className="flex items-center gap-2.5">
        <span className="text-base w-5 text-center">{icon}</span>
        {!collapsed && <span>{label}</span>}
      </span>
      {badge !== undefined && !collapsed && (
        <span className="min-w-[20px] h-[20px] rounded-full bg-red-500 text-white text-2xs flex items-center justify-center font-bold px-1">{badge}</span>
      )}
    </Link>
  );
}
