import { useState, useEffect } from 'react';
import Link from 'next/link';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';
import { useI18n } from '@/lib/i18n';

export default function DevPortalHome() {
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const { t } = useI18n();
  const [spaces, setSpaces] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState('');

  useEffect(() => {
    if (!user) return;
    devApi('get', '/spaces').then(r => {
      const s = r.data.data || [];
      setSpaces(s);
      if (s[0]) {
        setActiveSpaceId(s[0].id);
        devApi('get', `/spaces/${s[0].id}/docs`).then(d => setDocs(d.data.data || [])).catch(() => {});
      }
    }).catch(() => {});
    devApi('get', '/bookmarks').then(r => setBookmarks(r.data.data || [])).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (activeProjectId) {
      devApi('get', `/projects/${activeProjectId}/activity`).then(a => setActivity(a.data.data?.items || [])).catch(() => {});
    } else {
      devApi('get', '/projects').then(pr => {
        if (pr.data.data?.[0]) devApi('get', `/projects/${pr.data.data[0].id}/activity`).then(a => setActivity(a.data.data?.items || [])).catch(() => {});
      }).catch(() => {});
    }
  }, [user, activeProjectId]);

  if (loading || !user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;

  const activeSpace = spaces.find(s => s.id === activeSpaceId);

  return (
    <DevPortalLayout user={user} title="Home">
      <div className="space-y-6">

        {/* 3-Column Widgets (like ClickUp screenshot) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Recent */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">{t('dev.recent', '📌 Recent')}</h3>
            </div>
            {activeSpace && (
              <div className="space-y-1">
                {(activeSpace.lists || []).slice(0, 5).map((l: any) => (
                  <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer">
                    <span>{l.icon}</span>
                    <span>{l.name}</span>
                    <span className="text-2xs text-gray-400 ml-auto">{t('dev.in', 'in')} {activeSpace.name}</span>
                  </div>
                ))}
              </div>
            )}
            {!activeSpace && <p className="text-xs text-gray-400">{t('dev.no_recent', 'No recent items')}</p>}
          </div>

          {/* Docs */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">{t('dev.docs', '📄 Docs')}</h3>
            </div>
            {docs.length > 0 ? (
              <div className="space-y-1">
                {docs.slice(0, 5).map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer">
                    <span>{d.icon}</span><span>{d.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                </div>
                <p className="text-2xs text-gray-400">{t('dev.no_docs', 'No docs yet')}</p>
                <button className="mt-2 text-2xs text-blue-400 hover:text-blue-300 font-medium">{t('dev.add_doc', 'Add a Doc')}</button>
              </div>
            )}
          </div>

          {/* Bookmarks */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">{t('dev.bookmarks', '🔖 Bookmarks')}</h3>
            </div>
            {bookmarks.length > 0 ? (
              <div className="space-y-1">
                {bookmarks.map((b: any) => (
                  <a key={b.id} href={b.url} target="_blank" rel="noopener" className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-blue-400 transition-colors">
                    <span>{b.icon}</span><span className="truncate">{b.title}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
                </div>
                <p className="text-2xs text-gray-400">{t('dev.bookmarks_hint', 'Save useful links here')}</p>
                <button className="mt-2 text-2xs text-blue-400 hover:text-blue-300 font-medium">{t('dev.add_bookmark', 'Add Bookmark')}</button>
              </div>
            )}
          </div>
        </div>

        {/* Lists Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">{t('dev.lists', 'Lists')}</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-2xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">{t('dev.col_name', 'Name')}</th>
                <th className="text-left px-4 py-2 font-medium w-12">{t('dev.col_color', 'Color')}</th>
                <th className="text-left px-4 py-2 font-medium w-48">{t('dev.col_progress', 'Progress')}</th>
                <th className="text-left px-4 py-2 font-medium w-24">{t('dev.col_start', 'Start')}</th>
                <th className="text-left px-4 py-2 font-medium w-24">{t('dev.col_end', 'End')}</th>
                <th className="text-left px-4 py-2 font-medium w-20">{t('dev.col_priority', 'Priority')}</th>
                <th className="text-left px-4 py-2 font-medium w-20">{t('dev.col_owner', 'Owner')}</th>
              </tr>
            </thead>
            <tbody>
              {activeSpace && (activeSpace.lists || []).map((list: any) => {
                const progress = list.task_count > 0 ? (list.done_count / list.task_count) * 100 : 0;
                return (
                  <tr key={list.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                        <span>{list.icon}</span>{list.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {list.color && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: list.color }} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-2xs text-gray-500 w-10 text-right">{list.done_count}/{list.task_count}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="text-2xs text-gray-500">—</span></td>
                    <td className="px-4 py-3"><span className="text-2xs text-gray-500">—</span></td>
                    <td className="px-4 py-3"><span className="text-2xs text-gray-500">—</span></td>
                    <td className="px-4 py-3"><span className="text-2xs text-gray-500">—</span></td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={7} className="px-4 py-2">
                  <button className="text-2xs text-gray-400 hover:text-blue-400 flex items-center gap-1.5 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    {t('dev.new_list', 'New List')}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Activity Feed */}
        {activity.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-900 mb-3">{t('dev.recent_activity', '⚡ Recent Activity')}</h3>
            <div className="space-y-2">
              {activity.slice(0, 10).map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-2xs">
                  <div className={`w-5 h-5 rounded-full ${a.actor_is_ai ? 'bg-indigo-500' : 'bg-blue-500'} flex items-center justify-center text-white text-2xs font-bold shrink-0 mt-0.5`}>
                    {a.actor_is_ai ? '🤖' : (a.actor_display_name?.[0] || '?')}
                  </div>
                  <div>
                    <span className="text-gray-700 font-medium">{a.actor_display_name || a.actor_name}</span>
                    <span className="text-gray-400"> {a.action.replace(/_/g, ' ')}</span>
                    {a.entity_name && <span className="text-blue-400"> {a.entity_name}</span>}
                    <span className="text-gray-400 ml-2">{new Date(a.created_at).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DevPortalLayout>
  );
}
