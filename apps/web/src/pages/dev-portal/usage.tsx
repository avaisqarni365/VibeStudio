/**
 * /dev-portal/usage — personal Claude / AI usage page.
 *
 * Shows everything the currently logged-in dev-team member has run
 * through the platform's AI providers — including dev-portal chat,
 * AI bookkeeping, tax advisor, voice agent, vendor learning, etc.
 *
 * Layout: top stat row → breakdowns grid (origin / provider / model /
 * device) → daily volume chart → recent-prompts table with row-click
 * detail modal.
 */
import { useState, useEffect, useMemo } from 'react';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';

type Range = 'today' | 'week' | 'month' | 'all';

interface Breakdown { count: string | number }
interface UsageData {
  me: { id: string; email: string; name: string; role: string };
  range: Range;
  totals: { total: number; prompt_tokens: number; response_tokens: number; total_duration_seconds: number; failed: number };
  breakdowns: {
    byOrigin: ({ ai_origin: string } & Breakdown)[];
    byProvider: ({ provider: string; in_tokens: number; out_tokens: number } & Breakdown)[];
    byModel: ({ model: string; in_tokens: number; out_tokens: number } & Breakdown)[];
    byDevice: ({ device_type: string; os: string; browser: string } & Breakdown)[];
  };
  daily: ({ day: string; in_tokens: number; out_tokens: number } & Breakdown)[];
  recent: Array<{
    id: string;
    title: string;
    ai_origin: string;
    provider: string;
    model: string;
    prompt_tokens: number;
    response_tokens: number;
    duration_seconds: number;
    status: string;
    device_type: string;
    os: string;
    browser: string;
    ip_address: string | null;
    actor_email: string | null;
    actor_role: string | null;
    actor_org_id: string | null;
    created_at: string;
  }>;
}

const ORIGIN_LABELS: Record<string, string> = {
  dev_portal_chat: 'Dev-Portal Chat',
  ai_bookkeeping: 'AI Bookkeeping',
  invoice_agent: 'Invoice Agent',
  tax_advisor: 'Tax Advisor',
  voice_agent: 'Voice Agent',
  vendor_learning: 'Vendor Learning',
  anomaly_detector: 'Anomaly Detector',
  ocr_classifier: 'OCR Classifier',
  review_engine: 'Review Engine',
  predictive_analysis: 'Predictive Analysis',
  other: 'Other',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-orange-500',
  openai: 'bg-emerald-500',
  deepseek: 'bg-blue-500',
  kimi: 'bg-indigo-500',
  grok: 'bg-amber-500',
  groq: 'bg-purple-500',
};

export default function DevPortalUsage() {
  const { user, loading, devApi } = useDevAuth();
  const [data, setData] = useState<UsageData | null>(null);
  const [range, setRange] = useState<Range>('all');
  const [originFilter, setOriginFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const fetchUsage = async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ range });
      if (originFilter) qs.set('origin', originFilter);
      if (providerFilter) qs.set('provider', providerFilter);
      const r = await devApi('get', `/me/usage?${qs.toString()}`);
      if (r.data?.success) setData(r.data.data);
    } catch (e) {
      console.warn('usage fetch failed', e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (user) fetchUsage(); /* eslint-disable-next-line */ }, [user, range, originFilter, providerFilter]);

  const openDetail = async (id: string) => {
    setDetailBusy(true);
    try {
      const r = await devApi('get', `/me/usage/${id}`);
      if (r.data?.success) setDetail(r.data.data);
    } catch (e: any) {
      setDetail({ error: e?.message || 'Failed to load' });
    } finally {
      setDetailBusy(false);
    }
  };

  const totalTokens = useMemo(() =>
    (data?.totals.prompt_tokens || 0) + (data?.totals.response_tokens || 0),
  [data]);

  // Max daily count for the simple bar chart scaling.
  const maxDaily = useMemo(() =>
    data?.daily?.length ? Math.max(...data.daily.map(d => Number(d.count))) : 1,
  [data]);

  if (loading || !user) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <DevPortalLayout user={user} title="My AI Usage">
      <div className="space-y-5">
        {/* Header + range pills */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">My AI usage</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Every Claude / OpenAI / DeepSeek / Kimi / Grok / Groq call you've made on the platform — dev-portal console + AI bookkeeping + everywhere else.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {(['today', 'week', 'month', 'all'] as Range[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  range === r ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {r === 'today' ? 'Today' : r === 'week' ? '7 days' : r === 'month' ? '30 days' : 'All time'}
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Total prompts" value={data?.totals.total ?? 0} accent="text-blue-700" />
          <Stat label="Prompt tokens" value={(data?.totals.prompt_tokens ?? 0).toLocaleString()} accent="text-emerald-700" />
          <Stat label="Response tokens" value={(data?.totals.response_tokens ?? 0).toLocaleString()} accent="text-indigo-700" />
          <Stat label="Total tokens" value={totalTokens.toLocaleString()} accent="text-gray-900" />
          <Stat label="Failed" value={data?.totals.failed ?? 0} accent={data?.totals.failed ? 'text-rose-700' : 'text-gray-400'} />
        </div>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <BreakdownCard
            title="By origin"
            rows={(data?.breakdowns.byOrigin || []).map(b => ({ key: b.ai_origin || 'other', label: ORIGIN_LABELS[b.ai_origin || 'other'] || b.ai_origin || '—', count: Number(b.count) }))}
            activeKey={originFilter}
            onClickRow={k => setOriginFilter(originFilter === k ? '' : k)}
          />
          <BreakdownCard
            title="By provider"
            rows={(data?.breakdowns.byProvider || []).map(b => ({
              key: b.provider || 'unknown',
              label: b.provider || '—',
              count: Number(b.count),
              dot: PROVIDER_COLORS[b.provider || ''] || 'bg-gray-300',
              subtitle: `${Number(b.in_tokens || 0).toLocaleString()} in / ${Number(b.out_tokens || 0).toLocaleString()} out`,
            }))}
            activeKey={providerFilter}
            onClickRow={k => setProviderFilter(providerFilter === k ? '' : k)}
          />
          <BreakdownCard
            title="By model"
            rows={(data?.breakdowns.byModel || []).slice(0, 8).map(b => ({
              key: b.model || 'unknown',
              label: b.model || '—',
              count: Number(b.count),
              subtitle: `${Number(b.in_tokens || 0).toLocaleString()} in / ${Number(b.out_tokens || 0).toLocaleString()} out`,
            }))}
          />
          <BreakdownCard
            title="By device"
            rows={(data?.breakdowns.byDevice || []).slice(0, 8).map(b => ({
              key: `${b.device_type}|${b.os}|${b.browser}`,
              label: [b.device_type, b.os, b.browser].filter(Boolean).join(' · ') || '—',
              count: Number(b.count),
            }))}
          />
        </div>

        {/* Daily volume chart (simple bars) */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-900">Daily volume</h3>
            <span className="text-2xs text-gray-400">{data?.daily?.length || 0} days</span>
          </div>
          {data?.daily?.length ? (
            <div className="flex items-end gap-1 h-32">
              {data.daily.map(d => {
                const c = Number(d.count);
                const pct = Math.max(2, Math.round((c / maxDaily) * 100));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${c} prompts (${Number(d.in_tokens || 0).toLocaleString()} + ${Number(d.out_tokens || 0).toLocaleString()} tokens)`}>
                    <div className="w-full bg-blue-500 rounded-t" style={{ height: `${pct}%` }} />
                    <span className="text-[9px] text-gray-400 truncate w-full text-center">{d.day.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-8 text-center">No usage in this period yet.</p>
          )}
        </div>

        {/* Active filters */}
        {(originFilter || providerFilter) && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Filtered by:</span>
            {originFilter && (
              <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full">
                origin: {ORIGIN_LABELS[originFilter] || originFilter}
                <button onClick={() => setOriginFilter('')} className="ml-1.5 text-blue-500 hover:text-blue-700">×</button>
              </span>
            )}
            {providerFilter && (
              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full">
                provider: {providerFilter}
                <button onClick={() => setProviderFilter('')} className="ml-1.5 text-emerald-500 hover:text-emerald-700">×</button>
              </span>
            )}
          </div>
        )}

        {/* Recent prompts table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold text-gray-900">Recent prompts</h3>
            <span className="text-2xs text-gray-400">{data?.recent?.length || 0} rows {busy && '· loading…'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-2xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">When</th>
                  <th className="text-left px-3 py-2 font-medium">Title</th>
                  <th className="text-left px-3 py-2 font-medium">Origin</th>
                  <th className="text-left px-3 py-2 font-medium">Provider · Model</th>
                  <th className="text-right px-3 py-2 font-medium">Tokens</th>
                  <th className="text-right px-3 py-2 font-medium">Time</th>
                  <th className="text-left px-3 py-2 font-medium">From</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.recent || []).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(r.id)}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-900 max-w-md truncate">{r.title}</td>
                    <td className="px-3 py-2 text-gray-600">{ORIGIN_LABELS[r.ai_origin || 'other'] || r.ai_origin || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[r.provider || ''] || 'bg-gray-300'}`} />
                        <span>{r.provider || '—'}</span>
                        <span className="text-gray-400">·</span>
                        <span className="font-mono text-2xs">{r.model || '—'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                      {Number(r.prompt_tokens || 0).toLocaleString()}<span className="text-gray-400"> / </span>{Number(r.response_tokens || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{r.duration_seconds ? `${r.duration_seconds}s` : '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-2xs">
                      {[r.device_type, r.os, r.browser].filter(Boolean).join(' · ') || r.ip_address || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'failed' ? (
                        <span className="text-rose-600 text-2xs">✗</span>
                      ) : (
                        <span className="text-blue-500 text-2xs">→</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(data?.recent || []).length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">No prompts in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-2xs text-gray-400">
          Tip: click a row to see the full prompt + response summary. Filters apply to the totals, breakdowns, chart, and table together.
        </p>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 sticky top-0 bg-white flex items-baseline justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{detail.title || 'Prompt detail'}</h2>
                <p className="text-2xs text-gray-500 mt-0.5">
                  {detail.created_at && new Date(detail.created_at).toLocaleString()} · {detail.provider || '—'} · {detail.model || '—'} · {detail.prompt_tokens || 0}+{detail.response_tokens || 0} tokens · {detail.duration_seconds || 0}s
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700 text-sm">×</button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              {detail.error ? (
                <p className="text-rose-600">{detail.error}</p>
              ) : detailBusy ? (
                <p className="text-gray-400">Loading…</p>
              ) : (
                <>
                  <Section title="Prompt">
                    <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap font-mono">{detail.prompt}</pre>
                  </Section>
                  {detail.response_summary && (
                    <Section title="Response (first 1000 chars)">
                      <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap font-mono">{detail.response_summary}</pre>
                    </Section>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <KV label="Origin" value={ORIGIN_LABELS[detail.ai_origin || 'other'] || detail.ai_origin || '—'} />
                    <KV label="Status" value={detail.status || '—'} />
                    <KV label="Device" value={[detail.device_type, detail.os, detail.browser].filter(Boolean).join(' · ') || '—'} />
                    <KV label="IP" value={detail.ip_address || '—'} />
                    <KV label="Actor email" value={detail.actor_email || '—'} />
                    <KV label="Actor role" value={detail.actor_role || '—'} />
                  </div>
                  {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                    <Section title="Metadata">
                      <pre className="text-2xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto">{JSON.stringify(detail.metadata, null, 2)}</pre>
                    </Section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DevPortalLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-2xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function BreakdownCard({
  title, rows, activeKey, onClickRow,
}: {
  title: string;
  rows: { key: string; label: string; count: number; dot?: string; subtitle?: string }[];
  activeKey?: string;
  onClickRow?: (k: string) => void;
}) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-2xs uppercase tracking-wide text-gray-500 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-2xs text-gray-400 py-3">—</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(r => {
            const pct = Math.round((r.count / max) * 100);
            const interactive = !!onClickRow;
            const active = activeKey === r.key;
            return (
              <li key={r.key}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => onClickRow?.(r.key)}
                  className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${
                    active ? 'bg-blue-50 ring-1 ring-blue-200' : interactive ? 'hover:bg-gray-50' : 'cursor-default'
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-gray-700 truncate">
                      {r.dot && <span className={`w-2 h-2 rounded-full ${r.dot} shrink-0`} />}
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="text-2xs text-gray-500 tabular-nums shrink-0">{r.count}</span>
                  </div>
                  <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                  {r.subtitle && <p className="text-2xs text-gray-400 mt-0.5">{r.subtitle}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-gray-500 mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xs text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}
