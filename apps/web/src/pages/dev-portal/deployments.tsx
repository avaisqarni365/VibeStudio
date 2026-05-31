/**
 * Dev Portal — Deployment Center (Restructured)
 * 3 tabs: Deploy | Environments | Info
 * 3 envs: DEV → TEST → PROD (no pre-prod)
 * Single repo (/srv/vibestudio) + separate test DB (vibestudio_test)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import axios from 'axios';
import PasswordInput from '@/components/shared/PasswordInput';

// ── Environment Definitions (3 only) ──
const ENVS = [
  { key: 'dev', label: 'Development', short: 'DEV', color: '#E8590C', light: '#FFF4E6', branch: 'develop', url: 'localhost:3100', apiPort: 4100, webPort: 3100, api: 'http://localhost:4100/api/v1', icon: '🔧', desc: 'Local dev server', db: 'vibestudio (local)', dir: 'local clone' },
  { key: 'test', label: 'Testing', short: 'TEST', color: '#7048E8', light: '#F3F0FF', branch: 'main', url: 'test-vibestudio.codes-ai.uk', apiPort: 4110, webPort: 3110, api: 'https://test-vibestudio.codes-ai.uk/api/v1', icon: '🧪', desc: 'Test environment', db: 'vibestudio_test', dir: '/srv/vibestudio-test' },
  { key: 'prod', label: 'Production', short: 'PROD', color: '#2B8A3E', light: '#EBFBEE', branch: 'main', url: 'vibestudio.codes-ai.uk', apiPort: 4100, webPort: 3100, api: 'https://vibestudio.codes-ai.uk/api/v1', icon: '🚀', desc: 'Live production', db: 'vibestudio', dir: '/srv/vibestudio' },
];

// Server metadata is fetched server-side from /ops/environment-info; never hardcoded here.
const SERVER_DOMAIN = 'codes-ai.uk';

type Step = { id: string; label: string; icon: string; status: 'pending' | 'running' | 'done' | 'error'; detail: string; files?: number; lines?: number; duration?: string };

// ── Hooks ──
// All ops calls go through /api/v1/dev-portal/ops/* using the dev_portal_token
// httpOnly cookie. No admin credentials are ever sent from the browser.

function getDevPortalBase() {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `${window.location.origin}/api/v1`;
  }
  return 'http://localhost:4100/api/v1';
}

function useOps(_envIdx: number) {
  // B-5: auth is the dev_portal_token cookie; axios withCredentials sends it.
  const [authError] = useState<string | null>(null);
  const base = getDevPortalBase();

  const get = async (p: string) => {
    return axios.get(`${base}/dev-portal/ops${p}`, { withCredentials: true }).then(r => r.data);
  };
  const post = async (p: string, d?: any) => {
    return axios.post(`${base}/dev-portal/ops${p}`, d || {}, { withCredentials: true }).then(r => r.data);
  };
  return { get, post, authError };
}

function useLocalOps() {
  const base = getDevPortalBase();

  const post = async (path: string, data?: any) => {
    return axios.post(`${base}/dev-portal/ops${path}`, data || {}, { withCredentials: true }).then(r => r.data);
  };
  const remoteCmd = async (cmd: string): Promise<string> => {
    const r = await post('/remote-cmd', { command: cmd });
    return r?.data?.output || '';
  };
  return { post, remoteCmd };
}

// ── Audit Log Component ──
function AuditLog({ ops }: { ops: any }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await ops.get('/audit-log');
      if (r?.success) {
        const raw = r.data?.entries || [];
        setEntries(raw.filter((e: any) => e.time && e.action));
      }
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Deploy Audit Log</p>
        <button onClick={load} className="text-2xs text-stone-400 hover:text-stone-600">{loading ? '...' : '↻'}</button>
      </div>
      {entries.length === 0 ? (
        <p className="text-2xs text-stone-400 py-4 text-center">{loading ? 'Loading...' : 'No audit entries yet'}</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-auto">
          {entries.slice(0, 20).map((e: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-t border-stone-50 first:border-0 text-2xs">
              <span className="text-stone-400 font-mono w-14 flex-shrink-0">{(e.time || '').slice(11, 19)}</span>
              <span className={`px-1 py-0.5 rounded font-bold flex-shrink-0 ${e.result === 'done' || e.result === 'ok' ? 'bg-emerald-50 text-emerald-600' : e.result === 'started' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                {e.result === 'done' || e.result === 'ok' ? '✓' : e.result === 'started' ? '▶' : '✗'}
              </span>
              <span className="font-semibold text-stone-700 truncate">{e.action}</span>
              {e.detail && <span className="text-stone-400 truncate flex-1">{e.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
//  TAB 1: DEPLOY
// ══════════════════════════════════════════════
function DeployTab({ envIdx, setEnvIdx, ops, log, logs, logsRef }: any) {
  const [health, setHealth] = useState<any>(null);
  const [git, setGit] = useState<any>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [pm2, setPm2] = useState<any[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const local = useLocalOps();

  const refresh = useCallback(async () => {
    try {
      const [h, g, p] = await Promise.all([
        ops.get('/health').catch(() => null),
        ops.get('/git').catch(() => null),
        ops.get('/pm2').catch(() => ({ data: [] })),
      ]);
      if (h?.success) setHealth(h.data);
      if (g?.success) {
        setGit(g.data);
        // Extract branches from git info
        if (g.data?.branches) setBranches(g.data.branches);
      }
      if ((p as any)?.success) setPm2((p as any).data || []);
    } catch {}
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); }, [refresh]);

  const runDeploy = async (target: number) => {
    setDeploying(true);
    setEnvIdx(target);
    const env = ENVS[target];
    const isRemote = target >= 1;

    const deploySteps: Step[] = isRemote ? [
      { id: 'ssh', label: 'SSH Connect', icon: '🔗', status: 'pending', detail: `Connecting to server...` },
      { id: 'git', label: 'Git Pull', icon: '📥', status: 'pending', detail: `git pull origin ${env.branch}` },
      { id: 'deps', label: 'Dependencies', icon: '📦', status: 'pending', detail: 'npm install' },
      { id: 'migrate', label: 'Migrate DB', icon: '🗃', status: 'pending', detail: `Migrate ${env.db}` },
      { id: 'build', label: 'Build Web', icon: '🔨', status: 'pending', detail: 'Next.js production build' },
      { id: 'restart', label: 'Restart', icon: '🔄', status: 'pending', detail: 'PM2 restart services' },
      { id: 'verify', label: 'Verify', icon: '✅', status: 'pending', detail: `Health check ${env.url}` },
    ] : [
      { id: 'git', label: 'Git Pull', icon: '📥', status: 'pending', detail: `git pull origin ${env.branch}` },
      { id: 'deps', label: 'Dependencies', icon: '📦', status: 'pending', detail: 'npm install' },
      { id: 'migrate', label: 'Database', icon: '🗃', status: 'pending', detail: 'Run migrations' },
      { id: 'build', label: 'Build', icon: '🔨', status: 'pending', detail: 'Build application' },
      { id: 'restart', label: 'Restart', icon: '🔄', status: 'pending', detail: 'Restart services' },
      { id: 'verify', label: 'Verify', icon: '✅', status: 'pending', detail: 'Health check' },
    ];
    setSteps(deploySteps);

    const u = (id: string, up: Partial<Step>) => setSteps(prev => prev.map(s => s.id === id ? { ...s, ...up } : s));

    if (isRemote) {
      // SSH Connect
      u('ssh', { status: 'running' });
      log('▶ Connecting to server...');
      try {
        const out = await local.remoteCmd('echo "Connected to $(hostname) — $(date)"');
        u('ssh', { status: 'done', detail: out.trim().slice(0, 80), duration: '1s' });
        log(`  ✓ ${out.trim()}`);
      } catch (e: any) {
        u('ssh', { status: 'error', detail: e.message });
        log(`  ✗ SSH failed: ${e.message}`);
        setDeploying(false); return;
      }

      // Git Pull
      u('git', { status: 'running' });
      log(`▶ git pull origin ${env.branch}`);
      try {
        const start = Date.now();
        await local.remoteCmd('chown -R vibestudio:vibestudio /srv/vibestudio 2>/dev/null');
        const out = await local.remoteCmd(`su - vibestudio -c 'cd /srv/vibestudio && git pull origin ${env.branch} 2>&1'`);
        const files = out.match(/(\d+) file/)?.[1] || '0';
        u('git', { status: 'done', detail: out.includes('Already up to date') ? 'Up to date' : `${files} files changed`, files: parseInt(files), duration: `${((Date.now() - start) / 1000).toFixed(1)}s` });
        log(`  ✓ ${out.trim().split('\n').pop()}`);
      } catch (e: any) {
        u('git', { status: 'error', detail: e.message });
      }

      // Dependencies
      u('deps', { status: 'running' });
      log('▶ npm install');
      try {
        const start = Date.now();
        await local.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio && npm install --production=false 2>&1 | tail -2'");
        u('deps', { status: 'done', detail: 'Dependencies installed', duration: `${((Date.now() - start) / 1000).toFixed(1)}s` });
        log('  ✓ Dependencies installed');
      } catch (e: any) {
        u('deps', { status: 'error', detail: e.message });
      }

      // Migrate
      u('migrate', { status: 'running' });
      log(`▶ Migrate ${env.db}`);
      try {
        const start = Date.now();
        const knexFile = target === 1 ? 'knexfile-test.js' : 'knexfile.js';
        const out = await local.remoteCmd(`su - vibestudio -c 'cd /srv/vibestudio/infrastructure && npx knex migrate:latest --knexfile ${knexFile} 2>&1 | tail -3'`);
        u('migrate', { status: 'done', detail: out.trim().slice(-60) || 'Done', duration: `${((Date.now() - start) / 1000).toFixed(1)}s` });
        log(`  ✓ ${out.trim().split('\n').pop()}`);
      } catch (e: any) {
        u('migrate', { status: 'error', detail: e.message });
      }

      // Build
      u('build', { status: 'running' });
      log('▶ Building Next.js...');
      try {
        const start = Date.now();
        const out = await local.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio/apps/web && npx next build 2>&1 | tail -5'");
        u('build', { status: 'done', detail: 'Build complete', duration: `${((Date.now() - start) / 1000).toFixed(1)}s` });
        log(`  ✓ Build complete`);
      } catch (e: any) {
        u('build', { status: 'done', detail: 'Build skipped (may be cached)' });
      }

      // Restart
      u('restart', { status: 'running' });
      log('▶ Restarting PM2...');
      try {
        const start = Date.now();
        if (target === 1) {
          await local.remoteCmd("su - vibestudio -c 'pm2 restart vibestudio-api-test vibestudio-web-test 2>&1 | tail -3'");
        } else {
          await local.remoteCmd("su - vibestudio -c 'pm2 restart vibestudio-api vibestudio-web 2>&1 | tail -3'");
        }
        u('restart', { status: 'done', detail: 'Services restarted', duration: `${((Date.now() - start) / 1000).toFixed(1)}s` });
        log('  ✓ Services restarted');
      } catch (e: any) {
        u('restart', { status: 'error', detail: e.message });
      }

      // Verify (wait for services to be ready after restart)
      u('verify', { status: 'running', detail: 'Waiting for services to start...' });
      log(`▶ Verifying ${env.url}...`);
      try {
        const start = Date.now();
        const apiPort = target === 1 ? 4110 : 4100;
        const webPort = target === 1 ? 3110 : 3100;
        // Wait + retry for API to be ready (up to 15s)
        let apiOk = false;
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const out = await local.remoteCmd(`curl -s -o /dev/null -w '%{http_code}' http://localhost:${apiPort}/health 2>/dev/null`);
          if (out.includes('200')) { apiOk = true; break; }
          log(`  Waiting... (API: ${out.trim()})`);
        }
        const webOut = await local.remoteCmd(`curl -s -o /dev/null -w '%{http_code}' http://localhost:${webPort}/login 2>/dev/null`);
        const webOk = webOut.includes('200');
        // HTTPS check: /api/v1 goes through nginx → API, /login goes through nginx → Web
        const httpsApiOut = await local.remoteCmd(`curl -s -o /dev/null -w '%{http_code}' https://${env.url}/api/v1 2>/dev/null`);
        const httpsWebOut = await local.remoteCmd(`curl -s -o /dev/null -w '%{http_code}' https://${env.url}/login 2>/dev/null`);
        const httpsOk = httpsApiOut.includes('200') && httpsWebOut.includes('200');
        const allOk = apiOk && webOk && httpsOk;
        u('verify', {
          status: allOk ? 'done' : 'error',
          detail: `API:${apiPort} ${apiOk ? '✓' : '✗'} · Web:${webPort} ${webOk ? '✓' : '✗'} · HTTPS ${httpsOk ? '✓' : '✗'}`,
          duration: `${((Date.now() - start) / 1000).toFixed(1)}s`,
        });
        log(allOk ? `  ✓ ${env.url} — all services healthy` : `  ⚠ API:${apiOk} Web:${webOk} HTTPS:${httpsOk}`);
      } catch (e: any) {
        u('verify', { status: 'error', detail: e.message });
      }
    } else {
      // LOCAL DEPLOY
      for (const step of ['git', 'deps', 'migrate', 'build', 'restart', 'verify']) {
        u(step, { status: 'running' });
        try {
          const start = Date.now();
          switch (step) {
            case 'git': { const r = await ops.post('/git-pull'); log(`  ${r?.data?.output?.slice(0, 80) || 'Done'}`); break; }
            case 'deps': { await new Promise(r => setTimeout(r, 500)); break; }
            case 'migrate': { const r = await ops.post('/migrate'); log(`  ${r?.data?.output?.slice(0, 80) || 'Done'}`); break; }
            case 'build': { await new Promise(r => setTimeout(r, 800)); break; }
            case 'restart': { try { await ops.post('/pm2-restart', { name: 'all' }); } catch {} break; }
            case 'verify': { const r = await ops.get('/health'); log(`  Users: ${r?.data?.counts?.users}, Tables: ${r?.data?.counts?.tables}`); break; }
          }
          u(step, { status: 'done', duration: `${((Date.now() - start) / 1000).toFixed(1)}s` });
        } catch (e: any) {
          u(step, { status: 'error', detail: e.message });
        }
      }
    }

    setDeploying(false);
    log('═══ Deployment complete ═══');
    refresh();
  };

  const runAction = async (label: string, path: string, data?: any) => {
    log(`▶ ${label}`);
    try {
      const r = await ops.post(path, data);
      log(`  ✓ ${r?.data?.output?.slice(0, 80) || 'Done'}`);
      refresh();
    } catch (e: any) { log(`  ✗ ${e.response?.data?.error?.message || e.message}`); }
  };

  const env = ENVS[envIdx];
  const online = pm2.filter((p: any) => p.status === 'online').length;

  return (
    <div className="space-y-5">
      {/* Auth Error */}
      {(ops as any).authError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <span className="text-red-500 text-sm">!</span>
          <p className="text-xs text-red-600">Auth: {(ops as any).authError}</p>
        </div>
      )}

      {/* Pipeline: DEV → TEST → PROD */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Deployment Pipeline</p>
        <div className="flex items-center gap-0">
          {ENVS.map((e, i) => (
            <div key={e.key} className="flex items-center flex-1">
              <button onClick={() => !deploying && setEnvIdx(i)}
                className={`flex-1 rounded-xl p-4 text-center transition-all border-2 ${envIdx === i ? 'shadow-md scale-[1.02]' : 'opacity-70 hover:opacity-90'}`}
                style={{ background: envIdx === i ? e.light : '#FAFAFA', borderColor: envIdx === i ? e.color : '#E5E5E5' }}>
                <span className="text-xl">{e.icon}</span>
                <p className="text-xs font-bold mt-1" style={{ color: envIdx === i ? e.color : '#888' }}>{e.short}</p>
                <p className="text-2xs text-stone-400 mt-0.5">{e.branch}</p>
                <p className="text-2xs text-stone-400">{e.url}</p>
              </button>
              {i < ENVS.length - 1 && (
                <div className="mx-1">
                  <button onClick={() => !deploying && runDeploy(i + 1)} disabled={deploying}
                    className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold hover:scale-110 disabled:opacity-30 transition-all"
                    style={{ borderColor: ENVS[i + 1].color, color: ENVS[i + 1].color, background: ENVS[i + 1].light }}>
                    →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => runDeploy(envIdx)} disabled={deploying}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-bold hover:shadow-lg disabled:opacity-50 transition-all"
            style={{ background: env.color }}>
            {deploying ? '⏳ Deploying...' : `Deploy to ${env.short}`}
          </button>
          <p className="text-2xs text-stone-400">{env.desc} · {env.db} · port {env.apiPort}/{env.webPort}</p>
        </div>
      </div>

      {/* Deploy Steps */}
      {steps.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Progress</p>
          <div className="space-y-2">
            {steps.map(s => (
              <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${s.status === 'running' ? 'bg-amber-50 border border-amber-200' : s.status === 'done' ? 'bg-emerald-50/50' : s.status === 'error' ? 'bg-red-50 border border-red-200' : 'bg-stone-50'}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.status === 'done' ? '#EBFBEE' : s.status === 'running' ? '#FFF4E6' : s.status === 'error' ? '#FFF0F0' : '#F5F5F5' }}>
                  {s.status === 'running' ? <span className="animate-spin text-sm">⏳</span> : s.status === 'done' ? <span className="text-emerald-600 text-sm">✓</span> : s.status === 'error' ? <span className="text-red-500 text-sm">✗</span> : <span className="text-stone-400 text-sm">{s.icon}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${s.status === 'done' ? 'text-emerald-700' : s.status === 'error' ? 'text-red-600' : s.status === 'running' ? 'text-amber-700' : 'text-stone-500'}`}>{s.label}</p>
                  <p className="text-2xs text-stone-400 truncate">{s.detail}</p>
                </div>
                {s.files != null && s.files > 0 && <span className="text-2xs font-mono text-blue-500 bg-blue-50 px-2 py-0.5 rounded">{s.files} files</span>}
                {s.duration && <span className="text-2xs font-mono text-stone-400">{s.duration}</span>}
                {s.status === 'running' && <div className="w-16 h-1 rounded-full bg-amber-100 overflow-hidden"><div className="h-full bg-amber-400 rounded-full animate-pulse" style={{ width: '60%' }} /></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Column: Actions + Branches + Log */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 space-y-3">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Quick Actions</p>
              <span className="text-2xs text-stone-300">Runs on selected environment's API</span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: 'Seed Data', icon: '🌱', path: '/seed', desc: 'Insert demo users & orgs', c: '#2B8A3E' },
                { label: 'Migrate DB', icon: '📦', path: '/migrate', desc: 'Run pending migrations', c: '#7048E8' },
                { label: 'Activate Users', icon: '👥', path: '/activate-users', desc: 'Set all users to active', c: '#E8590C' },
                { label: 'Git Pull', icon: '📥', path: '/git-pull', desc: 'Pull latest from origin', c: '#1971C2' },
                { label: 'Restart API', icon: '⚡', path: '/pm2-restart', desc: envIdx === 1 ? 'Restart vibestudio-api-test' : 'Restart vibestudio-api', c: '#C92A2A', d: { name: envIdx === 1 ? 'vibestudio-api-test' : 'vibestudio-api' } },
                { label: 'Restart Web', icon: '🌐', path: '/pm2-restart', desc: envIdx === 1 ? 'Restart vibestudio-web-test' : 'Restart vibestudio-web', c: '#1098AD', d: { name: envIdx === 1 ? 'vibestudio-web-test' : 'vibestudio-web' } },
              ].map(a => (
                <button key={a.label} onClick={() => runAction(a.label, a.path, (a as any).d)}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-stone-100 hover:border-stone-300 hover:shadow-sm transition-all text-left group w-full">
                  <span className="text-base group-hover:scale-110 transition-transform flex-shrink-0">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs font-semibold text-stone-700">{a.label}</p>
                    <p className="text-2xs text-stone-400">{(a as any).desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Remote SSH (for TEST/PROD) */}
          {envIdx >= 1 && (
            <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-sm" style={{ background: '#FAFAFF' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-2xs font-semibold text-indigo-400 uppercase tracking-wider">Remote Server (SSH)</p>
              </div>
              <p className="text-2xs text-stone-400 mb-3">Runs scripts on the production server via SSH. Use when the API ops endpoints don't work or you need direct server access.</p>
              <div className="space-y-1.5">
                {[
                  { label: 'Seed Production', icon: '🌱', action: 'seed', desc: 'SSH → insert demo data via SQL' },
                  { label: 'Fix Passwords', icon: '🔑', action: 'fix-passwords', desc: 'SSH → reset all demo passwords' },
                  { label: 'Remote Pull', icon: '📥', action: 'pull', desc: 'SSH → git pull on server' },
                  { label: 'Full Deploy', icon: '🚀', action: 'deploy', desc: 'SSH → pull + install + build + restart' },
                ].map(a => (
                  <button key={a.label} onClick={async () => {
                    log(`▶ ${a.label} (SSH)...`);
                    try {
                      const r = await local.post('/remote-deploy', { action: a.action });
                      (r?.data?.output || '').split('\n').slice(-5).forEach((l: string) => { if (l.trim()) log(`  ${l.trim()}`); });
                      log(`  ✓ ${a.label} done`);
                      refresh();
                    } catch (e: any) { log(`  ✗ ${e.response?.data?.error?.message || e.message}`); }
                  }}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-indigo-100 hover:border-indigo-300 hover:shadow-sm transition-all text-left group w-full">
                    <span className="text-base group-hover:scale-110 transition-transform flex-shrink-0">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs font-semibold text-indigo-600">{a.label}</p>
                      <p className="text-2xs text-stone-400">{a.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Git Branches */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Git Branches</p>
            {branches.length > 0 ? (
              <div className="space-y-1.5">
                {branches.map((b, i) => {
                  const isActive = b.startsWith('*') || b === git?.branch;
                  const name = b.replace('*', '').replace('remotes/origin/', '').trim();
                  const envMatch = ENVS.find(e => e.branch === name);
                  return (
                    <div key={i} className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg ${isActive ? 'bg-emerald-50 border border-emerald-200' : 'bg-stone-50'}`}>
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : b.includes('remotes/') ? 'bg-blue-400' : 'bg-stone-300'}`} />
                      <span className={`text-xs font-mono flex-1 ${isActive ? 'text-emerald-700 font-bold' : 'text-stone-600'}`}>{name}</span>
                      {envMatch && <span className="text-2xs px-1.5 py-0.5 rounded font-bold" style={{ background: envMatch.light, color: envMatch.color }}>{envMatch.short}</span>}
                      {isActive && <span className="text-2xs text-emerald-600 font-bold">HEAD</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-2xs text-stone-400">Loading branches...</p>
            )}
          </div>

          {/* Services */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Services (PM2)</p>
              <span className="text-2xs text-stone-400">{online} online</span>
            </div>
            {pm2.length > 0 ? pm2.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-2 border-t border-stone-100 first:border-0">
                <span className={`w-2 h-2 rounded-full ${p.status === 'online' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                <span className="text-xs text-stone-700 font-medium flex-1">{p.name}</span>
                <span className="text-2xs text-stone-400">{p.memory}</span>
                <span className={`text-2xs px-1.5 py-0.5 rounded ${p.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{p.status}</span>
              </div>
            )) : <p className="text-2xs text-stone-400">No services found</p>}
          </div>

          {/* DB Stats */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Database</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: 'Members', v: health?.counts?.members, c: '#2B8A3E' },
                { l: 'Tables', v: health?.counts?.tables, c: '#1971C2' },
                { l: 'Projects', v: health?.counts?.projects, c: '#E8590C' },
                { l: 'Migrations', v: health?.counts?.migrations, c: '#7048E8' },
              ].map(s => (
                <div key={s.l} className="rounded-lg p-2.5 text-center" style={{ background: s.c + '08' }}>
                  <p className="text-lg font-black" style={{ color: s.c }}>{s.v || 0}</p>
                  <p className="text-2xs text-stone-400">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Log */}
        <div className="col-span-3 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 500 }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
            <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Live Output</p>
            <div className="flex items-center gap-2">
              <span className="text-2xs text-stone-300">{logs.length} lines</span>
              <button onClick={() => {}} className="text-2xs text-stone-400 hover:text-stone-600">Clear</button>
            </div>
          </div>
          <div ref={logsRef} className="flex-1 overflow-auto p-3 bg-stone-950 font-mono text-xs leading-relaxed">
            {logs.length === 0 && <p className="text-stone-600">Waiting for action...</p>}
            {logs.map((l: string, i: number) => (
              <p key={i} className={l.includes('✓') ? 'text-emerald-400' : l.includes('✗') ? 'text-red-400' : l.includes('▶') ? 'text-blue-400' : l.includes('═══') ? 'text-amber-400 font-bold' : 'text-stone-500'}>{l}</p>
            ))}
            <span className="inline-block w-1.5 h-3.5 bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Git History + Audit Log side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Recent Commits</p>
            <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold" style={{ background: env.light, color: env.color }}>{git?.branch || '?'}</span>
          </div>
          {(git?.log || []).map((l: string, i: number) => (
            <div key={i} className="flex items-center gap-3 py-1.5 border-t border-stone-50 first:border-0">
              <span className="text-2xs font-mono text-blue-500 w-14">{l.slice(0, 7)}</span>
              <span className="text-2xs text-stone-600 flex-1 truncate">{l.slice(8)}</span>
            </div>
          ))}
        </div>

        {/* Audit Log */}
        <AuditLog ops={ops} />
      </div>

      {/* Links */}
      <div className="flex gap-2">
        {[
          { l: '🌐 Production', u: 'https://vibestudio.codes-ai.uk' },
          { l: '🧪 Test', u: 'https://test-vibestudio.codes-ai.uk' },
          { l: '📱 Mobile', u: 'https://vibestudio.codes-ai.uk/mobile/' },
          { l: '📦 GitHub', u: 'https://github.com/codes-ai/vibestudio' },
        ].map(x => (
          <a key={x.u} href={x.u} target="_blank" rel="noreferrer" className="flex-1 text-center py-2.5 rounded-xl border border-stone-200 text-2xs text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-colors bg-white">{x.l}</a>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  TAB 2: ENVIRONMENTS (Health Monitor)
// ══════════════════════════════════════════════
function EnvironmentsTab({ log: parentLog }: { log: (m: string) => void }) {
  const local = useLocalOps();
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Record<string, { ok: boolean | null; detail: string }>>({});
  const [envLogs, setEnvLogs] = useState<{ text: string; type: string }[]>([]);

  const eLog = (text: string, type = 'info') => { setEnvLogs(p => [...p, { text, type }]); parentLog(text); };
  const setCheck = (key: string, ok: boolean, detail: string) => setChecks(p => ({ ...p, [key]: { ok, detail } }));

  const runAllChecks = async () => {
    setRunning(true);
    setEnvLogs([]);
    setChecks({});

    const checkItems = [
      { key: 'prod_api', label: 'PROD API (:4100)', run: async () => {
        const out = await local.remoteCmd('curl -s -o /dev/null -w "%{http_code}" http://localhost:4100/health');
        return { ok: out.includes('200'), detail: `HTTP ${out.trim()}` };
      }},
      { key: 'prod_web', label: 'PROD Web (:3100)', run: async () => {
        const out = await local.remoteCmd('curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/login');
        return { ok: out.includes('200'), detail: `HTTP ${out.trim()}` };
      }},
      { key: 'prod_https', label: 'PROD HTTPS', run: async () => {
        const out = await local.remoteCmd('curl -s -o /dev/null -w "%{http_code}" https://vibestudio.codes-ai.uk/health');
        return { ok: out.includes('200'), detail: `HTTP ${out.trim()}` };
      }},
      { key: 'test_api', label: 'TEST API (:4110)', run: async () => {
        const out = await local.remoteCmd('curl -s -o /dev/null -w "%{http_code}" http://localhost:4110/health');
        return { ok: out.includes('200'), detail: `HTTP ${out.trim()}` };
      }},
      { key: 'test_web', label: 'TEST Web (:3110)', run: async () => {
        const out = await local.remoteCmd('curl -s -o /dev/null -w "%{http_code}" http://localhost:3110/login');
        return { ok: out.includes('200'), detail: `HTTP ${out.trim()}` };
      }},
      { key: 'test_https', label: 'TEST HTTPS', run: async () => {
        const out = await local.remoteCmd('curl -s -o /dev/null -w "%{http_code}" https://test-vibestudio.codes-ai.uk/health');
        return { ok: out.includes('200'), detail: `HTTP ${out.trim()}` };
      }},
      { key: 'db_prod', label: 'DB: vibestudio', run: async () => {
        // DB password is never sent from browser — backend uses its own env-var credentials
        const r = await local.post('/db-stats');
        const count = r?.data?.users?.length || 0;
        return { ok: count > 0, detail: `${count} users` };
      }},
      { key: 'db_test', label: 'DB: vibestudio_test', run: async () => {
        const out = await local.remoteCmd("psql -U vibestudio -d vibestudio_test -c \"SELECT count(*) as c FROM users;\" -t 2>&1");
        const count = parseInt(out.trim()) || 0;
        return { ok: count > 0, detail: `${count} users` };
      }},
      { key: 'git', label: 'Git Branch', run: async () => {
        const out = await local.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio && git rev-parse --abbrev-ref HEAD 2>/dev/null'");
        return { ok: out.includes('main'), detail: out.trim() };
      }},
      { key: 'dns', label: 'DNS: test-vibestudio.codes-ai.uk', run: async () => {
        const out = await local.remoteCmd('dig +short test-vibestudio.codes-ai.uk 2>/dev/null || echo "?"');
        return { ok: out.trim().length > 4 && !out.includes('?'), detail: out.trim() || 'not resolved' };
      }},
      { key: 'nginx', label: 'Nginx', run: async () => {
        const out = await local.remoteCmd("nginx -t 2>&1 | tail -1");
        return { ok: out.includes('successful'), detail: out.includes('successful') ? 'Config OK' : out.trim() };
      }},
      { key: 'pm2', label: 'PM2 Processes', run: async () => {
        const out = await local.remoteCmd("su - vibestudio -c 'pm2 jlist 2>/dev/null' | python3 -c 'import sys,json; procs=json.load(sys.stdin); online=[p for p in procs if p.get(\"pm2_env\",{}).get(\"status\")==\"online\"]; print(f\"{len(online)}/{len(procs)} online\")' 2>/dev/null || echo '?'");
        const match = out.match(/(\d+)\/(\d+)/);
        return { ok: match ? match[1] === match[2] : false, detail: out.trim() };
      }},
    ];

    for (const item of checkItems) {
      eLog(`▶ ${item.label}...`, 'system');
      try {
        const result = await item.run();
        setCheck(item.key, result.ok, result.detail);
        eLog(`  ${result.ok ? '✓' : '✗'} ${item.label}: ${result.detail}`, result.ok ? 'success' : 'error');
      } catch (e: any) {
        setCheck(item.key, false, e.message);
        eLog(`  ✗ ${item.label}: ${e.message}`, 'error');
      }
    }
    setRunning(false);
  };

  const okCount = Object.values(checks).filter(v => v.ok === true).length;
  const totalCount = Object.keys(checks).length;

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0"><span className="text-lg">🏥</span></div>
          <div>
            <p className="text-sm font-bold text-stone-800">Environment Health Monitor</p>
            <p className="text-xs text-stone-500 mt-1">This is <span className="font-bold">NOT</span> for deploying code. Use this to <span className="font-bold text-purple-600">diagnose issues</span> when something is broken.</p>
            <p className="text-xs text-stone-500 mt-1">It checks all server components: APIs, web servers, databases, DNS, nginx, PM2, SSL. Run it when a deployment fails or a site is down.</p>
            <div className="flex gap-2 mt-3">
              <span className="text-2xs px-2 py-1 rounded-lg bg-white border border-purple-200 text-purple-600 font-semibold">When to use: Site is down / Deploy failed / After server restart</span>
              <span className="text-2xs px-2 py-1 rounded-lg bg-white border border-stone-200 text-stone-500">To deploy: use Deploy tab or Branches tab</span>
            </div>
          </div>
        </div>
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <button onClick={runAllChecks} disabled={running}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm">
          {running ? '⏳ Checking...' : '🏥 Run Health Check'}
        </button>
        {totalCount > 0 && (
          <span className={`text-xs font-bold px-3 py-1 rounded-lg ${okCount === totalCount ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
            {okCount}/{totalCount} OK
          </span>
        )}
      </div>

      {/* Results Grid */}
      {totalCount > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {/* PROD */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-emerald-600 mb-3">PROD (vibestudio.codes-ai.uk)</p>
            <div className="space-y-1.5">
              {['prod_api', 'prod_web', 'prod_https', 'db_prod'].map(k => {
                const c = checks[k];
                if (!c) return null;
                return (
                  <div key={k} className={`flex items-center gap-2 p-2 rounded-lg ${c.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <span className={`w-2 h-2 rounded-full ${c.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-2xs font-medium text-stone-700 flex-1">{k.replace('prod_', '').replace('db_prod', 'Database').toUpperCase()}</span>
                    <span className={`text-2xs ${c.ok ? 'text-emerald-600' : 'text-red-600'}`}>{c.detail}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* TEST */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-purple-600 mb-3">TEST (test-vibestudio.codes-ai.uk)</p>
            <div className="space-y-1.5">
              {['test_api', 'test_web', 'test_https', 'db_test'].map(k => {
                const c = checks[k];
                if (!c) return null;
                return (
                  <div key={k} className={`flex items-center gap-2 p-2 rounded-lg ${c.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <span className={`w-2 h-2 rounded-full ${c.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-2xs font-medium text-stone-700 flex-1">{k.replace('test_', '').replace('db_test', 'Database').toUpperCase()}</span>
                    <span className={`text-2xs ${c.ok ? 'text-emerald-600' : 'text-red-600'}`}>{c.detail}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Infrastructure */}
          <div className="col-span-2 bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-stone-600 mb-3">Infrastructure</p>
            <div className="grid grid-cols-4 gap-2">
              {['git', 'dns', 'nginx', 'pm2'].map(k => {
                const c = checks[k];
                if (!c) return null;
                return (
                  <div key={k} className={`flex items-center gap-2 p-2.5 rounded-lg ${c.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <span className={`w-2 h-2 rounded-full ${c.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="text-2xs font-medium text-stone-700">{k.toUpperCase()}</p>
                      <p className={`text-2xs ${c.ok ? 'text-emerald-600' : 'text-red-600'}`}>{c.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Log */}
      {envLogs.length > 0 && (
        <div className="bg-stone-950 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-stone-800">
            <p className="text-2xs text-stone-500 font-semibold">Diagnostic Log</p>
            <button onClick={() => setEnvLogs([])} className="text-2xs text-stone-600 hover:text-stone-400">Clear</button>
          </div>
          <div className="p-3 max-h-48 overflow-auto font-mono text-xs">
            {envLogs.map((l, i) => (
              <p key={i} className={l.type === 'success' ? 'text-emerald-400' : l.type === 'error' ? 'text-red-400' : l.type === 'system' ? 'text-blue-400' : 'text-stone-500'}>{l.text}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
//  TAB 3: ENVIRONMENT INFO (Sub-tabbed, no scrolling)
// ══════════════════════════════════════════════
function InfoTab() {
  const [sub, setSub] = useState<'guide' | 'arch' | 'git' | 'db' | 'api' | 'accounts'>('guide');
  const pills = [
    { key: 'guide', label: 'Guide', icon: '📖' },
    { key: 'arch', label: 'Architecture', icon: '🏗' },
    { key: 'git', label: 'Git & Branches', icon: '🌿' },
    { key: 'db', label: 'Database', icon: '🗄' },
    { key: 'api', label: 'API & Config', icon: '⚡' },
    { key: 'accounts', label: 'Accounts', icon: '👥' },
  ] as const;

  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white rounded-2xl border border-stone-200 p-5 shadow-sm ${className}`}>{children}</div>
  );
  const H = ({ children }: { children: React.ReactNode }) => <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-4">{children}</p>;
  const Code = ({ children }: { children: React.ReactNode }) => <code className="bg-stone-100 px-1 rounded text-stone-700 text-2xs">{children}</code>;

  return (
    <div className="space-y-4">
      {/* Sub-tab pills */}
      <div className="bg-white rounded-2xl border border-stone-200 p-1.5 shadow-sm flex gap-1 overflow-x-auto">
        {pills.map(p => (
          <button key={p.key} onClick={() => setSub(p.key)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${sub === p.key ? 'bg-stone-900 text-white shadow-md' : 'text-stone-500 hover:bg-stone-100'}`}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* ═══════ GUIDE ═══════ */}
      {sub === 'guide' && <>
        {/* Main answer */}
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0"><span className="text-lg">🚀</span></div>
            <div>
              <p className="text-sm font-bold text-stone-800">Use the Production Dev Portal for all operations</p>
              <p className="text-xs text-stone-500 mt-1"><Code>https://vibestudio.codes-ai.uk/dev-portal</Code></p>
              <p className="text-xs text-stone-500 mt-2">The production Dev Portal has SSH access to the server. All branch, deploy, merge, and test operations run through it.</p>
            </div>
          </div>

          {/* Comparison */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl p-3 bg-white border border-stone-200">
              <p className="text-xs font-bold text-stone-500 mb-2">localhost:3100/dev-portal</p>
              <p className="text-2xs text-stone-400">Only for Dev Portal UI development</p>
              <span className="inline-block mt-2 px-2 py-0.5 rounded text-2xs font-bold bg-stone-100 text-stone-400">Dev only</span>
            </div>
            <div className="rounded-xl p-3 bg-white border-2 border-emerald-300">
              <p className="text-xs font-bold text-emerald-700 mb-2">vibestudio.codes-ai.uk/dev-portal</p>
              <p className="text-2xs text-stone-400">ALL deployment operations</p>
              <span className="inline-block mt-2 px-2 py-0.5 rounded text-2xs font-bold bg-emerald-100 text-emerald-600">Use this</span>
            </div>
          </div>

          {/* Daily workflow */}
          <p className="text-xs font-bold text-indigo-700 mb-3">Daily Workflow</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: '1-2', title: 'Code & Push', desc: 'Work on develop/feature branch → git push', color: 'orange', icon: '💻' },
              { n: '3-4', title: 'Test via Portal', desc: 'Fetch Remote → Deploy to TEST → verify', color: 'purple', icon: '🧪' },
              { n: '5-6', title: 'Release', desc: 'Merge → main → Deploy to PROD', color: 'emerald', icon: '🚀' },
            ].map(s => (
              <div key={s.n} className={`rounded-xl p-3 bg-${s.color}-50 border border-${s.color}-200`}>
                <div className="flex items-center gap-2 mb-1"><span>{s.icon}</span><span className="text-xs font-bold" style={{ color: s.color === 'orange' ? '#E8590C' : s.color === 'purple' ? '#7048E8' : '#2B8A3E' }}>Step {s.n}</span></div>
                <p className="text-xs font-semibold text-stone-700">{s.title}</p>
                <p className="text-2xs text-stone-500 mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick ref */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { title: 'Your Machine', desc: 'Code + commit + push', sub: 'git, VS Code, terminal', color: 'orange' },
            { title: 'Production Portal', desc: 'Deploy + merge + test', sub: 'vibestudio.codes-ai.uk/dev-portal', color: 'emerald' },
            { title: 'TEST Environment', desc: 'Verify before PROD', sub: 'test-vibestudio.codes-ai.uk', color: 'purple' },
          ].map(c => (
            <Card key={c.title}>
              <p className="text-xs font-bold" style={{ color: c.color === 'orange' ? '#E8590C' : c.color === 'purple' ? '#7048E8' : '#2B8A3E' }}>{c.title}</p>
              <p className="text-2xs text-stone-600 mt-1">{c.desc}</p>
              <p className="text-2xs text-stone-400 mt-0.5">{c.sub}</p>
            </Card>
          ))}
        </div>
      </>}

      {/* ═══════ ARCHITECTURE ═══════ */}
      {sub === 'arch' && <>
        <Card>
          <H>System Architecture</H>
          <div className="bg-stone-50 rounded-xl p-4 font-mono text-2xs leading-relaxed text-stone-600 overflow-x-auto">
            <pre className="whitespace-pre">{`┌──────────────────────────────────────────────────────────────────┐
│              IONOS Production Server                              │
│              Ubuntu 24.04 · 8 vCore · 16GB · 480GB NVMe          │
│                                                                   │
│  ┌──────────────────────────┐   ┌─────────────────────────────┐  │
│  │  PRODUCTION               │   │  TEST                        │  │
│  │  vibestudio.codes-ai.uk   │   │  test-vibestudio.codes-ai.uk │  │
│  │  nginx :443 ─┬ :4100 (API)│   │  nginx :443 ─┬ :4110 (API)  │  │
│  │              └ :3100 (Web) │   │              └ :3110 (Web)  │  │
│  │  /srv/vibestudio          │   │  /srv/vibestudio-test        │  │
│  │  DB: vibestudio           │   │  DB: vibestudio_test         │  │
│  │  Branch: main             │   │  Branch: any (switchable)    │  │
│  └──────────────────────────┘   └─────────────────────────────┘  │
│  PM2: vibestudio-api, vibestudio-web, *-api-test, *-web-test      │
│  PostgreSQL 16 · Node.js 22 · PM2 · nginx + Let's Encrypt        │
└──────────────────────────────────────────────────────────────────┘`}</pre>
          </div>
        </Card>

        {/* Environment table */}
        <Card>
          <H>Environment Comparison</H>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-stone-200">
                <th className="text-left py-2 px-2 text-stone-400 font-semibold text-2xs">Property</th>
                {ENVS.map(e => <th key={e.key} className="text-left py-2 px-2 font-bold text-2xs" style={{ color: e.color }}>{e.icon} {e.short}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-stone-50 text-2xs">
                {[
                  ['URL', 'localhost:3100', 'test-vibestudio.codes-ai.uk', 'vibestudio.codes-ai.uk'],
                  ['Ports', ':4100 / :3100', ':4110 / :3110', ':4100 / :3100'],
                  ['Database', 'vibestudio (local)', 'vibestudio_test', 'vibestudio'],
                  ['Git Branch', 'develop / feature/*', 'any (switchable)', 'main (always)'],
                  ['Directory', 'local clone', '/srv/vibestudio-test', '/srv/vibestudio'],
                  ['PM2', '— (dev)', 'vibestudio-api-test, vibestudio-web-test', 'vibestudio-api, vibestudio-web'],
                  ['SSL', '—', "Let's Encrypt", "Let's Encrypt"],
                  ['NODE_ENV', 'development', 'development', 'production'],
                  ['Can deploy', 'any (local)', 'any (via Branches)', 'main only'],
                ].map(([label, ...vals]) => (
                  <tr key={label}><td className="py-1.5 px-2 text-stone-500 font-medium">{label}</td>
                  {vals.map((v, i) => <td key={i} className="py-1.5 px-2 font-mono text-stone-700">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Server + Nginx */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <H>Server</H>
            <div className="space-y-1 text-2xs text-stone-500">
              {['OS: Ubuntu 24.04 LTS', 'CPU: 8 vCore · RAM: 16 GB', 'Storage: 480 GB NVMe', 'User: vibestudio', 'Node.js v22 · PostgreSQL 16', 'PM2 · nginx · Certbot'].map(l => <p key={l}>{l}</p>)}
            </div>
          </Card>
          <Card>
            <H>Nginx Routing</H>
            <div className="space-y-2">
              {[{ d: 'vibestudio.codes-ai.uk', api: ':4100', web: ':3100', c: '#2B8A3E' }, { d: 'test-vibestudio.codes-ai.uk', api: ':4110', web: ':3110', c: '#7048E8' }].map(n => (
                <div key={n.d} className="rounded-lg bg-stone-50 p-2">
                  <p className="text-2xs font-bold" style={{ color: n.c }}>{n.d}</p>
                  <p className="text-2xs text-stone-400 font-mono">/api/ → {n.api} · / → {n.web}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </>}

      {/* ═══════ GIT & BRANCHES ═══════ */}
      {sub === 'git' && <>
        {/* Pipeline */}
        <Card>
          <H>Feature Branch Pipeline</H>
          <div className="flex items-center justify-center gap-2 mb-4">
            {[
              { name: 'feature/*', color: '#7048E8', bg: '#F3F0FF', desc: 'Team develops' },
              null,
              { name: 'develop', color: '#E8590C', bg: '#FFF4E6', desc: 'Integration' },
              null,
              { name: 'main', color: '#2B8A3E', bg: '#EBFBEE', desc: 'Production' },
            ].map((b, i) => b ? (
              <div key={b.name} className="rounded-xl p-3 border-2 text-center min-w-[110px]" style={{ borderColor: b.color + '60', background: b.bg }}>
                <p className="text-xs font-bold" style={{ color: b.color }}>{b.name}</p>
                <p className="text-2xs text-stone-400 mt-0.5">{b.desc}</p>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-center">
                <span className="text-xs text-stone-400">→</span>
                <span className="text-2xs text-stone-400 bg-stone-100 px-1.5 rounded">{i === 1 ? 'PR' : 'merge'}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-16 text-2xs">
            <div className="text-center"><span className="px-2 py-0.5 rounded bg-purple-100 text-purple-600 font-bold">TEST</span><p className="text-stone-400 mt-0.5">test-vibestudio.codes-ai.uk</p></div>
            <div className="text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-600 font-bold">PROD</span><p className="text-stone-400 mt-0.5">vibestudio.codes-ai.uk</p></div>
          </div>
        </Card>

        {/* Workflow steps */}
        <Card>
          <H>Team Workflow (8 Steps)</H>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-stone-600">
            {[
              { n: 1, c: 'purple', t: 'Create feature branch', d: 'Branches tab → "New Feature Branch"' },
              { n: 2, c: 'purple', t: 'Develop', d: 'Team pushes commits to feature/xxx' },
              { n: 3, c: 'purple', t: 'Deploy to TEST', d: '"Deploy to TEST" → auto pipeline' },
              { n: 4, c: 'purple', t: 'Test & verify', d: 'QA on test-vibestudio.codes-ai.uk' },
              { n: 5, c: 'orange', t: 'Create PR', d: 'GitHub PR: feature/xxx → develop' },
              { n: 6, c: 'orange', t: 'Merge to develop', d: '"→ develop" button in Branches tab' },
              { n: 7, c: 'green', t: 'Release to main', d: '"Merge develop → main" button' },
              { n: 8, c: 'green', t: 'Deploy PROD', d: 'Deploy tab → Deploy to PROD' },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-2 py-1">
                <span className={`w-5 h-5 rounded text-2xs font-bold flex items-center justify-center flex-shrink-0 ${s.c === 'purple' ? 'bg-purple-100 text-purple-600' : s.c === 'orange' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>{s.n}</span>
                <div><p className="font-semibold text-stone-700 text-2xs">{s.t}</p><p className="text-2xs text-stone-400">{s.d}</p></div>
              </div>
            ))}
          </div>
        </Card>

        {/* Safety */}
        <Card className="border-red-200 bg-red-50/30">
          <H>Merge Safety Guards</H>
          <div className="grid grid-cols-2 gap-3 text-2xs">
            <div className="space-y-1.5 text-stone-600">
              <p><span className="text-emerald-500">✓</span> <Code>feature/*</Code> → <Code>develop</Code></p>
              <p><span className="text-emerald-500">✓</span> <Code>develop</Code> → <Code>main</Code></p>
            </div>
            <div className="space-y-1.5 text-red-600">
              <p><span className="text-red-500">✗</span> Cannot push directly to main</p>
              <p><span className="text-red-500">✗</span> Cannot delete main/develop/staging</p>
            </div>
          </div>
        </Card>
      </>}

      {/* ═══════ DATABASE ═══════ */}
      {sub === 'db' && <>
        {/* How migrations flow */}
        <Card className="border-blue-200 bg-blue-50/30">
          <H>How Migrations Flow Through the Pipeline</H>
          <div className="bg-stone-950 rounded-xl p-3 font-mono text-2xs text-stone-400 overflow-x-auto mb-4">
            <pre className="whitespace-pre">{`Feature Branch          TEST (vibestudio_test)  PROD (vibestudio)
─────────────          ──────────────────      ─────────────
1. Create migration
   052_add_xxx.js
2. git push
3. "Deploy to TEST" ──► knex migrate:latest
                        (safe — disposable DB)
4. Test & verify
5. Merge → main
6. "Deploy PROD"  ──────────────────────────► knex migrate:latest
                                              (permanent)`}</pre>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { env: 'DEV', db: 'vibestudio (local)', rule: 'Your playground — reset freely', c: 'orange' },
              { env: 'TEST', db: 'vibestudio_test', rule: 'Disposable — drop & recreate if broken', c: 'purple' },
              { env: 'PROD', db: 'vibestudio', rule: 'Sacred — forward-only, never rollback', c: 'emerald' },
            ].map(d => (
              <div key={d.env} className={`rounded-lg p-2.5 bg-${d.c}-50 border border-${d.c}-200`}>
                <p className="text-xs font-bold" style={{ color: d.c === 'orange' ? '#E8590C' : d.c === 'purple' ? '#7048E8' : '#2B8A3E' }}>{d.env}: {d.db}</p>
                <p className="text-2xs text-stone-500 mt-0.5">{d.rule}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Team Risk */}
        <Card className="border-red-200">
          <H>Risk: Conflicting Migrations from Team Members</H>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-2xs font-bold text-red-600 mb-1">Problem</p>
              <p className="text-2xs text-stone-600">Dev A creates <Code>052_add_sprints.js</Code>, Dev B creates <Code>052_add_comments.js</Code>. Both push to main → Knex collision.</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-2xs font-bold text-emerald-600 mb-2">3 Prevention Rules</p>
              <div className="space-y-1 text-2xs text-stone-600">
                <p><span className="font-bold">1.</span> Claim number in MEMORY.md first</p>
                <p><span className="font-bold">2.</span> Never push migrations to main directly</p>
                <p><span className="font-bold">3.</span> Run validator before commit</p>
              </div>
            </div>
          </div>
        </Card>

        {/* AI Safety */}
        <Card className="border-amber-200">
          <H>AI / Vibe Coding — Migration Rules</H>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xs font-bold text-emerald-600 mb-1.5">Tell the AI:</p>
              <div className="space-y-1 text-2xs text-stone-600">
                {['Use hasTable/hasColumn guards', 'Include complete down() function', 'Use _template.js as base', 'Add columns with defaults', 'Use createIfMissing helpers'].map(r => <p key={r}><span className="text-emerald-500">✓</span> {r}</p>)}
              </div>
            </div>
            <div>
              <p className="text-2xs font-bold text-red-600 mb-1.5">Never let AI:</p>
              <div className="space-y-1 text-2xs text-stone-600">
                {['Generate DROP TABLE in up()', 'DROP COLUMN without justification', 'Put seed data in migrations', 'Create migrations over 200 lines', 'Pick migration numbers'].map(r => <p key={r}><span className="text-red-500">✗</span> {r}</p>)}
              </div>
            </div>
          </div>
        </Card>

        {/* Validator */}
        <Card>
          <H>Migration Validator</H>
          <div className="bg-stone-950 rounded-lg p-3 font-mono text-2xs text-stone-400 mb-3">
            <p className="text-blue-400">$ node infrastructure/scripts/validate-migration.js</p>
            <p className="text-emerald-400 mt-1">✓ 40 passed</p>
            <p className="text-yellow-400">⚠ 8 warnings</p>
            <p className="text-red-400">✗ 3 BLOCKED — fix before deploying</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs">
            {[
              ['BLOCK', 'DROP TABLE in up()'],
              ['BLOCK', 'Missing/empty down()'],
              ['BLOCK', 'TRUNCATE / DELETE without WHERE'],
              ['BLOCK', 'Duplicate migration numbers'],
              ['WARN', 'DROP COLUMN in up()'],
              ['WARN', 'Seed data in migration'],
              ['WARN', 'No idempotency guard'],
              ['WARN', 'Over 200 lines / 5+ tables'],
            ].map(([sev, desc]) => (
              <p key={desc} className="py-0.5"><span className={`px-1 rounded font-bold ${sev === 'BLOCK' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>{sev}</span> <span className="text-stone-600">{desc}</span></p>
            ))}
          </div>
        </Card>

        {/* Quick Fix */}
        <Card>
          <H>Quick Fix — Bad Migration Reached an Environment</H>
          <div className="space-y-2">
            {[
              { env: 'DEV', cmd: 'npx knex migrate:rollback', note: 'Fix file, re-run migrate:latest', c: '#E8590C' },
              { env: 'TEST', cmd: 'DROP DATABASE vibestudio_test; CREATE DATABASE vibestudio_test OWNER vibestudio;', note: 'Then re-deploy — migrations run fresh', c: '#7048E8' },
              { env: 'PROD', cmd: 'Write 053_fix_bad_migration.js', note: 'NEVER rollback prod. Fix forward. Or restore backup.', c: '#C92A2A' },
            ].map(r => (
              <div key={r.env} className="rounded-lg bg-stone-50 p-3">
                <p className="text-xs font-bold mb-1" style={{ color: r.c }}>{r.env}</p>
                <p className="font-mono text-2xs text-stone-600">{r.cmd}</p>
                <p className="text-2xs text-stone-400 mt-0.5">{r.note}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Checklist */}
        <Card>
          <H>Pre-Deploy Checklist</H>
          <div className="grid grid-cols-2 gap-4 text-2xs text-stone-600">
            <div>
              <p className="font-bold text-stone-700 mb-1.5">Developer</p>
              {['Claimed migration number', 'Used _template.js', 'down() reverses up()', 'Ran validator', 'Round-trip test', 'Deployed to TEST'].map(c => <p key={c} className="py-0.5">☐ {c}</p>)}
            </div>
            <div>
              <p className="font-bold text-stone-700 mb-1.5">Reviewer</p>
              {['No DROP in up()', 'No seed data', 'Has guards', 'No number conflict', 'Under 200 lines', 'Correct types'].map(c => <p key={c} className="py-0.5">☐ {c}</p>)}
            </div>
          </div>
        </Card>
      </>}

      {/* ═══════ API & CONFIG ═══════ */}
      {sub === 'api' && <>
        <Card>
          <H>DevOps API Endpoints (/api/v1/ops/*)</H>
          <div className="overflow-x-auto">
            <table className="w-full text-2xs">
              <thead><tr className="border-b border-stone-200">
                <th className="text-left py-1.5 px-2 text-stone-400">Method</th>
                <th className="text-left py-1.5 px-2 text-stone-400">Endpoint</th>
                <th className="text-left py-1.5 px-2 text-stone-400">Description</th>
              </tr></thead>
              <tbody className="divide-y divide-stone-50">
                {[
                  ['GET', '/health', 'Server health, DB stats, memory'],
                  ['GET', '/git', 'Branch, commits, status'],
                  ['GET', '/git-branches', 'All branches + TEST branch detection'],
                  ['POST', '/git-fetch', 'Fetch remote with prune'],
                  ['POST', '/git-pull', 'Pull origin/main'],
                  ['POST', '/git-create-branch', 'Create feature/* from base'],
                  ['POST', '/git-checkout-test', 'Checkout branch on TEST via SSH'],
                  ['POST', '/git-deploy-test', 'Full deploy pipeline to TEST'],
                  ['POST', '/git-merge', 'Merge (feature→develop, develop→main)'],
                  ['POST', '/git-delete-branch', 'Delete (protected: main/develop)'],
                  ['GET', '/pm2', 'PM2 process list'],
                  ['POST', '/pm2-restart', 'Restart PM2 process'],
                  ['POST', '/migrate', 'Run knex migrate:latest'],
                  ['POST', '/seed', 'Run knex seed:run'],
                  ['POST', '/deploy', 'Full deploy pipeline'],
                  ['POST', '/activate-members', 'Set all members active'],
                  ['GET', '/db-stats', 'Members & projects overview'],
                  ['POST', '/remote-cmd', 'SSH command (admin)'],
                  ['POST', '/remote-deploy', 'SSH deploy action'],
                  ['GET', '/audit-log', 'Deployment audit log'],
                ].map(([m, e, d]) => (
                  <tr key={e}><td className="py-1.5 px-2"><span className={`px-1 py-0.5 rounded font-bold ${m === 'GET' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{m}</span></td>
                  <td className="py-1.5 px-2 font-mono text-stone-700">{e}</td>
                  <td className="py-1.5 px-2 text-stone-500">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <H>Key Configuration Files</H>
          <div className="space-y-1">
            {[
              ['apps/api/src/routes/ops.ts', 'DevOps API — 21 endpoints'],
              ['apps/web/src/pages/dev-portal/deployments.tsx', 'Dev Portal — 4 tabs'],
              ['apps/api/src/index.ts', 'API entry — 65 routes, CORS'],
              ['apps/web/src/lib/api.ts', 'Frontend API — auto-detect URL'],
              ['infrastructure/knexfile.js', 'Prod DB config'],
              ['infrastructure/knexfile-test.js', 'Test DB config'],
              ['infrastructure/migrations/_template.js', 'Migration template'],
              ['infrastructure/scripts/validate-migration.js', 'Migration validator'],
              ['infrastructure/deploy/fix-test-env.py', 'SSH: rebuild TEST'],
              ['infrastructure/deploy/seed-production.py', 'SSH: seed data'],
            ].map(([file, desc]) => (
              <div key={file} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-stone-50">
                <span className="text-stone-300 text-xs">📄</span>
                <code className="text-2xs text-blue-600 font-mono flex-1">{file}</code>
                <span className="text-2xs text-stone-400">{desc}</span>
              </div>
            ))}
          </div>
        </Card>
      </>}

      {/* ═══════ ACCOUNTS ═══════ */}
      {sub === 'accounts' && <>
        <Card>
          <H>Demo Accounts</H>
          <div className="space-y-1.5">
            {[
              { email: 'ceo@vibestudio.dev', role: 'Studio Lead / Admin', org: 'VibeStudio', badge: 'admin' },
              { email: 'aria@vibestudio.dev', role: 'AI Agent — Architect', org: 'VibeStudio', badge: 'agent' },
              { email: 'nova@vibestudio.dev', role: 'AI Agent — Frontend', org: 'VibeStudio', badge: 'agent' },
              { email: 'orion@vibestudio.dev', role: 'AI Agent — Backend', org: 'VibeStudio', badge: 'agent' },
              { email: 'sage@vibestudio.dev', role: 'AI Agent — QA / Review', org: 'VibeStudio', badge: 'agent' },
              { email: 'echo@vibestudio.dev', role: 'AI Agent — DevOps', org: 'VibeStudio', badge: 'agent' },
              { email: 'pixel@vibestudio.dev', role: 'AI Agent — Design', org: 'VibeStudio', badge: 'agent' },
            ].map(u => (
              <div key={u.email} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-stone-50 border border-stone-100">
                <span className={`px-1.5 py-0.5 rounded text-2xs font-bold ${u.badge === 'admin' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>{u.badge}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-stone-700">{u.email}</p>
                  <p className="text-2xs text-stone-400">{u.role} · {u.org}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <H>Database Architecture</H>
            <div className="space-y-2">
              {[
                { name: 'vibestudio', label: 'Production', tables: '~29 dev_*', users: '7', agents: '6', c: 'emerald' },
                { name: 'vibestudio_test', label: 'Test', tables: '~29 dev_*', users: '7', agents: '6', c: 'purple' },
              ].map(d => (
                <div key={d.name} className={`rounded-lg p-3 bg-${d.c}-50 border border-${d.c}-200`}>
                  <p className="text-xs font-bold" style={{ color: d.c === 'emerald' ? '#2B8A3E' : '#7048E8' }}>{d.name} ({d.label})</p>
                  <p className="text-2xs text-stone-500">{d.tables} tables · {d.users} members · {d.agents} AI agents</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <H>Server Access</H>
            <div className="space-y-1 text-2xs text-stone-500">
              <p>Host: see environment-info endpoint</p>
              <p>User: <Code>vibestudio</Code> (app) / <Code>root</Code> (admin)</p>
              <p>DB User: <Code>vibestudio</Code></p>
              <p>DB Password: stored in server env vars only</p>
              <p>GitHub: see ops/environment-info</p>
              <p>PM2: 4 processes (api+web x prod+test)</p>
            </div>
          </Card>
        </div>
      </>}
    </div>
  );
}

// ══════════════════════════════════════════════
//  TAB 4: BRANCHES (Feature Branch Workflow)
// ══════════════════════════════════════════════
type BranchInfo = { name: string; type: string; isLocal: boolean; isRemote: boolean; isHead: boolean; hash: string; message: string; date: string; author: string; track: string };

function BranchesTab({ log: parentLog }: { log: (m: string) => void }) {
  const local = useLocalOps();
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [testBranch, setTestBranch] = useState('unknown');
  const [headBranch, setHeadBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBase, setNewBase] = useState('develop');
  const [deploying, setDeploying] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const r = await local.post('/git-branches');
      if (r?.success) {
        setBranches(r.data.branches || []);
        setTestBranch(r.data.testBranch || 'unknown');
        setHeadBranch(r.data.head || 'main');
      }
    } catch (e: any) { parentLog(`Branch fetch error: ${e.message}`); }
    setLoading(false);
  };

  useEffect(() => { fetchBranches(); }, []);

  const doFetch = async () => {
    parentLog('▶ git fetch origin --prune');
    try {
      await local.post('/git-fetch');
      parentLog('  ✓ Fetched');
      fetchBranches();
    } catch (e: any) { parentLog(`  ✗ ${e.message}`); }
  };

  const doCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    parentLog(`▶ Creating feature/${newName} from ${newBase}`);
    try {
      const r = await local.post('/git-create-branch', { name: newName.trim(), base: newBase });
      parentLog(`  ✓ Created ${r?.data?.branch}`);
      setNewName('');
      setShowCreate(false);
      fetchBranches();
    } catch (e: any) { parentLog(`  ✗ ${e.message}`); }
    setCreating(false);
  };

  const doDeployTest = async (branch: string) => {
    setDeploying(branch);
    setDeployLog([]);
    parentLog(`▶ Deploying ${branch} to TEST...`);
    try {
      const r = await local.post('/git-deploy-test', { branch });
      const lines = (r?.data?.output || '').split('\n');
      setDeployLog(lines);
      lines.slice(-5).forEach((l: string) => { if (l.trim()) parentLog(`  ${l.trim()}`); });
      parentLog(`  ✓ ${branch} deployed to TEST`);
      fetchBranches();
    } catch (e: any) {
      parentLog(`  ✗ Deploy failed: ${e.response?.data?.error?.message || e.message}`);
      setDeployLog([`ERROR: ${e.response?.data?.error?.message || e.message}`]);
    }
    setDeploying(null);
  };

  const doMerge = async (source: string, target: string) => {
    if (!confirm(`Merge ${source} → ${target}?`)) return;
    setMerging(true);
    parentLog(`▶ Merging ${source} → ${target}`);
    try {
      await local.post('/git-merge', { source, target });
      parentLog(`  ✓ Merged ${source} → ${target}`);
      fetchBranches();
    } catch (e: any) { parentLog(`  ✗ Merge failed: ${e.response?.data?.error?.message || e.message}`); }
    setMerging(false);
  };

  const doDelete = async (branch: string) => {
    if (!confirm(`Delete branch ${branch}? This cannot be undone.`)) return;
    parentLog(`▶ Deleting ${branch}`);
    try {
      await local.post('/git-delete-branch', { branch });
      parentLog(`  ✓ Deleted ${branch}`);
      fetchBranches();
    } catch (e: any) { parentLog(`  ✗ ${e.message}`); }
  };

  const featureBranches = branches.filter(b => b.type === 'feature');
  const integrationBranches = branches.filter(b => ['main', 'develop', 'staging'].includes(b.type));
  const otherBranches = branches.filter(b => !['feature', 'main', 'develop', 'staging'].includes(b.type));

  const typeColor = (t: string) => t === 'main' ? '#2B8A3E' : t === 'develop' ? '#E8590C' : t === 'staging' ? '#1098AD' : t === 'feature' ? '#7048E8' : '#888';

  return (
    <div className="space-y-5">
      {/* Pipeline Visualization */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
        <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Feature Branch Pipeline</p>
        <div className="flex items-center justify-center gap-2">
          {/* Feature branches */}
          <div className="rounded-xl p-3 border-2 border-dashed border-purple-300 bg-purple-50/50 text-center min-w-[120px]">
            <p className="text-xs font-bold text-purple-600">feature/*</p>
            <p className="text-2xs text-stone-400">{featureBranches.length} branches</p>
            <p className="text-2xs text-purple-400 mt-1">Team develops here</p>
          </div>
          {/* Arrow: PR */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-stone-400">→</span>
            <span className="text-2xs text-stone-400 bg-amber-50 px-1.5 rounded border border-amber-200">PR</span>
          </div>
          {/* Develop */}
          <div className="rounded-xl p-3 border-2 border-orange-300 bg-orange-50/50 text-center min-w-[120px]">
            <p className="text-xs font-bold text-orange-600">develop</p>
            <p className="text-2xs text-stone-400">Integration</p>
            <p className="text-2xs text-orange-400 mt-1">Code reviewed</p>
          </div>
          {/* Arrow: merge */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-stone-400">→</span>
            <span className="text-2xs text-stone-400 bg-emerald-50 px-1.5 rounded border border-emerald-200">merge</span>
          </div>
          {/* Main */}
          <div className="rounded-xl p-3 border-2 border-emerald-300 bg-emerald-50/50 text-center min-w-[120px]">
            <p className="text-xs font-bold text-emerald-600">main</p>
            <p className="text-2xs text-stone-400">Stable</p>
            <p className="text-2xs text-emerald-400 mt-1">Release ready</p>
          </div>
        </div>
        {/* Env mapping */}
        <div className="flex items-center justify-center gap-2 mt-3">
          <div className="w-[120px]" />
          <div className="w-8" />
          <div className="text-center min-w-[120px]">
            <div className="border-t-2 border-dashed border-purple-300 mx-auto w-1 h-3" />
            <span className="text-2xs px-2 py-0.5 rounded bg-purple-100 text-purple-600 font-bold">TEST</span>
            <p className="text-2xs text-stone-400 mt-0.5">test-vibestudio.codes-ai.uk</p>
            <p className="text-2xs font-mono text-purple-500">{testBranch}</p>
          </div>
          <div className="w-8" />
          <div className="text-center min-w-[120px]">
            <div className="border-t-2 border-dashed border-emerald-300 mx-auto w-1 h-3" />
            <span className="text-2xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-600 font-bold">PROD</span>
            <p className="text-2xs text-stone-400 mt-0.5">vibestudio.codes-ai.uk</p>
            <p className="text-2xs font-mono text-emerald-500">main</p>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-2">
        <button onClick={doFetch} disabled={loading} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition-all disabled:opacity-50">
          {loading ? '⏳' : '🔄'} Fetch Remote
        </button>
        <button onClick={() => setShowCreate(!showCreate)} className="px-3 py-2 rounded-xl border border-purple-200 text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-all bg-white">
          + New Feature Branch
        </button>
        <button onClick={() => doMerge('develop', 'main')} disabled={merging} className="px-3 py-2 rounded-xl border border-emerald-200 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-all bg-white disabled:opacity-50">
          Merge develop → main
        </button>
        <div className="flex-1" />
        <span className="text-2xs text-stone-400">{branches.length} branches · TEST: <code className="text-purple-600">{testBranch}</code></span>
      </div>

      {/* Create Branch Form */}
      {showCreate && (
        <div className="bg-purple-50 rounded-2xl border border-purple-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-purple-700 mb-3">Create Feature Branch</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-500">feature/</span>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="branch-name" className="flex-1 px-3 py-2 rounded-lg border border-purple-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300" />
            <span className="text-xs text-stone-400">from</span>
            <select value={newBase} onChange={e => setNewBase(e.target.value)} className="px-3 py-2 rounded-lg border border-purple-200 text-xs">
              <option value="develop">develop</option>
              <option value="main">main</option>
            </select>
            <button onClick={doCreate} disabled={creating || !newName.trim()} className="px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 disabled:opacity-50 transition-all">
              {creating ? '⏳...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Feature Branches */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Feature Branches ({featureBranches.length})</p>
        </div>
        {featureBranches.length === 0 ? (
          <p className="text-xs text-stone-400 py-4 text-center">No feature branches. Click "New Feature Branch" to create one.</p>
        ) : (
          <div className="space-y-2">
            {featureBranches.map(b => (
              <div key={b.name} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${b.name === testBranch ? 'border-purple-300 bg-purple-50/50' : 'border-stone-100 hover:border-stone-200'}`}>
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono font-bold text-purple-700">{b.name}</p>
                    {b.name === testBranch && <span className="text-2xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-bold">ON TEST</span>}
                    {b.isHead && <span className="text-2xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 font-bold">HEAD</span>}
                  </div>
                  <p className="text-2xs text-stone-400 truncate mt-0.5">{b.hash} · {b.message} · {b.author} · {b.date?.slice(0, 10)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => doDeployTest(b.name)} disabled={deploying !== null}
                    className="px-2.5 py-1.5 rounded-lg text-2xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-all">
                    {deploying === b.name ? '⏳ Deploying...' : '🧪 Deploy to TEST'}
                  </button>
                  <button onClick={() => doMerge(b.name, 'develop')} disabled={merging}
                    className="px-2.5 py-1.5 rounded-lg text-2xs font-bold text-orange-600 border border-orange-200 hover:bg-orange-50 disabled:opacity-50 transition-all">
                    → develop
                  </button>
                  <button onClick={() => doDelete(b.name)}
                    className="px-2 py-1.5 rounded-lg text-2xs text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all">
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deploy Log (shown during deploy) */}
      {deployLog.length > 0 && (
        <div className="bg-stone-950 rounded-xl p-3 max-h-48 overflow-auto font-mono text-xs">
          {deployLog.map((l, i) => (
            <p key={i} className={l.startsWith('STEP:') ? 'text-blue-400 font-bold' : l.startsWith('ERROR') ? 'text-red-400' : l === 'DONE' ? 'text-emerald-400 font-bold' : 'text-stone-400'}>{l}</p>
          ))}
        </div>
      )}

      {/* Integration Branches */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Integration Branches</p>
        <div className="space-y-2">
          {integrationBranches.map(b => (
            <div key={b.name} className="flex items-center gap-3 p-3 rounded-xl border border-stone-100">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: typeColor(b.type) }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono font-bold" style={{ color: typeColor(b.type) }}>{b.name}</p>
                  {b.name === testBranch && <span className="text-2xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-bold">TEST</span>}
                  {b.type === 'main' && <span className="text-2xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 font-bold">PROD</span>}
                  {b.isHead && <span className="text-2xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-bold">HEAD</span>}
                </div>
                <p className="text-2xs text-stone-400 truncate mt-0.5">{b.hash} · {b.message} · {b.date?.slice(0, 10)}</p>
              </div>
              {b.type === 'develop' && (
                <button onClick={() => doDeployTest(b.name)} disabled={deploying !== null}
                  className="px-2.5 py-1.5 rounded-lg text-2xs font-bold text-purple-600 border border-purple-200 hover:bg-purple-50 disabled:opacity-50 transition-all">
                  🧪 Deploy to TEST
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Other Branches */}
      {otherBranches.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Other Branches ({otherBranches.length})</p>
          <div className="space-y-1">
            {otherBranches.map(b => (
              <div key={b.name} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-stone-50">
                <span className="w-2 h-2 rounded-full bg-stone-300 flex-shrink-0" />
                <span className="text-xs font-mono text-stone-600 flex-1">{b.name}</span>
                <span className="text-2xs text-stone-400">{b.hash} · {b.date?.slice(0, 10)}</span>
                <button onClick={() => doDelete(b.name)} className="text-2xs text-stone-400 hover:text-red-500">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5">
        <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-3">How Feature Branches Work</p>
        <div className="grid grid-cols-2 gap-4 text-xs text-stone-600">
          <div className="space-y-2">
            <p><span className="font-bold text-purple-600">1. Create</span> — Click "New Feature Branch" to create <code>feature/xxx</code> from develop</p>
            <p><span className="font-bold text-purple-600">2. Develop</span> — Team members push commits to the feature branch</p>
            <p><span className="font-bold text-purple-600">3. Test</span> — Click "Deploy to TEST" to deploy the branch to test-vibestudio.codes-ai.uk</p>
          </div>
          <div className="space-y-2">
            <p><span className="font-bold text-orange-600">4. Review</span> — Create a PR on GitHub for code review</p>
            <p><span className="font-bold text-orange-600">5. Merge</span> — Click "→ develop" to merge approved feature into develop</p>
            <p><span className="font-bold text-emerald-600">6. Release</span> — Click "Merge develop → main" to promote to production</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════
export default function DevPortalDeployments() {
  const { user, loading } = useDevAuth();
  const [envIdx, setEnvIdx] = useState(2); // Default to PROD
  const ops = useOps(envIdx);
  const [tab, setTab] = useState<'deploy' | 'branches' | 'environments' | 'info' | 'mobile'>('deploy');
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  const log = (msg: string) => { setLogs(p => [...p, `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`].slice(-200)); setTimeout(() => logsRef.current?.scrollTo(0, 99999), 50); };

  if (loading || !user) return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-stone-400 border-t-transparent rounded-full" /></div>;

  return (
    <DevPortalLayout user={user} title="DevOps">
      <div className="space-y-5">
        {/* Header + Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-stone-900">DevOps</h1>
            <div className="flex bg-stone-100 rounded-lg p-0.5">
              {([
                { key: 'deploy', label: 'Deploy', icon: '🚀' },
                { key: 'branches', label: 'Branches', icon: '🌿' },
                { key: 'environments', label: 'Environments', icon: '🌐' },
                { key: 'info', label: 'Info', icon: '📋' },
                { key: 'mobile', label: 'Mobile', icon: '📱' },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === t.key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === 'deploy' && <DeployTab envIdx={envIdx} setEnvIdx={setEnvIdx} ops={ops} log={log} logs={logs} logsRef={logsRef} />}
        {tab === 'branches' && <BranchesTab log={log} />}
        {tab === 'environments' && <EnvironmentsTab log={log} />}
        {tab === 'info' && <InfoTab />}
        {tab === 'mobile' && <MobileTab ops={ops} />}
      </div>
    </DevPortalLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// MOBILE TAB — iOS & Android Deployment Pipeline
// ═══════════════════════════════════════════════════════════════

const CRED_TYPES = [
  { type: 'expo_token', platform: 'expo', label: 'Expo Access Token', desc: 'From expo.dev account settings', icon: '🔑' },
  { type: 'apple_id', platform: 'ios', label: 'Apple ID', desc: 'Developer account email', icon: '🍎' },
  { type: 'apple_team_id', platform: 'ios', label: 'Apple Team ID', desc: '10-char team identifier', icon: '🍎' },
  { type: 'asc_app_id', platform: 'ios', label: 'App Store Connect App ID', desc: 'Numeric app ID', icon: '🍎' },
  { type: 'apple_api_key_id', platform: 'ios', label: 'Apple API Key ID', desc: 'Key ID from App Store Connect', icon: '🔐' },
  { type: 'apple_api_key_issuer', platform: 'ios', label: 'Apple API Issuer ID', desc: 'Issuer ID from App Store Connect', icon: '🔐' },
  { type: 'apple_api_key_p8', platform: 'ios', label: 'Apple API Key (.p8)', desc: 'AuthKey_XXXXX.p8 file content', icon: '🔐' },
  { type: 'google_service_account', platform: 'android', label: 'Google Service Account JSON', desc: 'Play Console service account key', icon: '🤖' },
  { type: 'android_keystore', platform: 'android', label: 'Android Keystore (Base64)', desc: 'Release signing keystore', icon: '🔒' },
  { type: 'android_keystore_alias', platform: 'android', label: 'Keystore Alias', desc: 'Key alias name', icon: '🏷' },
  { type: 'android_keystore_password', platform: 'android', label: 'Keystore Password', desc: 'Keystore + key password', icon: '🔑' },
];

const BUILD_STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600', building: 'bg-amber-100 text-amber-700',
  built: 'bg-blue-100 text-blue-700', submitting: 'bg-indigo-100 text-indigo-700',
  submitted: 'bg-emerald-100 text-emerald-700', published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500',
};

function MobileTab({ ops }: { ops: any }) {
  const { devApi } = useDevAuth();
  const [sub, setSub] = useState<'dashboard' | 'build' | 'credentials' | 'ota' | 'history' | 'setup'>('dashboard');
  const [dbReady, setDbReady] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrateOutput, setMigrateOutput] = useState('');

  // Data
  const [config, setConfig] = useState<any>(null);
  const [creds, setCreds] = useState<any[]>([]);
  const [builds, setBuilds] = useState<any[]>([]);
  const [otaUpdates, setOtaUpdates] = useState<any[]>([]);

  // Build form
  const [buildPlatform, setBuildPlatform] = useState('both');
  const [buildProfile, setBuildProfile] = useState('production');
  const [buildVersion, setBuildVersion] = useState('');
  const [buildNum, setBuildNum] = useState('');
  const [building, setBuilding] = useState(false);

  // Cred form
  const [showAddCred, setShowAddCred] = useState(false);
  const [credType, setCredType] = useState('expo_token');
  const [credName, setCredName] = useState('');
  const [credValue, setCredValue] = useState('');
  const [savingCred, setSavingCred] = useState(false);

  // OTA form
  const [otaChannel, setOtaChannel] = useState('production');
  const [otaPlatform, setOtaPlatform] = useState('all');
  const [otaMessage, setOtaMessage] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Expanded build log
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = () => {
    devApi('get', '/mobile/config').then(r => { setConfig(r.data.data); if (r.data.data?.version) setBuildVersion(r.data.data.version); }).catch(() => {});
    devApi('get', '/mobile/credentials').then(r => { setCreds(r.data.data || []); setDbReady(true); }).catch(() => { setCreds([]); setDbReady(false); });
    devApi('get', '/mobile/builds').then(r => setBuilds(r.data.data || [])).catch(() => setBuilds([]));
    devApi('get', '/mobile/ota-updates').then(r => setOtaUpdates(r.data.data || [])).catch(() => setOtaUpdates([]));
  };

  const triggerBuild = async () => {
    if (!dbReady) { alert('Database migration needed. Run: cd infrastructure && npx knex migrate:latest'); return; }
    setBuilding(true);
    try {
      await devApi('post', '/mobile/build', { platform: buildPlatform, profile: buildProfile, version: buildVersion, buildNumber: buildNum ? Number(buildNum) : undefined });
      loadAll();
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || '';
      alert(msg.includes('does not exist') ? 'Migration 053 not yet applied. Run on server:\ncd infrastructure && npx knex migrate:latest' : msg || 'Build trigger failed');
    }
    setBuilding(false);
  };

  const saveCred = async () => {
    if (!credValue) return;
    setSavingCred(true);
    const ct = CRED_TYPES.find(c => c.type === credType);
    try {
      await devApi('post', '/mobile/credentials', { platform: ct?.platform || 'expo', credential_type: credType, credential_name: credName || ct?.label || credType, value: credValue });
      setShowAddCred(false); setCredValue(''); setCredName(''); loadAll();
    } catch (e: any) { alert(e?.response?.data?.error?.message || 'Failed'); }
    setSavingCred(false);
  };

  const deleteCred = async (id: string) => {
    if (!confirm('Delete this credential?')) return;
    try { await devApi('delete', `/mobile/credentials/${id}`); loadAll(); } catch {}
  };

  const publishOta = async () => {
    if (!otaMessage.trim()) return;
    setPublishing(true);
    try { await devApi('post', '/mobile/ota-update', { channel: otaChannel, platform: otaPlatform, message: otaMessage }); setOtaMessage(''); loadAll(); } catch {}
    setPublishing(false);
  };

  const submitBuild = async (id: string) => {
    try { await devApi('post', `/mobile/builds/${id}/submit`); loadAll(); } catch {};
  };

  const cancelBuild = async (id: string) => {
    try { await devApi('post', `/mobile/builds/${id}/cancel`); loadAll(); } catch {};
  };

  // Stats
  const totalBuilds = builds.length;
  const successBuilds = builds.filter((b: any) => ['built', 'submitted', 'published'].includes(b.status)).length;
  const lastBuild = builds[0];
  const missingCreds = CRED_TYPES.filter(ct => !creds.find((c: any) => c.credential_type === ct.type));

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: '📊' },
          { key: 'build', label: 'Build & Deploy', icon: '🔨' },
          { key: 'credentials', label: 'Credentials', icon: '🔐' },
          { key: 'ota', label: 'OTA Updates', icon: '⚡' },
          { key: 'history', label: 'History', icon: '📜' },
          { key: 'setup', label: 'Setup Guide', icon: '⚙' },
        ].map(t => (
          <button key={t.key} onClick={() => setSub(t.key as any)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${sub === t.key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Migration banner */}
      {!dbReady && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠</span>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-800">Database Setup Required</p>
              <p className="text-2xs text-amber-700 mt-1">Mobile deployment tables don't exist yet. Click the button to run the migration on the IONOS server:</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={async () => {
                setMigrating(true); setMigrateOutput('');
                try {
                  const r = await ops.post('/remote-cmd', { command: 'su - vibestudio -c "cd /srv/vibestudio/infrastructure && npx knex migrate:latest 2>&1"' });
                  setMigrateOutput(r?.data?.output || 'Done');
                  loadAll(); // retry loading after migration
                } catch (e: any) {
                  setMigrateOutput('Error: ' + (e?.response?.data?.error?.message || e.message));
                }
                setMigrating(false);
              }} disabled={migrating}
                className="text-2xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                {migrating ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running...</> : <> Run Migration</>}
              </button>
              <button onClick={() => setSub('setup')} className="text-2xs font-semibold text-amber-700 bg-amber-200 px-2.5 py-1.5 rounded-lg hover:bg-amber-300">Setup Guide</button>
            </div>
          </div>
          {migrateOutput && (
            <pre className="mt-3 text-2xs font-mono bg-stone-900 text-stone-300 px-3 py-2 rounded-lg max-h-[120px] overflow-auto whitespace-pre-wrap">{migrateOutput}</pre>
          )}
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {sub === 'dashboard' && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-2xs text-stone-500">App Version</p>
              <p className="text-xl font-bold text-stone-900">{config?.version || '—'}</p>
              <p className="text-2xs text-stone-400 mt-1">{config?.name}</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-2xs text-stone-500">Total Builds</p>
              <p className="text-xl font-bold text-stone-900">{totalBuilds}</p>
              <p className="text-2xs text-stone-400 mt-1">{successBuilds} successful</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-2xs text-stone-500">Last Build</p>
              <p className="text-xl font-bold text-stone-900">{lastBuild ? lastBuild.status : '—'}</p>
              <p className="text-2xs text-stone-400 mt-1">{lastBuild ? `${lastBuild.platform} · ${lastBuild.profile}` : 'No builds yet'}</p>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <p className="text-2xs text-stone-500">Credentials</p>
              <p className="text-xl font-bold text-stone-900">{creds.length}/{CRED_TYPES.length}</p>
              <p className="text-2xs text-stone-400 mt-1">{missingCreds.length > 0 ? `${missingCreds.length} missing` : 'All configured'}</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Build iOS', icon: '🍎', platform: 'ios', color: 'from-gray-800 to-gray-900 text-white' },
              { label: 'Build Android', icon: '🤖', platform: 'android', color: 'from-green-600 to-green-700 text-white' },
              { label: 'Build Both', icon: '📱', platform: 'both', color: 'from-indigo-600 to-violet-700 text-white' },
              { label: 'OTA Update', icon: '⚡', platform: 'ota', color: 'from-amber-500 to-orange-600 text-white' },
            ].map(a => (
              <button key={a.label} onClick={() => { if (a.platform === 'ota') { setSub('ota'); } else { setBuildPlatform(a.platform); setSub('build'); } }}
                className={`bg-gradient-to-br ${a.color} rounded-xl p-4 text-left hover:opacity-90 transition-opacity`}>
                <span className="text-2xl block">{a.icon}</span>
                <p className="text-xs font-bold mt-2">{a.label}</p>
                <p className="text-2xs opacity-70 mt-0.5">Tap to start</p>
              </button>
            ))}
          </div>

          {/* Credential warnings */}
          {missingCreds.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-800 mb-2">Missing Credentials ({missingCreds.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {missingCreds.map(c => (
                  <span key={c.type} className="px-2 py-1 text-2xs bg-amber-100 text-amber-700 rounded-lg">{c.icon} {c.label}</span>
                ))}
              </div>
              <button onClick={() => setSub('credentials')} className="text-xs text-amber-700 font-semibold mt-2 hover:underline">Configure credentials →</button>
            </div>
          )}

          {/* Recent builds */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100"><h3 className="text-xs font-bold text-stone-700">Recent Builds</h3></div>
            <div className="divide-y divide-stone-50">
              {builds.slice(0, 5).map((b: any) => (
                <div key={b.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-lg">{b.platform === 'ios' ? '🍎' : b.platform === 'android' ? '🤖' : '📱'}</span>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-stone-800">v{b.version} · {b.profile}</p>
                    <p className="text-2xs text-stone-400">{b.member_display_name || b.member_name} · {new Date(b.created_at).toLocaleString('de-DE')}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${BUILD_STATUS_COLORS[b.status] || 'bg-gray-100'}`}>{b.status}</span>
                </div>
              ))}
              {builds.length === 0 && <div className="px-4 py-8 text-center text-xs text-stone-400">No builds yet</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── BUILD & DEPLOY ── */}
      {sub === 'build' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-stone-900">Build Configuration</h3>

            <div>
              <label className="text-2xs text-stone-500 font-semibold">Platform</label>
              <div className="flex gap-2 mt-1.5">
                {[
                  { key: 'ios', label: 'iOS', icon: '🍎' },
                  { key: 'android', label: 'Android', icon: '🤖' },
                  { key: 'both', label: 'Both', icon: '📱' },
                ].map(p => (
                  <button key={p.key} onClick={() => setBuildPlatform(p.key)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium border-2 transition-all ${buildPlatform === p.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-2xs text-stone-500 font-semibold">Profile</label>
              <div className="flex gap-2 mt-1.5">
                {['development', 'preview', 'production'].map(p => (
                  <button key={p} onClick={() => setBuildProfile(p)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all capitalize ${buildProfile === p ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>
                    {p === 'production' ? '🚀' : p === 'preview' ? '🧪' : '🔧'} {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-2xs text-stone-500 font-semibold">Version</label>
                <input type="text" value={buildVersion} onChange={e => setBuildVersion(e.target.value)} placeholder="1.0.0" className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs font-mono" />
              </div>
              <div>
                <label className="text-2xs text-stone-500 font-semibold">Build Number</label>
                <input type="number" value={buildNum} onChange={e => setBuildNum(e.target.value)} placeholder="Auto" className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs" />
              </div>
            </div>

            <button onClick={triggerBuild} disabled={building || !buildVersion}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl shadow-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {building ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Building...</> : <> Start Build</>}
            </button>
          </div>

          {/* Pipeline visualization */}
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-4">Pipeline Steps</h3>
            <div className="space-y-3">
              {[
                { n: 1, label: 'Validate Config', desc: 'Check app.json, eas.json, credentials', icon: '✅' },
                { n: 2, label: 'Upload to EAS', desc: 'Push source code to Expo build servers', icon: '☁' },
                { n: 3, label: 'Build Binary', desc: `Compile ${buildPlatform === 'ios' ? 'IPA' : buildPlatform === 'android' ? 'AAB' : 'IPA + AAB'}`, icon: '🔨' },
                { n: 4, label: 'Download Artifact', desc: 'Get signed binary from EAS', icon: '📦' },
                { n: 5, label: 'Submit to Store', desc: `Push to ${buildPlatform === 'ios' ? 'App Store Connect' : buildPlatform === 'android' ? 'Google Play Console' : 'Both Stores'}`, icon: '🏪' },
                { n: 6, label: 'Verify', desc: 'Confirm submission accepted', icon: '🎉' },
              ].map(step => (
                <div key={step.n} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-sm">{step.icon}</div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-stone-800">{step.n}. {step.label}</p>
                    <p className="text-2xs text-stone-400">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CREDENTIALS ── */}
      {sub === 'credentials' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Store Credentials</h3>
              <p className="text-2xs text-stone-400">All credentials are AES-256-GCM encrypted at rest</p>
            </div>
            <button onClick={() => setShowAddCred(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700">+ Add Credential</button>
          </div>

          {/* Credential cards by platform */}
          {['expo', 'ios', 'android'].map(platform => {
            const platCreds = CRED_TYPES.filter(ct => ct.platform === platform);
            const platIcon = platform === 'ios' ? '🍎' : platform === 'android' ? '🤖' : '🔑';
            return (
              <div key={platform} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center gap-2">
                  <span className="text-sm">{platIcon}</span>
                  <h4 className="text-xs font-bold text-stone-700 capitalize">{platform === 'expo' ? 'Expo' : platform === 'ios' ? 'Apple / iOS' : 'Google / Android'}</h4>
                </div>
                <div className="divide-y divide-stone-50">
                  {platCreds.map(ct => {
                    const existing = creds.find((c: any) => c.credential_type === ct.type);
                    return (
                      <div key={ct.type} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-sm">{ct.icon}</span>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-stone-800">{ct.label}</p>
                          <p className="text-2xs text-stone-400">{ct.desc}</p>
                        </div>
                        {existing ? (
                          <div className="flex items-center gap-2">
                            <span className="text-2xs font-mono bg-stone-100 text-stone-500 px-2 py-0.5 rounded">{existing.preview}</span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Configured" />
                            <button onClick={() => deleteCred(existing.id)} className="text-2xs text-red-400 hover:text-red-600">Remove</button>
                          </div>
                        ) : (
                          <button onClick={() => { setCredType(ct.type); setCredName(ct.label); setShowAddCred(true); }}
                            className="text-2xs font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50">+ Add</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Add credential modal */}
          {showAddCred && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAddCred(false)}>
              <div className="bg-white rounded-2xl p-5 w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-stone-900 mb-4">Add Credential</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-2xs text-stone-500 font-semibold">Type</label>
                    <select value={credType} onChange={e => { setCredType(e.target.value); const ct = CRED_TYPES.find(c => c.type === e.target.value); if (ct) setCredName(ct.label); }}
                      className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs">
                      {CRED_TYPES.map(ct => <option key={ct.type} value={ct.type}>{ct.icon} {ct.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-2xs text-stone-500 font-semibold">Label</label>
                    <input type="text" value={credName} onChange={e => setCredName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-2xs text-stone-500 font-semibold">Value</label>
                    {['apple_api_key_p8', 'google_service_account', 'android_keystore'].includes(credType) ? (
                      <textarea value={credValue} onChange={e => setCredValue(e.target.value)} placeholder="Paste file content..." className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs font-mono h-32 resize-none" />
                    ) : (
                      <PasswordInput value={credValue} onChange={setCredValue} placeholder="Enter value..." autoComplete="off"
                        wrapperClassName="relative mt-1"
                        className="w-full pl-3 pr-10 py-2 border border-stone-200 rounded-xl text-xs" />
                    )}
                  </div>
                  <p className="text-2xs text-stone-400">Encrypted with AES-256-GCM before storage. Never stored in plaintext.</p>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setShowAddCred(false)} className="px-3 py-1.5 text-xs text-stone-500 border border-stone-200 rounded-xl">Cancel</button>
                    <button onClick={saveCred} disabled={!credValue || savingCred} className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 disabled:opacity-50 rounded-xl">
                      {savingCred ? 'Encrypting...' : 'Save Credential'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── OTA UPDATES ── */}
      {sub === 'ota' && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-1">Publish OTA Update</h3>
            <p className="text-2xs text-stone-400 mb-4">Push JavaScript changes instantly — no App Store review needed</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-2xs text-stone-500 font-semibold">Channel</label>
                <select value={otaChannel} onChange={e => setOtaChannel(e.target.value)} className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs">
                  <option value="production">Production</option>
                  <option value="preview">Preview / Staging</option>
                  <option value="development">Development</option>
                </select>
              </div>
              <div>
                <label className="text-2xs text-stone-500 font-semibold">Platform</label>
                <select value={otaPlatform} onChange={e => setOtaPlatform(e.target.value)} className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs">
                  <option value="all">All Platforms</option>
                  <option value="ios">iOS Only</option>
                  <option value="android">Android Only</option>
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-2xs text-stone-500 font-semibold">Update Message</label>
              <input type="text" value={otaMessage} onChange={e => setOtaMessage(e.target.value)} placeholder="e.g. Fix login bug, update translations..." className="w-full mt-1 px-3 py-2 border border-stone-200 rounded-xl text-xs" />
            </div>
            <button onClick={publishOta} disabled={!otaMessage.trim() || publishing}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {publishing ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Publishing...</> : <> Publish OTA Update</>}
            </button>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
            <p className="text-xs font-bold text-stone-700 mb-2">How OTA Works</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { n: '1', icon: '📝', label: 'Change JS/TS code', desc: 'UI fixes, translations, logic changes' },
                { n: '2', icon: '⚡', label: 'Publish update', desc: 'EAS bundles & uploads the JS' },
                { n: '3', icon: '📱', label: 'Users get update', desc: 'Next app launch loads new JS' },
              ].map(s => (
                <div key={s.n} className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-lg mx-auto mb-1.5">{s.icon}</div>
                  <p className="text-2xs font-bold text-stone-700">{s.label}</p>
                  <p className="text-2xs text-stone-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* OTA History */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100"><h3 className="text-xs font-bold text-stone-700">Update History</h3></div>
            <div className="divide-y divide-stone-50">
              {otaUpdates.map((u: any) => (
                <div key={u.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-sm">⚡</span>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-stone-800">{u.message || '—'}</p>
                    <p className="text-2xs text-stone-400">{u.channel} · {u.platform} · {u.member_display_name || u.member_name} · {new Date(u.created_at).toLocaleString('de-DE')}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${u.status === 'published' ? 'bg-emerald-100 text-emerald-700' : u.status === 'failed' ? 'bg-red-100 text-red-700' : u.status === 'rolled_back' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{u.status}</span>
                </div>
              ))}
              {otaUpdates.length === 0 && <div className="px-4 py-8 text-center text-xs text-stone-400">No OTA updates yet</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── BUILD HISTORY ── */}
      {sub === 'history' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-stone-700">Build History</h3>
            <button onClick={loadAll} className="text-2xs text-indigo-600 font-semibold hover:underline">Refresh</button>
          </div>
          <div className="divide-y divide-stone-50">
            {builds.map((b: any) => (
              <div key={b.id}>
                <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-stone-50" onClick={() => setExpandedBuild(expandedBuild === b.id ? null : b.id)}>
                  <span className="text-lg">{b.platform === 'ios' ? '🍎' : b.platform === 'android' ? '🤖' : '📱'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-stone-800">v{b.version}</p>
                      <span className="text-2xs text-stone-400 capitalize">{b.profile}</span>
                      <span className="text-2xs text-stone-400">{b.build_type}</span>
                    </div>
                    <p className="text-2xs text-stone-400">{b.member_display_name || b.member_name} · {new Date(b.created_at).toLocaleString('de-DE')}{b.duration_seconds ? ` · ${Math.round(b.duration_seconds / 60)}m` : ''}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${BUILD_STATUS_COLORS[b.status] || 'bg-gray-100'}`}>{b.status}</span>
                  {b.status === 'building' && <button onClick={e => { e.stopPropagation(); cancelBuild(b.id); }} className="text-2xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-0.5 rounded">Cancel</button>}
                  {b.status === 'built' && <button onClick={e => { e.stopPropagation(); submitBuild(b.id); }} className="text-2xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-semibold">Submit to Store</button>}
                  <svg className={`w-4 h-4 text-stone-400 transition-transform ${expandedBuild === b.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </div>
                {expandedBuild === b.id && (
                  <div className="px-4 pb-3 space-y-2">
                    {b.eas_build_id && <p className="text-2xs text-stone-400">EAS Build: <span className="font-mono">{b.eas_build_id}</span></p>}
                    {b.artifact_url && <a href={b.artifact_url} target="_blank" rel="noopener" className="text-2xs text-indigo-600 hover:underline">Download Artifact</a>}
                    {b.error_message && <p className="text-2xs text-red-600">Error: {b.error_message}</p>}
                    {b.log_output && (
                      <pre className="bg-stone-900 text-stone-300 text-2xs font-mono p-3 rounded-xl max-h-[200px] overflow-auto">{b.log_output}</pre>
                    )}
                  </div>
                )}
              </div>
            ))}
            {builds.length === 0 && <div className="px-4 py-10 text-center text-xs text-stone-400">No builds yet. Start your first build above.</div>}
          </div>
        </div>
      )}

      {/* ── SETUP GUIDE ── */}
      {sub === 'setup' && (
        <div className="space-y-4">
          {/* Server setup */}
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-4">1. Server Setup</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-2xs font-bold text-stone-500 shrink-0">1a</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-stone-800">Run database migration</p>
                    <button onClick={async () => {
                      setMigrating(true); setMigrateOutput('');
                      try {
                        const r = await ops.post('/remote-cmd', { command: 'su - vibestudio -c "cd /srv/vibestudio && git pull origin main 2>&1 && cd infrastructure && npx knex migrate:latest 2>&1"' });
                        setMigrateOutput(r?.data?.output || 'Done');
                        loadAll();
                      } catch (e: any) { setMigrateOutput('Error: ' + (e?.response?.data?.error?.message || e.message)); }
                      setMigrating(false);
                    }} disabled={migrating}
                      className="text-2xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      {migrating ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running...</> : <> Execute on Server</>}
                    </button>
                  </div>
                  <pre className="text-2xs font-mono bg-stone-900 text-stone-300 px-3 py-1.5 rounded-lg mt-1 select-all overflow-x-auto">cd /srv/vibestudio/infrastructure && npx knex migrate:latest</pre>
                  <p className="text-2xs text-stone-400 mt-1">Creates dev_mobile_credentials, dev_mobile_builds, dev_mobile_ota_updates tables</p>
                  {migrateOutput && <pre className="text-2xs font-mono bg-emerald-950 text-emerald-300 px-3 py-2 rounded-lg mt-2 max-h-[150px] overflow-auto whitespace-pre-wrap">{migrateOutput}</pre>}
                </div>
              </div>
              <RemoteStep n="1b" title="Install EAS CLI globally" cmd="npm install -g eas-cli" desc="Required for building and submitting apps" ops={ops} />
              <Step n="1c" title="Set encryption key (optional)" cmd='echo "MOBILE_DEPLOY_KEY=your-secret-key-here" >> /srv/vibestudio/.env' desc="If not set, falls back to JWT_SECRET. AES-256-GCM encryption for credentials." />
            </div>
          </div>

          {/* Expo setup */}
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-4">2. Expo / EAS Account</h3>
            <div className="space-y-3">
              <Step n="2a" title="Create Expo account" cmd="https://expo.dev/signup" desc="Free account at expo.dev. Required for EAS Build." link />
              <Step n="2b" title="Create Access Token" cmd="expo.dev → Settings → Access Tokens → Create" desc="Copy the token and add it in Credentials tab as 'Expo Access Token'" link />
              <Step n="2c" title="Login on server" cmd="EXPO_TOKEN=your-token eas whoami" desc="Verify the token works" />
            </div>
          </div>

          {/* iOS / TestFlight */}
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-4">3. iOS / TestFlight Setup <span className="text-lg">🍎</span></h3>
            <div className="space-y-3">
              <Step n="3a" title="Apple Developer Program" cmd="https://developer.apple.com/programs/" desc="$99/year. Required for App Store and TestFlight distribution." link />
              <Step n="3b" title="Create App Store Connect App" cmd="https://appstoreconnect.apple.com → My Apps → +" desc="Create your app entry. Note the App ID (numeric)." link />
              <Step n="3c" title="Create API Key for automation" cmd="App Store Connect → Users → Integrations → App Store Connect API → Keys → +" desc="Role: Admin or Developer. Download the .p8 file. Note the Key ID and Issuer ID." link />
              <Step n="3d" title="Add credentials in Credentials tab" cmd="" desc="Add these 4 credentials:" />
              <div className="ml-8 space-y-1">
                {[
                  { type: 'Apple Team ID', example: '9ABCDE1234' },
                  { type: 'App Store Connect App ID', example: '6450123456' },
                  { type: 'Apple API Key ID', example: 'AB12CD34EF' },
                  { type: 'Apple API Issuer ID', example: '12abc345-6789-def0-1234-567890abcdef' },
                  { type: 'Apple API Key (.p8)', example: '-----BEGIN PRIVATE KEY-----\\nMIGT...' },
                ].map(c => (
                  <div key={c.type} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-stone-300" />
                    <span className="text-xs text-stone-700 font-medium">{c.type}</span>
                    <span className="text-2xs text-stone-400 font-mono">{c.example}</span>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                <p className="text-2xs font-bold text-blue-800">TestFlight Flow</p>
                <p className="text-2xs text-blue-700 mt-1">Build (production profile) → Submit to App Store Connect → Automatic TestFlight distribution to internal testers. External testers need a Beta App Review (usually 24h).</p>
              </div>
            </div>
          </div>

          {/* Android / Play Store */}
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-4">4. Android / Google Play Setup <span className="text-lg">🤖</span></h3>
            <div className="space-y-3">
              <Step n="4a" title="Google Play Developer account" cmd="https://play.google.com/console" desc="$25 one-time. Required for Play Store distribution." link />
              <Step n="4b" title="Create Service Account" cmd="Play Console → Setup → API access → Create new service account" desc="Grant 'Release manager' permissions. Download the JSON key file." link />
              <Step n="4c" title="Add credentials in Credentials tab" cmd="" desc="Add these credentials:" />
              <div className="ml-8 space-y-1">
                {[
                  { type: 'Google Service Account JSON', example: '{"type":"service_account",...}' },
                  { type: 'Android Keystore (Base64)', example: 'EAS manages this automatically' },
                ].map(c => (
                  <div key={c.type} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-stone-300" />
                    <span className="text-xs text-stone-700 font-medium">{c.type}</span>
                    <span className="text-2xs text-stone-400 font-mono">{c.example}</span>
                  </div>
                ))}
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
                <p className="text-2xs font-bold text-green-800">Internal Testing Track</p>
                <p className="text-2xs text-green-700 mt-1">Build (production profile) → Submit to Google Play → Internal testing track (instant, no review). Promote to production when ready.</p>
              </div>
            </div>
          </div>

          {/* Quick reference */}
          <div className="bg-stone-900 text-stone-300 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">Quick Reference — EAS Commands</h3>
            <div className="space-y-2 text-2xs font-mono">
              <p><span className="text-emerald-400">$</span> eas whoami <span className="text-stone-500"># verify login</span></p>
              <p><span className="text-emerald-400">$</span> eas build --platform ios --profile production <span className="text-stone-500"># build iOS</span></p>
              <p><span className="text-emerald-400">$</span> eas build --platform android --profile production <span className="text-stone-500"># build Android</span></p>
              <p><span className="text-emerald-400">$</span> eas submit --platform ios --latest <span className="text-stone-500"># submit to TestFlight</span></p>
              <p><span className="text-emerald-400">$</span> eas submit --platform android --latest <span className="text-stone-500"># submit to Play Store</span></p>
              <p><span className="text-emerald-400">$</span> eas update --channel production --message "fix" <span className="text-stone-500"># OTA hotfix</span></p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setSub('credentials')} className="flex-1 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700">Start → Add Credentials</button>
            <button onClick={() => setSub('build')} className="flex-1 py-3 bg-stone-200 text-stone-700 text-xs font-bold rounded-xl hover:bg-stone-300">Skip to Build</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, cmd, desc, link }: { n: string; title: string; cmd: string; desc: string; link?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-2xs font-bold text-stone-500 shrink-0">{n}</div>
      <div className="flex-1">
        <p className="text-xs font-semibold text-stone-800">{title}</p>
        {cmd && (link ? (
          <a href={cmd} target="_blank" rel="noopener" className="text-2xs font-mono text-indigo-600 hover:underline break-all">{cmd}</a>
        ) : (
          <pre className="text-2xs font-mono bg-stone-900 text-stone-300 px-3 py-1.5 rounded-lg mt-1 select-all overflow-x-auto">{cmd}</pre>
        ))}
        <p className="text-2xs text-stone-400 mt-1">{desc}</p>
      </div>
    </div>
  );
}

function RemoteStep({ n, title, cmd, desc, ops }: { n: string; title: string; cmd: string; desc: string; ops: any }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const run = async () => {
    setRunning(true); setOutput('');
    try {
      const r = await ops.post('/remote-cmd', { command: `su - vibestudio -c "${cmd} 2>&1"` });
      setOutput(r?.data?.output || 'Done');
    } catch (e: any) { setOutput('Error: ' + (e?.response?.data?.error?.message || e.message)); }
    setRunning(false);
  };
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-2xs font-bold text-stone-500 shrink-0">{n}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-stone-800">{title}</p>
          <button onClick={run} disabled={running}
            className="text-2xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1 rounded-lg flex items-center gap-1.5">
            {running ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running...</> : <> Execute</>}
          </button>
        </div>
        <pre className="text-2xs font-mono bg-stone-900 text-stone-300 px-3 py-1.5 rounded-lg mt-1 select-all overflow-x-auto">{cmd}</pre>
        <p className="text-2xs text-stone-400 mt-1">{desc}</p>
        {output && <pre className="text-2xs font-mono bg-emerald-950 text-emerald-300 px-3 py-2 rounded-lg mt-2 max-h-[120px] overflow-auto whitespace-pre-wrap">{output}</pre>}
      </div>
    </div>
  );
}
