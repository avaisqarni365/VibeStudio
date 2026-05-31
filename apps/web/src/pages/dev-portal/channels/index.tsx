import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

export default function DevPortalChannels() {
  const { user, loading, devApi } = useDevAuth();
  const router = useRouter();
  const [channels, setChannels] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', description: '', icon: '💬' });

  useEffect(() => {
    if (!user) return;
    devApi('get', '/channels').then(r => setChannels(r.data.data || [])).catch(() => {});
  }, [user]);

  const createChannel = async () => {
    if (!newChannel.name.trim()) return;
    await devApi('post', '/channels', newChannel);
    setShowCreate(false);
    setNewChannel({ name: '', description: '', icon: '💬' });
    devApi('get', '/channels').then(r => setChannels(r.data.data || []));
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>;

  return (
    <DevPortalLayout user={user} title="Channels">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Channels</h1>
            <p className="text-xs text-gray-500 mt-0.5">{channels.length} channels</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Channel
          </button>
        </div>

        {showCreate && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-lg space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Create Channel</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-2xs text-gray-500 font-medium mb-1 block">Channel Name *</label>
                <input value={newChannel.name} onChange={e => setNewChannel({ ...newChannel, name: e.target.value })} placeholder="e.g. backend-dev" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="text-2xs text-gray-500 font-medium mb-1 block">Icon</label>
                <div className="flex gap-1">
                  {['💬', '🔧', '🚀', '🐛', '📢', '🎯', '💡', '🏗'].map(ic => (
                    <button key={ic} onClick={() => setNewChannel({ ...newChannel, icon: ic })} className={`w-7 h-7 rounded flex items-center justify-center text-sm ${newChannel.icon === ic ? 'bg-indigo-100 ring-1 ring-indigo-400' : 'hover:bg-gray-100'}`}>{ic}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-2xs text-gray-500 font-medium mb-1 block">Description</label>
              <input value={newChannel.description} onChange={e => setNewChannel({ ...newChannel, description: e.target.value })} placeholder="What's this channel for?" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg">Cancel</button>
              <button onClick={createChannel} disabled={!newChannel.name.trim()} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold rounded-lg">Create</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {channels.map(ch => (
            <div key={ch.id} onClick={() => router.push(`/dev-portal/channels/${ch.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 transition-colors cursor-pointer">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg">{ch.icon || '#'}</div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{ch.name}</h3>
                    {ch.description && <p className="text-2xs text-gray-500">{ch.description}</p>}
                  </div>
                </div>
                {ch.unread_count > 0 && <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-2xs flex items-center justify-center font-bold">{ch.unread_count}</span>}
              </div>
              {ch.last_message && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                  <span className="text-2xs text-gray-400 truncate flex-1">{ch.last_message.author_display_name || ch.last_message.author_name}: {ch.last_message.content}</span>
                </div>
              )}
            </div>
          ))}
          {channels.length === 0 && (
            <div className="col-span-2 text-center py-16">
              <span className="text-4xl block mb-3">💬</span>
              <p className="text-sm text-gray-500">No channels yet</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-xs text-indigo-600 font-medium">Create your first channel</button>
            </div>
          )}
        </div>
      </div>
    </DevPortalLayout>
  );
}
