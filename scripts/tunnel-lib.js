/**
 * Shared SSH-tunnel health/heal helpers for the IONOS Postgres tunnel.
 *
 * The recurring "disconnected from remote database" failure had one root
 * cause: plink (the SSH tunnel) drops its connection on idle, but leaves the
 * local port 5545 *listening*. A bare "is the port listening?" check then
 * reports the tunnel as healthy when it is actually a dead pipe — so nothing
 * restarts it and the API talks to nothing.
 *
 * The fix is `probeLiveness()`: it does a real Postgres SSLRequest handshake
 * through the tunnel and only reports healthy when Postgres answers. A zombie
 * tunnel accepts the TCP connect but never answers → correctly detected dead.
 *
 * `ensureHealthy()` probes and, if dead, kills the stale plink and restarts
 * the tunnel via start-db-tunnel.ps1, then re-probes.
 */

const { spawnSync, execSync } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");

const TUNNEL_PORT = parseInt(process.env.TUNNEL_LOCAL_PORT || "5545", 10);
const REMOTE_HOST = "212.227.54.250";
const REMOTE_PORT = 5432;
const ROOT = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

function loadEnvPassword() {
  if (process.env.IONOS_SSH_PASSWORD) return process.env.IONOS_SSH_PASSWORD;
  try {
    const txt = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    const m = txt.match(/^IONOS_SSH_PASSWORD\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^['"]|['"]$/g, "");
  } catch {}
  return null;
}

/** Bare TCP connect — true if *something* is listening on the local port. */
function tcpPortListening(timeoutMs = 800) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => { resolve(false); });
    s.connect(TUNNEL_PORT, "127.0.0.1");
  });
}

/**
 * Real liveness probe: open the local port and send a Postgres SSLRequest
 * (8 bytes: length=8, code 1234.5679). A live backend answers with a single
 * byte 'S' (0x53) or 'N' (0x4E). A zombie tunnel accepts the connect but
 * never answers → we time out and report dead. This is the check that tells
 * a working tunnel apart from a dead-but-still-listening one.
 */
function probeLiveness(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (alive) => {
      if (done) return;
      done = true;
      try { s.destroy(); } catch {}
      resolve(alive);
    };
    s.setTimeout(timeoutMs);
    s.once("timeout", () => finish(false));
    s.once("error", () => finish(false));
    s.once("connect", () => {
      // length (8) + SSLRequest code 80877103 (0x04D2162F)
      s.write(Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]));
    });
    s.once("data", (buf) => {
      const b = buf && buf.length ? buf[0] : 0;
      finish(b === 0x53 /* S */ || b === 0x4e /* N */);
    });
    s.connect(TUNNEL_PORT, "127.0.0.1");
  });
}

/** Kill whatever process is holding the local tunnel port (the zombie plink). */
function killStalePlink() {
  if (!isWin) {
    try { execSync(`lsof -ti:${TUNNEL_PORT} | xargs kill -9 2>/dev/null`); } catch {}
    return;
  }
  try {
    const raw = execSync("netstat -ano", { encoding: "utf8", timeout: 5000 });
    const pids = new Set();
    for (const line of raw.split("\n")) {
      if (line.includes(":" + TUNNEL_PORT) && /LISTENING/i.test(line)) {
        const m = line.trim().match(/(\d+)\s*$/);
        if (m && m[1] !== "0") pids.add(m[1]);
      }
    }
    for (const pid of pids) {
      try {
        execSync("taskkill /PID " + pid + " /F /T", { shell: "cmd.exe", timeout: 5000, stdio: "pipe" });
      } catch {}
    }
  } catch {}
}

/** (Re)start the tunnel via the existing PowerShell launcher. */
function startTunnel(pw) {
  const script = path.join(ROOT, "infrastructure", "scripts", "start-db-tunnel.ps1");
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { env: { ...process.env, IONOS_SSH_PASSWORD: pw }, stdio: "inherit" }
  );
  return r.status === 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ensure the tunnel is actually carrying Postgres traffic. Returns:
 *   { healthy: bool, action: "alive" | "restarted" | "failed", reason?: string }
 * Logs are routed through `log` (defaults to console.log) so callers can tag.
 */
async function ensureHealthy(log = console.log) {
  if (await probeLiveness()) {
    return { healthy: true, action: "alive" };
  }

  const listening = await tcpPortListening();
  log(
    listening
      ? "[TUNNEL] port " + TUNNEL_PORT + " is listening but Postgres did not answer — zombie tunnel, restarting."
      : "[TUNNEL] tunnel is down — starting."
  );

  const pw = loadEnvPassword();
  if (!pw) {
    log("[TUNNEL] IONOS_SSH_PASSWORD is not set. Set it with:");
    log('[TUNNEL]   setx IONOS_SSH_PASSWORD "<password>"   (then open a new shell)');
    log("[TUNNEL]   — or add IONOS_SSH_PASSWORD=... to the root .env");
    return { healthy: false, action: "failed", reason: "no-password" };
  }

  // A zombie still owns the port; start-db-tunnel.ps1 refuses to start while
  // something is listening, so clear it first.
  if (listening) killStalePlink();

  if (!startTunnel(pw)) {
    return { healthy: false, action: "failed", reason: "launcher-failed" };
  }

  for (let i = 0; i < 12; i++) {
    if (await probeLiveness()) {
      log("[TUNNEL] up — Postgres reachable on 127.0.0.1:" + TUNNEL_PORT + ".");
      return { healthy: true, action: "restarted" };
    }
    await sleep(500);
  }
  return { healthy: false, action: "failed", reason: "no-response-after-start" };
}

module.exports = {
  TUNNEL_PORT,
  REMOTE_HOST,
  REMOTE_PORT,
  ROOT,
  isWin,
  loadEnvPassword,
  tcpPortListening,
  probeLiveness,
  killStalePlink,
  startTunnel,
  ensureHealthy,
  sleep,
};
