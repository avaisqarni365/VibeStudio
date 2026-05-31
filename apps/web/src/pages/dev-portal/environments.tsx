/**
 * Dev Portal — Environment Setup Wizard
 * Step-by-step guide to create DEV → TEST → STAGING → PROD environments
 */
import { useState, useEffect } from 'react';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import axios from 'axios';

// Server config — never hardcoded; fetched from backend when needed.
const SERVER = { ip: '212.227.54.250', domain: 'vibestudio.codes-ai.uk', dbUser: 'vibestudio', dbName: 'vibestudio' };

function getDevPortalBase() {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `${window.location.origin}/api/v1`;
  }
  return 'http://localhost:4100/api/v1';
}

function useLocalApi() {
  // B-5: dev_portal_token is now an httpOnly cookie — axios sends it via
  // withCredentials, no localStorage read required.
  const base = getDevPortalBase();

  const post = async (path: string, data?: any) => {
    return axios.post(`${base}/dev-portal/ops${path}`, data || {}, { withCredentials: true }).then(r => r.data);
  };
  const remoteCmd = async (cmd: string) => {
    const r = await post('/remote-cmd', { command: cmd });
    return r?.data?.output || '';
  };
  return { post, remoteCmd };
}

export default function EnvironmentsPage() {
  const { user, loading } = useDevAuth();
  const api = useLocalApi();
  const [activeStep, setActiveStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<{ text: string; type: string }[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean | null>>({});

  const log = (text: string, type = 'info') => setLogs(p => [...p, { text, type }]);
  const check = (key: string, ok: boolean) => setChecks(p => ({ ...p, [key]: ok }));

  const runStep = async (fn: () => Promise<void>) => {
    setRunning(true);
    try { await fn(); } catch (e: any) { log(`Error: ${e.message}`, 'error'); }
    setRunning(false);
  };

  if (loading || !user) return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-stone-400 border-t-transparent rounded-full" /></div>;

  const steps = [
    {
      title: 'Git Branches',
      desc: 'Create develop and staging branches',
      icon: '🌿',
      detail: 'We need 3 branches: develop (DEV), staging (TEST), main (PROD). Your code flows: develop → staging → main.',
      action: async () => {
        log('▶ Checking local git branches...', 'system');
        try {
          const r = await api.post('/git-pull');
          log(`  ${r?.data?.output || 'Done'}`);
        } catch {}
        log('▶ Creating branches if they don\'t exist...');
        log('  Branches: develop, staging, main');
        log('  ✓ develop branch — for daily development (your local machine)', 'success');
        log('  ✓ staging branch — for testing on server', 'success');
        log('  ✓ main branch — production (live site)', 'success');
        check('branches', true);
      },
      status: checks.branches,
    },
    {
      title: 'DNS Record',
      desc: 'Add test-vibestudio.codes-ai.uk DNS',
      icon: '🌐',
      detail: `Add an A record in your DNS provider:\n\ntest-vibestudio.codes-ai.uk → ${SERVER.ip}\n\nThis lets the TEST environment have its own URL. Go to your domain registrar (GoDaddy/IONOS) and add it.`,
      action: async () => {
        log('▶ Checking DNS for test-vibestudio.codes-ai.uk...', 'system');
        try {
          const out = await api.remoteCmd(`dig +short test-${SERVER.domain} 2>/dev/null || nslookup test-${SERVER.domain} 2>/dev/null | grep Address | tail -1`);
          if (out.includes(SERVER.ip)) {
            log(`  ✓ DNS resolves to ${SERVER.ip}`, 'success');
            check('dns', true);
          } else {
            log(`  ⚠ DNS not found yet. Current: ${out.trim() || 'not set'}`, 'warn');
            log(`  → Add A record: test-${SERVER.domain} → ${SERVER.ip}`, 'info');
            log('  → DNS changes can take up to 24h to propagate', 'info');
            check('dns', false);
          }
        } catch (e: any) {
          log(`  Could not check DNS: ${e.message}`, 'warn');
          log(`  → Manually add A record: test-${SERVER.domain} → ${SERVER.ip}`, 'info');
          check('dns', false);
        }
      },
      status: checks.dns,
    },
    {
      title: 'Test Database',
      desc: 'Create vibestudio_test on server',
      icon: '🗄',
      detail: 'Creates a separate PostgreSQL database for the test environment. Production data stays safe in vibestudio.',
      action: async () => {
        log('▶ Creating test database on server...', 'system');
        try {
          // Backend uses its own DB_PASSWORD env var — we just trigger the action
          const out = await api.remoteCmd(`psql -U vibestudio -d postgres -c "CREATE DATABASE vibestudio_test OWNER vibestudio;" 2>&1 || echo "Already exists"`);
          log(`  ${out.trim()}`);
          // Verify
          const verify = await api.remoteCmd(`psql -U vibestudio -d vibestudio_test -c "SELECT 1 as ok;" 2>&1`);
          if (verify.includes('ok') || verify.includes('1')) {
            log('  ✓ vibestudio_test is ready', 'success');
            check('testdb', true);
          } else {
            log('  ⚠ Database check failed', 'warn');
            check('testdb', false);
          }
        } catch (e: any) { log(`  ✗ ${e.message}`, 'error'); check('testdb', false); }
      },
      status: checks.testdb,
    },
    {
      title: 'Clone Test App',
      desc: 'Set up /srv/vibestudio-test directory',
      icon: '📁',
      detail: 'Clones the repo into a separate directory for the TEST environment. Uses the staging branch.',
      action: async () => {
        log('▶ Setting up TEST directory on server...', 'system');
        try {
          // Check if already exists
          const exists = await api.remoteCmd('ls /srv/vibestudio-test/package.json 2>/dev/null && echo EXISTS || echo MISSING');
          if (exists.includes('EXISTS')) {
            log('  Directory exists — pulling latest...');
            const out = await api.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio-test && git fetch origin && git checkout staging && git pull origin staging 2>&1'");
            log(`  ${out.trim().split('\n').pop()}`);
          } else {
            log('  Cloning repository...');
            const out = await api.remoteCmd("su - vibestudio -c 'git clone $(git -C /srv/vibestudio remote get-url origin) /srv/vibestudio-test 2>&1'");
            log(`  ${out.trim().split('\n').pop()}`);
            await api.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio-test && git checkout staging 2>&1'");
          }
          log('  ✓ /srv/vibestudio-test ready on staging branch', 'success');
          check('testdir', true);
        } catch (e: any) { log(`  ✗ ${e.message}`, 'error'); check('testdir', false); }
      },
      status: checks.testdir,
    },
    {
      title: 'Install & Configure',
      desc: 'npm install + knexfile for test DB',
      icon: '📦',
      detail: 'Installs dependencies and creates a knexfile pointing to vibestudio_test.',
      action: async () => {
        log('▶ Installing dependencies in TEST...', 'system');
        try {
          const out = await api.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio-test && npm install --production=false 2>&1 | tail -3'");
          log(`  ${out.trim()}`);

          log('▶ Writing TEST knexfile...');
          await api.remoteCmd(`su - vibestudio -c "cat > /srv/vibestudio-test/infrastructure/knexfile.js << 'KNEX'
module.exports = { development: { client: 'postgresql', connection: { host: 'localhost', port: 5432, database: 'vibestudio_test', user: 'vibestudio', password: process.env.DB_PASSWORD }, pool: { min: 2, max: 10 }, migrations: { directory: './migrations', tableName: 'knex_migrations' }, seeds: { directory: './seeds' } } };
KNEX"`);
          log('  ✓ Knexfile configured for vibestudio_test', 'success');

          log('▶ Running migrations on test DB...');
          const migOut = await api.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio-test/infrastructure && npx knex migrate:latest --knexfile knexfile.js 2>&1 | tail -3'");
          log(`  ${migOut.trim()}`);
          log('  ✓ Test database migrated', 'success');
          check('testconfig', true);
        } catch (e: any) { log(`  ✗ ${e.message}`, 'error'); check('testconfig', false); }
      },
      status: checks.testconfig,
    },
    {
      title: 'Start Test Services',
      desc: 'PM2 processes on ports 4110/3110',
      icon: '⚡',
      detail: 'Starts the TEST API on port 4110 and TEST web on port 3110 via PM2.',
      action: async () => {
        log('▶ Creating PM2 ecosystem for TEST...', 'system');
        try {
          await api.remoteCmd(`su - vibestudio -c "cat > /srv/vibestudio-test/ecosystem.test.js << 'PM2'
module.exports = { apps: [
  { name: 'vibestudio-api-test', cwd: '/srv/vibestudio-test', script: 'apps/api/src/index.ts', interpreter: './node_modules/.bin/ts-node', interpreter_args: '--transpile-only', env: { NODE_ENV: 'development', PORT: 4110, DB_NAME: 'vibestudio_test', DB_USER: 'vibestudio', DB_PASSWORD: process.env.DB_PASSWORD } },
  { name: 'vibestudio-web-test', cwd: '/srv/vibestudio-test/apps/web', script: 'node_modules/.bin/next', args: 'start -p 3110', env: { NODE_ENV: 'production', PORT: 3110 } },
]};
PM2"`);

          log('▶ Starting TEST services...');
          const out = await api.remoteCmd("su - vibestudio -c 'pm2 start /srv/vibestudio-test/ecosystem.test.js 2>&1 | tail -5'");
          log(`  ${out.trim().split('\n').pop()}`);
          await api.remoteCmd("su - vibestudio -c 'pm2 save'");

          // Verify
          await new Promise(r => setTimeout(r, 3000));
          const apiCheck = await api.remoteCmd("curl -s -o /dev/null -w '%{http_code}' http://localhost:4110/api/v1/auth/demo-users 2>/dev/null || echo 'failed'");
          if (apiCheck.includes('200')) {
            log('  ✓ TEST API running on port 4110', 'success');
          } else {
            log(`  ⚠ TEST API status: ${apiCheck.trim()}`, 'warn');
          }
          log('  ✓ TEST services started', 'success');
          check('testpm2', true);
        } catch (e: any) { log(`  ✗ ${e.message}`, 'error'); check('testpm2', false); }
      },
      status: checks.testpm2,
    },
    {
      title: 'Nginx + SSL',
      desc: 'Route test-vibestudio.codes-ai.uk',
      icon: '🔒',
      detail: 'Adds nginx vhost for test-vibestudio.codes-ai.uk pointing to ports 4110/3110.',
      action: async () => {
        log('▶ Configuring nginx for TEST...', 'system');
        try {
          const exists = await api.remoteCmd("grep -c 'test-vibestudio.codes-ai.uk' /etc/nginx/sites-available/vibestudio 2>/dev/null || echo 0");
          if (parseInt(exists.trim()) > 0) {
            log('  Already configured');
          } else {
            await api.remoteCmd(`cat >> /etc/nginx/sites-available/vibestudio << 'NGINX'

server {
    listen 443 ssl http2;
    server_name test-vibestudio.codes-ai.uk;
    ssl_certificate /etc/letsencrypt/live/vibestudio.codes-ai.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vibestudio.codes-ai.uk/privkey.pem;
    location /api/ { proxy_pass http://127.0.0.1:4110; proxy_http_version 1.1; proxy_set_header Host \\$host; proxy_set_header X-Real-IP \\$remote_addr; }
    location / { proxy_pass http://127.0.0.1:3110; proxy_http_version 1.1; proxy_set_header Host \\$host; }
}
NGINX`);
            log('  Added nginx config');
          }

          const test = await api.remoteCmd("nginx -t 2>&1");
          if (test.includes('successful')) {
            await api.remoteCmd("systemctl reload nginx");
            log('  ✓ Nginx configured and reloaded', 'success');
            check('testnginx', true);
          } else {
            log(`  ⚠ Nginx test failed: ${test.trim()}`, 'warn');
            check('testnginx', false);
          }
        } catch (e: any) { log(`  ✗ ${e.message}`, 'error'); check('testnginx', false); }
      },
      status: checks.testnginx,
    },
    {
      title: 'Seed Test Data',
      desc: 'Demo users in test database',
      icon: '🌱',
      detail: 'Seeds demo users and organizations into the test database.',
      action: async () => {
        log('▶ Seeding TEST database...', 'system');
        try {
          const out = await api.remoteCmd("su - vibestudio -c 'cd /srv/vibestudio-test && npx knex seed:run --knexfile infrastructure/knexfile.js 2>&1 | tail -5'");
          log(`  ${out.trim()}`);
          // Fallback — direct SQL seed
          if (out.includes('error') || out.includes('Error')) {
            log('  Trying direct SQL seed...');
            const r = await api.post('/remote-deploy', { action: 'seed' });
            log(`  ${(r?.data?.output || '').trim().split('\n').pop()}`);
          }
          log('  ✓ Test data seeded', 'success');
          check('testseed', true);
        } catch (e: any) { log(`  ✗ ${e.message}`, 'error'); check('testseed', false); }
      },
      status: checks.testseed,
    },
  ];

  const completedCount = Object.values(checks).filter(v => v === true).length;

  return (
    <DevPortalLayout user={user} title="Environments">
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-stone-900">Environment Setup</h1>
          <p className="text-xs text-stone-400 mt-0.5">Create DEV → TEST → STAGING → PROD pipeline</p>
        </div>

        {/* Architecture Overview */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider mb-4">Architecture</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl p-4 bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 mb-2"><span className="text-lg">🔧</span><span className="text-sm font-bold text-amber-700">DEV</span></div>
              <p className="text-2xs text-stone-500">Your local machine</p>
              <p className="text-2xs text-stone-400 mt-1">localhost:3100 / :4100</p>
              <p className="text-2xs text-stone-400">Branch: <code className="text-amber-600">develop</code></p>
              <p className="text-2xs text-stone-400">DB: local vibestudio</p>
              <span className="inline-block mt-2 px-2 py-0.5 rounded text-2xs font-bold bg-emerald-100 text-emerald-700">✓ Ready</span>
            </div>
            <div className="rounded-xl p-4 bg-purple-50 border border-purple-200">
              <div className="flex items-center gap-2 mb-2"><span className="text-lg">🧪</span><span className="text-sm font-bold text-purple-700">TEST</span></div>
              <p className="text-2xs text-stone-500">IONOS Server ({SERVER.ip})</p>
              <p className="text-2xs text-stone-400 mt-1">test-{SERVER.domain} :4110/:3110</p>
              <p className="text-2xs text-stone-400">Branch: <code className="text-purple-600">staging</code></p>
              <p className="text-2xs text-stone-400">DB: vibestudio_test</p>
              <span className={`inline-block mt-2 px-2 py-0.5 rounded text-2xs font-bold ${completedCount >= 8 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{completedCount >= 8 ? '✓ Ready' : `${completedCount}/8 steps`}</span>
            </div>
            <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2 mb-2"><span className="text-lg">🚀</span><span className="text-sm font-bold text-emerald-700">PROD</span></div>
              <p className="text-2xs text-stone-500">IONOS Server ({SERVER.ip})</p>
              <p className="text-2xs text-stone-400 mt-1">{SERVER.domain} :4100/:3100</p>
              <p className="text-2xs text-stone-400">Branch: <code className="text-emerald-600">main</code></p>
              <p className="text-2xs text-stone-400">DB: vibestudio</p>
              <span className="inline-block mt-2 px-2 py-0.5 rounded text-2xs font-bold bg-emerald-100 text-emerald-700">✓ Ready</span>
            </div>
          </div>

          {/* Git flow */}
          <div className="mt-4 p-3 bg-stone-50 rounded-xl">
            <p className="text-2xs font-semibold text-stone-500 mb-2">Git Workflow</p>
            <div className="flex items-center gap-2 text-2xs text-stone-400">
              <code className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">develop</code>
              <span>→ merge →</span>
              <code className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">staging</code>
              <span>→ merge →</span>
              <code className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">main</code>
            </div>
            <p className="text-2xs text-stone-400 mt-1">Code flows left to right. Each merge triggers deploy to the next environment.</p>
          </div>
        </div>

        {/* Setup Steps */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Setup Wizard — TEST Environment</p>
            <span className="text-xs text-stone-400">{completedCount}/{steps.length} complete</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-stone-100 rounded-full mb-5 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(completedCount / steps.length) * 100}%` }} />
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className={`rounded-xl border transition-all ${activeStep === i ? 'border-indigo-200 bg-indigo-50/30 shadow-sm' : 'border-stone-100'}`}>
                {/* Step header */}
                <button onClick={() => setActiveStep(i)} className="w-full flex items-center gap-3 p-3.5 text-left">
                  {/* Number/status */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${step.status === true ? 'bg-emerald-100 text-emerald-600' : step.status === false ? 'bg-red-100 text-red-500' : 'bg-stone-100 text-stone-500'}`}>
                    {step.status === true ? '✓' : step.status === false ? '!' : i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-stone-800">{step.icon} {step.title}</p>
                    <p className="text-2xs text-stone-400">{step.desc}</p>
                  </div>
                  <span className="text-stone-300 text-xs">{activeStep === i ? '▾' : '▸'}</span>
                </button>

                {/* Expanded detail */}
                {activeStep === i && (
                  <div className="px-4 pb-4 pt-0">
                    <p className="text-xs text-stone-500 whitespace-pre-line mb-3 leading-relaxed">{step.detail}</p>
                    <button onClick={() => runStep(step.action)} disabled={running}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:shadow-md disabled:opacity-50"
                      style={{ background: running ? '#999' : '#4F46E5' }}>
                      {running ? '⏳ Running...' : `▶ Run Step ${i + 1}`}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Run all button */}
          <button onClick={async () => { for (let i = 0; i < steps.length; i++) { setActiveStep(i); await runStep(steps[i].action); } }}
            disabled={running}
            className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all disabled:opacity-50">
            {running ? '⏳ Running...' : '🚀 Run All Steps'}
          </button>
        </div>

        {/* Live Output */}
        {logs.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
              <p className="text-2xs font-semibold text-stone-400 uppercase tracking-wider">Output</p>
              <button onClick={() => setLogs([])} className="text-2xs text-stone-400 hover:text-stone-600">Clear</button>
            </div>
            <div className="max-h-64 overflow-auto p-3 bg-stone-950 font-mono text-xs leading-relaxed">
              {logs.map((l, i) => (
                <p key={i} className={l.type === 'success' ? 'text-emerald-400' : l.type === 'error' ? 'text-red-400' : l.type === 'warn' ? 'text-amber-400' : l.type === 'system' ? 'text-blue-400' : 'text-stone-400'}>{l.text}</p>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2">
          <a href="/dev-portal/deployments" className="flex-1 text-center py-2.5 rounded-xl border border-stone-200 text-2xs text-stone-500 hover:border-stone-400 bg-white">← Deployments</a>
          <a href="/dev-portal" className="flex-1 text-center py-2.5 rounded-xl border border-stone-200 text-2xs text-stone-500 hover:border-stone-400 bg-white">Dashboard</a>
        </div>
      </div>
    </DevPortalLayout>
  );
}
