import { useState, useEffect, useRef } from 'react';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import PasswordInput from '@/components/shared/PasswordInput';

const VIBE_SYSTEM_PROMPT = `You are an AI assistant for the VibeStudio development team.

Project: VibeStudio — a standalone Vibe Code Prompt Studio (project management + sprint board + AI prompt library + wiki + activity feed) for vibe-coding teams. It has NO accounting concepts. Roadmap: standalone desktop (.exe) + mobile app, integrated with Claude subscriptions and AI provider APIs, focused on prompt engineering and developer context tooling.
Stack: Node.js/Express/Knex (PostgreSQL) + React/Next.js 14 (Pages Router)/Tailwind. TypeScript monorepo (Turborepo). API on :4100, web on :3100, DB tunnel on 127.0.0.1:5545.

Key rules you MUST follow:
- Auth: dev_portal_token (httpOnly JWT cookie + Bearer fallback). Never validate acca_token. Roles: ceo / lead / product_owner + agent_* roles.
- DB: all tables prefixed dev_*. snake_case columns. UUID PKs. RLS enabled — direct scripts SET LOCAL app.current_member_id.
- API response: { success: boolean, data?: T, error?: { code, message } }. Base: /api/v1/dev-portal.
- Frontend: DevPortalLayout + useDevAuth() (devApi helper). React hooks: ALL useState/useEffect before any conditional return.
- Migrations: never edit a shipped one; add NNN_<slug>.js (next: 081) with knex up/down + hasTable guards.
- AI providers: Anthropic / OpenAI / DeepSeek / Moonshot / Groq. Prefer the latest Claude models. logActivity() on mutations.`;

export default function DevPortalAI() {
  const { user, loading, devApi } = useDevAuth();
  const [providers, setProviders] = useState<Record<string, any>>({});
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<'chat' | 'providers'>('chat');
  const [keyInput, setKeyInput] = useState('');
  const [keyProvider, setKeyProvider] = useState('');
  const [testing, setTesting] = useState('');
  const [useSystemPrompt, setUseSystemPrompt] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    devApi('get', '/ai/providers').then(r => {
      const p = r.data.data || {};
      setProviders(p);
      // Auto-select first configured provider
      const configured = Object.values(p).find((pr: any) => pr.configured);
      if (configured) {
        setSelectedProvider((configured as any).provider);
        setSelectedModel((configured as any).models[0]?.id || '');
      } else {
        setSelectedModel(p.openai?.models?.[0]?.id || 'gpt-4o');
      }
    }).catch(() => {});
  }, [user]);

  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [messages]);

  // When provider changes, select first model
  useEffect(() => {
    const p = providers[selectedProvider];
    if (p?.models?.length) setSelectedModel(p.models[0].id);
  }, [selectedProvider]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const r = await devApi('post', '/ai/chat', {
        provider: selectedProvider,
        model: selectedModel,
        messages: newMessages,
        temperature,
        max_tokens: 4096,
        system_prompt: useSystemPrompt ? VIBE_SYSTEM_PROMPT : undefined,
      });
      if (r.data.success) {
        setMessages([...newMessages, { role: 'assistant', content: r.data.data.content }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${r.data.error?.message || 'Request failed'}` }]);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error?.message || err?.message || 'Request failed';
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${errorMsg}` }]);
    }
    setSending(false);
  };

  const saveKey = async (provider: string, key: string) => {
    await devApi('put', `/ai/providers/${provider}/key`, { api_key: key });
    setKeyInput('');
    setKeyProvider('');
    const r = await devApi('get', '/ai/providers');
    setProviders(r.data.data || {});
  };

  const testKey = async (provider: string, key: string) => {
    setTesting(provider);
    try {
      const r = await devApi('post', '/ai/test-key', { provider, api_key: key });
      if (r.data.success) alert(`${providers[provider]?.name} connected! Response: "${r.data.data.response}"`);
      else alert(`Test failed: ${r.data.error?.message}`);
    } catch (err: any) { alert(`Test failed: ${err?.response?.data?.error?.message || err.message}`); }
    setTesting('');
  };

  const clearChat = () => setMessages([]);
  const currentProvider = providers[selectedProvider];
  const isConfigured = currentProvider?.configured;
  const isMgr = user && ['ceo', 'lead', 'product_owner'].includes(user.role);

  if (loading || !user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>;

  return (
    <DevPortalLayout user={user} title="AI Panel">
      <div className="flex h-[calc(100vh-7rem)] gap-0">

        {/* ── Left: Chat ── */}
        <div className="flex-1 flex flex-col bg-white rounded-l-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {(['chat', 'providers'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 text-2xs font-medium rounded-md capitalize ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{t}</button>
                ))}
              </div>
              {tab === 'chat' && (
                <>
                  <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs">
                    {Object.entries(providers).map(([id, p]: [string, any]) => (
                      <option key={id} value={id}>{p.icon} {p.name} {p.configured ? '✓' : '(no key)'}</option>
                    ))}
                  </select>
                  <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs">
                    {(currentProvider?.models || []).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </>
              )}
            </div>
            {tab === 'chat' && (
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                <span className="text-2xs text-gray-400">{isConfigured ? 'Connected' : 'No API key'}</span>
                {messages.length > 0 && <button onClick={clearChat} className="text-2xs text-gray-400 hover:text-red-500 ml-2">Clear</button>}
              </div>
            )}
          </div>

          {tab === 'chat' && (
            <>
              {/* Messages */}
              <div ref={chatRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4"><span className="text-3xl">🤖</span></div>
                    <h2 className="text-base font-bold text-gray-900">ACCA AI Assistant</h2>
                    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                      {isConfigured
                        ? `Connected to ${currentProvider?.name}. Ask anything about the ACCA project — architecture, code, German tax rules, or generate code.`
                        : 'No API key configured. Go to the Providers tab to add your key, or use this as a prompt builder.'}
                    </p>
                    {/* Quick prompts */}
                    <div className="grid grid-cols-2 gap-2 mt-6 max-w-lg mx-auto">
                      {[
                        'Explain the 4-layer data isolation architecture',
                        'Generate a new API endpoint for budget management',
                        'How does the invoicing status model work?',
                        'Write a migration for a notifications_preferences table',
                      ].map(q => (
                        <button key={q} onClick={() => { setInput(q); }} className="text-left px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-2xs text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs shrink-0">
                        {currentProvider?.icon || '🤖'}
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-50 border border-gray-200 text-gray-800'}`}>
                      <pre className={`text-sm whitespace-pre-wrap font-sans leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-gray-700'}`}>{msg.content}</pre>
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(user.display_name || user.name).charAt(0)}
                      </div>
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs shrink-0">{currentProvider?.icon || '🤖'}</div>
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                      <div className="flex gap-1"><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" /><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} /><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} /></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="px-5 py-4 border-t border-gray-100 shrink-0">
                <div className="flex gap-3">
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder={isConfigured ? `Ask ${currentProvider?.name}...` : 'Type your prompt (no API key — prompt builder mode)...'}
                    rows={2} className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
                  <div className="flex flex-col gap-1">
                    <button onClick={sendMessage} disabled={!input.trim() || sending || !isConfigured}
                      className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                      Send
                    </button>
                    {!isConfigured && input.trim() && (
                      <button onClick={() => { navigator.clipboard.writeText(input); }} className="px-3 py-1.5 text-2xs text-indigo-500 border border-indigo-200 rounded-lg hover:bg-indigo-50">Copy prompt</button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-2xs text-gray-400">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={useSystemPrompt} onChange={e => setUseSystemPrompt(e.target.checked)} className="rounded border-gray-300 text-indigo-600 w-3 h-3" />
                    ACCA context
                  </label>
                  <label className="flex items-center gap-1.5">
                    Temp: <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} className="w-16 h-1" /> {temperature}
                  </label>
                  <span>Shift+Enter for new line</span>
                </div>
              </div>
            </>
          )}

          {/* Providers Tab */}
          {tab === 'providers' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900">AI Providers</h2>
              <p className="text-xs text-gray-500">Add your API keys to enable live AI chat. Keys are stored securely in the database.</p>

              <div className="grid grid-cols-1 gap-3">
                {Object.entries(providers).map(([id, p]: [string, any]) => (
                  <div key={id} className={`border rounded-xl p-4 ${p.configured ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{p.icon}</span>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">{p.name}</h3>
                          <p className="text-2xs text-gray-400">{p.models?.length} models available</p>
                        </div>
                      </div>
                      <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${p.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.configured ? `✓ Connected (${p.keyPreview})` : 'Not configured'}
                      </span>
                    </div>

                    {/* Models */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(p.models || []).map((m: any) => (
                        <span key={m.id} className="text-2xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{m.name} ({Math.round(m.maxTokens / 1000)}K)</span>
                      ))}
                    </div>

                    {/* Key input */}
                    {isMgr && (
                      <div className="flex gap-2">
                        {keyProvider === id ? (
                          <>
                            <PasswordInput value={keyInput} onChange={setKeyInput}
                              placeholder={id === 'openai' ? 'sk-...' : id === 'anthropic' ? 'sk-ant-...' : 'API key...'}
                              autoComplete="off"
                              wrapperClassName="relative flex-1"
                              className="w-full pl-3 pr-10 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500/20" />
                            <button onClick={() => testKey(id, keyInput)} disabled={!keyInput || testing === id} className="px-3 py-1.5 text-2xs text-indigo-600 border border-indigo-200 rounded-lg font-medium hover:bg-indigo-50 disabled:opacity-50">
                              {testing === id ? 'Testing...' : 'Test'}
                            </button>
                            <button onClick={() => saveKey(id, keyInput)} disabled={!keyInput} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-2xs font-semibold rounded-lg">Save</button>
                            <button onClick={() => { setKeyProvider(''); setKeyInput(''); }} className="px-2 py-1.5 text-2xs text-gray-400">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setKeyProvider(id)} className="text-2xs text-indigo-600 hover:text-indigo-800 font-medium">
                            {p.configured ? 'Update key' : 'Add API key'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Where to get key */}
                    <div className="mt-2 text-2xs text-gray-400">
                      {id === 'openai' && <span>Get key: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" className="text-indigo-500 hover:underline">platform.openai.com/api-keys</a></span>}
                      {id === 'anthropic' && <span>Get key: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" className="text-indigo-500 hover:underline">console.anthropic.com</a></span>}
                      {id === 'deepseek' && <span>Get key: <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener" className="text-indigo-500 hover:underline">platform.deepseek.com</a></span>}
                      {id === 'kimi' && <span>Get key: <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noopener" className="text-indigo-500 hover:underline">platform.moonshot.cn</a></span>}
                      {id === 'grok' && <span>Get key: <a href="https://console.x.ai/" target="_blank" rel="noopener" className="text-indigo-500 hover:underline">console.x.ai</a> (free tier available)</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Env var alternative */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-2">Alternative: Environment Variables</h3>
                <p className="text-2xs text-gray-500 mb-2">You can also set keys via environment variables (takes priority over DB):</p>
                <div className="bg-gray-900 rounded-lg p-3">
                  <pre className="text-2xs text-gray-300 font-mono">{`OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
KIMI_API_KEY=sk-...
GROK_API_KEY=xai-...
GROQ_API_KEY=gsk-...  (free tier)`}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-64 shrink-0 bg-white rounded-r-2xl border border-gray-200 border-l-0 p-4 hidden lg:flex flex-col overflow-y-auto">
          <h3 className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Prompts</h3>
          <div className="space-y-1.5 flex-1">
            {[
              { cat: 'Architecture', prompts: ['How does the dev_portal_token auth work?', 'Explain RLS on dev_* tables', 'Describe the VibeStudio layers'] },
              { cat: 'Code Gen', prompts: ['Create a new /api/v1/dev-portal endpoint', 'Write a dev_* Knex migration (081)', 'Generate a DevPortalLayout page'] },
              { cat: 'Prompting', prompts: ['Improve this prompt for Claude', 'Add context for the board module', 'Compare two prompt variants'] },
              { cat: 'Debug', prompts: ['Why would a dev-portal route 401?', 'Common React hook mistakes', 'JWT token expired handling'] },
            ].map(cat => (
              <div key={cat.cat}>
                <p className="text-2xs text-gray-400 font-semibold mt-2 mb-1">{cat.cat}</p>
                {cat.prompts.map(q => (
                  <button key={q} onClick={() => setInput(q)} className="w-full text-left px-2 py-1.5 rounded-lg text-2xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-gray-100 mt-3 space-y-1.5">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">Providers</p>
            {Object.entries(providers).map(([id, p]: [string, any]) => (
              <div key={id} className="flex items-center gap-2 text-2xs">
                <span className={`w-2 h-2 rounded-full ${p.configured ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                <span className="text-gray-600">{p.icon} {p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DevPortalLayout>
  );
}
