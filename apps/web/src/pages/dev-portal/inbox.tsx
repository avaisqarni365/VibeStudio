import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

export default function DevPortalInbox() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchInbox = async (resetItems = true, cursor?: string) => {
    const params = new URLSearchParams();
    if (filter === 'unread') params.set('is_read', 'false');
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const r = await devApi('get', `/inbox${qs}`);
    const data = r.data.data || {};
    const newItems: any[] = data.items || [];
    setNextCursor(data.next_cursor || null);
    if (resetItems) {
      setItems(newItems);
    } else {
      setItems(prev => [...prev, ...newItems]);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchInbox(true).catch(() => {});
  }, [user, filter]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try { await fetchInbox(false, nextCursor); } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  };

  const markAllRead = async () => {
    await devApi('put', '/inbox/read', {});
    setItems(prev => prev.map(i => ({ ...i, is_read: true })));
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  return (
    <DevPortalLayout user={user} title="Inbox">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
            <p className="text-xs text-gray-500 mt-0.5">{items.filter(i => !i.is_read).length} unread notifications</p>
          </div>
          <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300">Mark all read</button>
        </div>

        <div className="flex gap-2">
          {['all', 'unread'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-md ${filter === f ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {f === 'all' ? 'All' : 'Unread'}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {items.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <span className="text-4xl block mb-3">📭</span>
              <p className="text-sm">All caught up!</p>
            </div>
          ) : items.map(item => (
            <div key={item.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer ${item.is_read ? 'bg-white hover:bg-gray-50' : 'bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10'}`}
              onClick={() => {
                devApi('put', '/inbox/read', { inbox_id: item.id });
                setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_read: true } : i));
                if (item.source_type === 'task' && item.source_id) router.push('/dev-portal/tasks/' + item.source_id);
                else if (item.source_type === 'channel' && item.source_id) router.push('/dev-portal/channels/' + item.source_id);
              }}>
              <div className={`w-8 h-8 rounded-full ${item.actor_is_ai ? 'bg-indigo-500' : 'bg-blue-500'} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {item.actor_is_ai ? '🤖' : (item.actor_display_name?.[0] || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-900 font-medium">{item.title}</p>
                {item.body && <p className="text-2xs text-gray-500 mt-0.5 truncate">{item.body}</p>}
                <p className="text-2xs text-gray-400 mt-1">{item.actor_display_name || item.actor_name} · {new Date(item.created_at).toLocaleString('de-DE')}</p>
              </div>
              {!item.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
            </div>
          ))}
        </div>

        {nextCursor && (
          <div className="flex justify-center pt-2">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 px-4 py-2 rounded-lg border border-blue-500/20 hover:bg-blue-500/10 transition-colors"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </DevPortalLayout>
  );
}
