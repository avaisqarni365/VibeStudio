/**
 * /dev-portal/experiments — Prompt A/B Lab (A3).
 *
 * Create an experiment with 2+ prompt variants, run each (live via an AI
 * provider, or record a manual result pasted from elsewhere), and compare
 * cost / latency / rating side-by-side to pick a winner. Backed by
 * dev_prompt_experiments + dev_prompt_variants; runs also log to
 * dev_prompt_history (so they show in usage + cost rollups).
 */
import { useState, useEffect } from 'react';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

const PROVIDERS = ['anthropic', 'openai', 'deepseek', 'moonshot', 'groq', 'ollama'];
const fmtUsd = (n: number) => '$' + (Number(n) || 0).toFixed(Number(n) < 1 ? 4 : 2);
const blankVariant = (label: string, model: string) => ({ label, provider: 'anthropic', model, prompt: '' });

export default function ExperimentsPage() {
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [projectId, setProjectId] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ name: string; hypothesis: string; variants: any[] }>({
    name: '', hypothesis: '', variants: [blankVariant('A', 'claude-opus-4-8'), blankVariant('B', 'claude-sonnet-4-6')],
  });
  const [runFor, setRunFor] = useState<string>('');           // variantId showing the manual-run form
  const [manual, setManual] = useState({ response: '', prompt_tokens: '', response_tokens: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!user) return;
    if (activeProjectId) { setProjectId(activeProjectId); }
    else devApi('get', '/projects').then(r => { if (r.data.data?.[0]) setProjectId(r.data.data[0].id); });
  }, [user, activeProjectId]);

  useEffect(() => { if (projectId) loadList(); /* eslint-disable-next-line */ }, [projectId]);

  const loadList = async () => {
    const r = await devApi('get', `/projects/${projectId}/experiments`);
    if (r.data?.success) setList(r.data.data);
  };
  const openExperiment = async (id: string) => {
    setRunFor(''); setMsg('');
    const r = await devApi('get', `/experiments/${id}`);
    if (r.data?.success) setSelected(r.data.data);
  };
  const createExperiment = async () => {
    if (!form.name.trim() || form.variants.filter(v => v.prompt.trim()).length < 2) { setMsg('Need a name and at least 2 variants with prompts.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await devApi('post', `/projects/${projectId}/experiments`, form);
      if (r.data?.success) {
        setShowCreate(false);
        setForm({ name: '', hypothesis: '', variants: [blankVariant('A', 'claude-opus-4-8'), blankVariant('B', 'claude-sonnet-4-6')] });
        await loadList();
        setSelected(r.data.data);
      }
    } catch (e: any) { setMsg(e?.response?.data?.error?.message || 'Create failed'); } finally { setBusy(false); }
  };
  const runLive = async (variantId: string) => {
    setBusy(true); setMsg('');
    try {
      const r = await devApi('post', `/experiments/${selected.id}/variants/${variantId}/run`, {});
      if (r.data?.success) { await openExperiment(selected.id); setMsg(`Ran ${fmtUsd(r.data.data.cost)} · ${r.data.data.duration_ms}ms`); }
    } catch (e: any) { setMsg(e?.response?.data?.error?.message || 'Run failed — add a provider key or record a manual result.'); } finally { setBusy(false); }
  };
  const submitManual = async (variantId: string) => {
    setBusy(true); setMsg('');
    try {
      await devApi('post', `/experiments/${selected.id}/variants/${variantId}/run`, {
        manual: { response: manual.response, prompt_tokens: Number(manual.prompt_tokens) || 0, response_tokens: Number(manual.response_tokens) || 0 },
      });
      setRunFor(''); setManual({ response: '', prompt_tokens: '', response_tokens: '' });
      await openExperiment(selected.id);
    } catch (e: any) { setMsg(e?.response?.data?.error?.message || 'Manual run failed'); } finally { setBusy(false); }
  };
  const rate = async (variantId: string, r: number) => { await devApi('post', `/variants/${variantId}/rate`, { rating: r }); await openExperiment(selected.id); };
  const decide = async (variantId: string) => { await devApi('post', `/experiments/${selected.id}/decide`, { variant_id: variantId }); await openExperiment(selected.id); await loadList(); };
  const remove = async (id: string) => { await devApi('delete', `/experiments/${id}`); if (selected?.id === id) setSelected(null); await loadList(); };

  const setVariant = (i: number, patch: any) => setForm(f => ({ ...f, variants: f.variants.map((v, j) => j === i ? { ...v, ...patch } : v) }));

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;

  // Best variant by avg rating (then lowest avg cost) — for a "leader" hint.
  const leader = selected?.variants?.length ? [...selected.variants].sort((a, b) =>
    (b.avg_rating || 0) - (a.avg_rating || 0) || (a.avg_cost || 1e9) - (b.avg_cost || 1e9))[0] : null;

  return (
    <DevPortalLayout user={user} title="Prompt A/B Lab">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🧪 Prompt A/B Lab</h1>
            <p className="text-xs text-gray-500 mt-0.5">Compare prompt variants by cost, latency, and rating. Run live (needs a provider key) or paste a manual result.</p>
          </div>
          <button onClick={() => setShowCreate(s => !s)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg">{showCreate ? 'Cancel' : '+ New experiment'}</button>
        </div>

        {msg && <p className="text-2xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{msg}</p>}

        {/* Create form */}
        {showCreate && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Experiment name" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <input value={form.hypothesis} onChange={e => setForm({ ...form, hypothesis: e.target.value })} placeholder="Hypothesis (optional)" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            {form.variants.map((v, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{v.label}</span>
                  <select value={v.provider} onChange={e => setVariant(i, { provider: e.target.value })} className="px-2 py-1 border border-gray-200 rounded-lg text-2xs">
                    {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input value={v.model} onChange={e => setVariant(i, { model: e.target.value })} placeholder="model id" className="px-2 py-1 border border-gray-200 rounded-lg text-2xs flex-1" />
                  {form.variants.length > 2 && <button onClick={() => setForm(f => ({ ...f, variants: f.variants.filter((_, j) => j !== i) }))} className="text-2xs text-rose-400 hover:text-rose-600">remove</button>}
                </div>
                <textarea value={v.prompt} onChange={e => setVariant(i, { prompt: e.target.value })} rows={3} placeholder={`Prompt for variant ${v.label}`} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono" />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button onClick={() => setForm(f => ({ ...f, variants: [...f.variants, blankVariant('ABCDEFGH'[f.variants.length] || `V${f.variants.length + 1}`, 'claude-opus-4-8')] }))} className="text-2xs text-indigo-600 hover:text-indigo-800">+ add variant</button>
              <button onClick={createExperiment} disabled={busy} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">Create experiment</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
          {/* List */}
          <div className="space-y-2">
            <p className="text-2xs uppercase tracking-wide text-gray-400">Experiments ({list.length})</p>
            {list.length === 0 && <p className="text-xs text-gray-400">None yet. Create one above.</p>}
            {list.map(e => (
              <button key={e.id} onClick={() => openExperiment(e.id)} className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${selected?.id === e.id ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800 truncate">{e.name}</span>
                  {e.status === 'decided' && <span className="text-2xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full shrink-0">decided</span>}
                </div>
                <p className="text-2xs text-gray-400 mt-0.5">{e.variant_count} variants · {e.total_runs} runs</p>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div>
            {!selected ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400">Select or create an experiment to compare variants.</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">{selected.name}</h2>
                    {selected.hypothesis && <p className="text-2xs text-gray-500 mt-0.5">Hypothesis: {selected.hypothesis}</p>}
                  </div>
                  <button onClick={() => remove(selected.id)} className="text-2xs text-gray-400 hover:text-rose-600 shrink-0">Delete</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selected.variants.map((v: any) => {
                    const isWinner = selected.winner_variant_id === v.id;
                    const isLeader = leader && leader.id === v.id && !selected.winner_variant_id;
                    return (
                      <div key={v.id} className={`bg-white border rounded-xl p-3 ${isWinner ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{v.label}</span>
                            {isWinner && <span className="text-2xs px-1.5 py-0.5 bg-emerald-500 text-white rounded-full">🏆 winner</span>}
                            {isLeader && <span className="text-2xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">leading</span>}
                          </span>
                          <span className="text-2xs font-mono text-gray-400">{v.provider || '—'} · {v.model || '—'}</span>
                        </div>
                        <pre className="text-2xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-2 whitespace-pre-wrap font-mono max-h-24 overflow-y-auto">{v.prompt}</pre>

                        <div className="grid grid-cols-4 gap-1 mt-2 text-center">
                          <Metric label="runs" value={v.runs} />
                          <Metric label="avg $" value={v.avg_cost != null ? fmtUsd(v.avg_cost) : '—'} />
                          <Metric label="avg ms" value={v.avg_duration_ms ?? '—'} />
                          <Metric label="avg tok" value={v.avg_tokens ?? '—'} />
                        </div>

                        {/* Rating */}
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-2xs text-gray-400">rate:</span>
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => rate(v.id, n)} className={`text-sm leading-none ${v.avg_rating && n <= Math.round(v.avg_rating) ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'}`}>★</button>
                          ))}
                          {v.avg_rating != null && <span className="text-2xs text-gray-400 ml-1">{v.avg_rating} ({v.rating_count})</span>}
                        </div>

                        {v.last_response && <p className="text-2xs text-gray-500 mt-2 border-t border-gray-100 pt-2 line-clamp-3" title={v.last_response}>↳ {v.last_response}</p>}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => runLive(v.id)} disabled={busy} className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-2xs font-semibold rounded-lg">▶ Run live</button>
                          <button onClick={() => { setRunFor(runFor === v.id ? '' : v.id); setManual({ response: '', prompt_tokens: '', response_tokens: '' }); }} className="px-2.5 py-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-2xs font-semibold rounded-lg">✎ Manual</button>
                          {selected.status !== 'decided' && <button onClick={() => decide(v.id)} className="px-2.5 py-1 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-2xs font-semibold rounded-lg ml-auto">Set winner</button>}
                        </div>

                        {runFor === v.id && (
                          <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                            <textarea value={manual.response} onChange={e => setManual({ ...manual, response: e.target.value })} rows={2} placeholder="Paste the model's response" className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-2xs" />
                            <div className="flex items-center gap-1.5">
                              <input value={manual.prompt_tokens} onChange={e => setManual({ ...manual, prompt_tokens: e.target.value })} placeholder="prompt tokens" className="w-full px-2 py-1 border border-gray-200 rounded-lg text-2xs" />
                              <input value={manual.response_tokens} onChange={e => setManual({ ...manual, response_tokens: e.target.value })} placeholder="response tokens" className="w-full px-2 py-1 border border-gray-200 rounded-lg text-2xs" />
                              <button onClick={() => submitManual(v.id)} disabled={busy} className="px-2.5 py-1 bg-gray-800 hover:bg-black disabled:opacity-50 text-white text-2xs font-semibold rounded-lg shrink-0">Record</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DevPortalLayout>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-gray-50 rounded-lg py-1">
      <p className="text-xs font-bold text-gray-800 tabular-nums">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}
