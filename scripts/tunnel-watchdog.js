/**
 * Self-healing watchdog for the IONOS Postgres SSH tunnel.
 *
 * Runs (detached) for the life of a dev session. Every PROBE_INTERVAL it does
 * a real Postgres handshake through the tunnel via ensureHealthy(); if the
 * tunnel has dropped or gone zombie it kills the stale plink and restarts it.
 * Because the probe sends real bytes over the SSH channel every 30s, it also
 * keeps the connection warm so the firewall/NAT idle-timeout stops dropping
 * it in the first place — fixing the recurring "disconnected from remote
 * database" failure at the source.
 *
 * Lifecycle ("dev only"): it watches the dev ports (API 4000 / web 3000).
 * After a startup grace it exits once those ports have been gone for a while,
 * so stopping `npm run dev` cleans the watchdog up too. It is a singleton —
 * a lockfile prevents a second watchdog from starting.
 *
 * Detached + stdio ignored, so all output goes to the log file below.
 */

const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ensureHealthy } = require("./tunnel-lib");

const PROBE_INTERVAL_MS = 30_000;   // re-check + keepalive cadence
const STARTUP_GRACE_MS = 120_000;   // give dev time to boot before life-checks
const DEV_IDLE_EXIT_MS = 120_000;   // exit once dev ports gone this long
const DEV_PORTS = [4000, 3000];

const LOG_DIR = path.join(os.tmpdir(), "acca-tunnel");
const LOG_FILE = path.join(LOG_DIR, "watchdog.log");
const LOCK_FILE = path.join(LOG_DIR, "watchdog.lock");

fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

/** Singleton guard. Returns false if another live watchdog already owns it. */
function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const prev = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (prev && prev !== process.pid && pidAlive(prev)) return false;
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch {
    return true; // best-effort; never block healing on lockfile trouble
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const owner = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (owner === process.pid) fs.unlinkSync(LOCK_FILE);
    }
  } catch {}
}

function portListening(port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
    s.connect(port, "127.0.0.1");
  });
}

async function anyDevPortUp() {
  for (const p of DEV_PORTS) {
    if (await portListening(p)) return true;
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!acquireLock()) {
    // Another watchdog is already healing the tunnel; nothing to do.
    process.exit(0);
  }
  const cleanup = () => { releaseLock(); process.exit(0); };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", releaseLock);

  const startedAt = Date.now();
  let lastDevSeen = Date.now();
  log(`watchdog started (pid ${process.pid}); probing every ${PROBE_INTERVAL_MS / 1000}s.`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await ensureHealthy(log);
    if (res.action === "restarted") log("tunnel was dead — restarted and verified.");
    else if (res.action === "failed") log("HEAL FAILED: " + (res.reason || "unknown"));

    if (await anyDevPortUp()) lastDevSeen = Date.now();

    const now = Date.now();
    const pastGrace = now - startedAt > STARTUP_GRACE_MS;
    const devGoneFor = now - lastDevSeen;
    if (pastGrace && devGoneFor > DEV_IDLE_EXIT_MS) {
      log(`dev ports gone for ${Math.round(devGoneFor / 1000)}s — exiting watchdog.`);
      cleanup();
    }

    await sleep(PROBE_INTERVAL_MS);
  }
}

main().catch((e) => { log("fatal: " + (e && e.stack || e)); releaseLock(); process.exit(1); });
