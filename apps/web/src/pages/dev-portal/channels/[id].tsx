import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

const ROLE_COLORS: Record<string, string> = { ceo: 'bg-amber-500', lead: 'bg-blue-600', developer: 'bg-emerald-500', designer: 'bg-pink-500', qa: 'bg-purple-500', devops: 'bg-cyan-500', ai_agent: 'bg-indigo-500', frontend_dev: 'bg-cyan-500', backend_dev: 'bg-emerald-500', fullstack_dev: 'bg-teal-500' };

export default function DevPortalChannel() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading, devApi } = useDevAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [channel, setChannel] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [msgRes, chRes, teamRes] = await Promise.all([
        devApi('get', `/channels/${id}/messages`),
        devApi('get', '/channels'),
        devApi('get', '/team'),
      ]);
      setMessages(msgRes.data.data || []);
      const ch = (chRes.data.data || []).find((c: any) => c.id === id);
      setChannel(ch || null);
      setMembers(teamRes.data.data || []);
      devApi('put', `/channels/${id}/read`, {}).catch(() => {});
    } catch (err) {
      console.error('Channel load error:', err);
    }
    setDataLoading(false);
  }, [id, devApi]);

  useEffect(() => {
    if (!user || !id) return;
    setDataLoading(true);
    loadData();
    // Poll for new messages every 10s
    pollRef.current = setInterval(() => {
      if (id) devApi('get', `/channels/${id}/messages`).then(r => setMessages(r.data.data || [])).catch(() => {});
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, id, loadData]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!newMsg.trim() || !id) return;
    await devApi('post', `/channels/${id}/messages`, { content: newMsg });
    setNewMsg('');
    const r = await devApi('get', `/channels/${id}/messages`);
    setMessages(r.data.data || []);
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>;

  const getAvatarColor = (msg: any) => msg.author_is_ai ? 'bg-indigo-500' : ROLE_COLORS[msg.author_role] || 'bg-blue-500';

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DevPortalLayout user={user} title={channel?.name || 'Channel'}>
      <div className="flex h-[calc(100vh-7rem)] gap-0">

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Channel Header */}
          <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dev-portal/channels')} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 shrink-0 lg:hidden">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg">
                {channel?.icon || '#'}
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">{channel?.name || 'Loading...'}</h1>
                {channel?.description && <p className="text-xs text-gray-500">{channel.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{messages.length} messages</span>
              <div className="flex -space-x-1.5">
                {members.slice(0, 5).map(m => (
                  <div key={m.id} className={`w-6 h-6 rounded-full ${ROLE_COLORS[m.role] || 'bg-gray-400'} flex items-center justify-center text-white text-2xs font-bold border-2 border-white`} title={m.display_name || m.name}>
                    {m.is_ai_agent ? '🤖' : (m.display_name?.[0] || m.name?.[0])}
                  </div>
                ))}
                {members.length > 5 && <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-2xs font-bold text-gray-500 border-2 border-white">+{members.length - 5}</div>}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 bg-gray-50/50">
            {dataLoading ? (
              <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4"><span className="text-3xl">💬</span></div>
                <p className="text-sm font-medium text-gray-700">No messages yet</p>
                <p className="text-xs text-gray-400 mt-1">Start the conversation!</p>
              </div>
            ) : messages.map((msg, idx) => {
              const prevMsg = messages[idx - 1];
              const sameAuthor = prevMsg && prevMsg.author_id === msg.author_id;
              const timeDiff = prevMsg ? (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) / 60000 : 999;
              const grouped = sameAuthor && timeDiff < 5;
              return (
                <div key={msg.id} className={`flex items-start gap-3 group ${grouped ? 'mt-0.5' : 'mt-4'}`}>
                  {!grouped ? (
                    <div className={`w-9 h-9 rounded-xl ${getAvatarColor(msg)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                      {msg.author_is_ai ? '🤖' : (msg.author_display_name?.[0] || msg.author_name?.[0] || '?')}
                    </div>
                  ) : <div className="w-9 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    {!grouped && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">{msg.author_display_name || msg.author_name}</span>
                        {msg.author_is_ai && <span className="text-2xs px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-md font-medium">AI</span>}
                        <span className="text-2xs text-gray-400">{formatTime(msg.created_at)}</span>
                      </div>
                    )}
                    <div className="bg-white rounded-xl px-4 py-2.5 border border-gray-100 shadow-sm inline-block max-w-[85%]">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="px-6 py-4 bg-white border-t border-gray-100 shrink-0">
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <input
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={`Message #${channel?.name || '...'}`}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                />
              </div>
              <button onClick={send} disabled={!newMsg.trim()}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                Send
              </button>
            </div>
            <p className="text-2xs text-gray-400 mt-2">Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500 font-mono">Enter</kbd> to send · Auto-refreshes every 10s</p>
          </div>
        </div>

        {/* Right Sidebar — Channel Info */}
        <div className="w-64 shrink-0 ml-4 hidden lg:block space-y-3">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Members ({members.length})</h3>
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className={`w-8 h-8 rounded-lg ${ROLE_COLORS[m.role] || 'bg-gray-400'} flex items-center justify-center text-white text-2xs font-bold`}>
                      {m.is_ai_agent ? '🤖' : (m.display_name?.[0] || m.name?.[0])}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${m.status === 'active' ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{m.display_name || m.name}</p>
                    <p className="text-2xs text-gray-400 truncate">{m.title || m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">About</h3>
            <p className="text-xs text-gray-500">{channel?.description || 'No description'}</p>
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
              <div className="flex items-center justify-between text-2xs"><span className="text-gray-400">Created</span><span className="text-gray-600">{channel?.created_at ? new Date(channel.created_at).toLocaleDateString('de-DE') : '—'}</span></div>
              <div className="flex items-center justify-between text-2xs"><span className="text-gray-400">Messages</span><span className="text-gray-600">{messages.length}</span></div>
              <div className="flex items-center justify-between text-2xs"><span className="text-gray-400">Type</span><span className="text-gray-600 capitalize">{channel?.type || 'channel'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </DevPortalLayout>
  );
}
