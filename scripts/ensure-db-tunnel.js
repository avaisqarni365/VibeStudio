/**
 * Ensure the SSH tunnel to the IONOS Postgres is up AND actually working,
 * then leave a self-healing watchdog running for the dev session.
 *
 * The remote IONOS Postgres firewall blocks direct connections from dev IPs,
 * so the tunnel (127.0.0.1:5545 -> 212.227.54.250:5432) is the ONLY path to
 * the production DB. The demo accounts on /auth/demo-users live only on that
 * DB, so a missing/dead tunnel manifests as "demo accounts disappeared /
 * login broken / disconnected from remote database" in the UI.
 *
 * Unlike the old version, this does a REAL Postgres handshake (not just a
 * port-listen check), so it detects and restarts a "zombie" tunnel — one
 * where plink dropped the SSH connection but the local port is still open.
 * It then spawns scripts/tunnel-watchdog.js (detached, singleton) which
 * keeps re-checking for the life of the dev session.
 *
 * Requires IONOS_SSH_PASSWORD via env (`setx IONOS_SSH_PASSWORD "..."`) or in
 * the root .env (which is read here and is gitignored).
 */

const { spawn } = require("child_process");
const path = require("path");
const { ensureHealthy } = require("./tunnel-lib");

async function main() {
  const res = await ensureHealthy();
  if (!res.healthy) {
    // No password / launcher failure are hard stops; surface and exit non-zero.
    process.exit(1);
  }
  if (res.action === "alive") {
    console.log("[TUNNEL] healthy (Postgres reachable on 127.0.0.1:5545).");
  }

  // Spawn the session watchdog detached so it survives this short-lived
  // process and keeps the tunnel healed while you develop. It is a singleton
  // (lockfile-guarded) and self-terminates once dev has been stopped.
  try {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "tunnel-watchdog.js")],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    child.unref();
  } catch (e) {
    // Watchdog is best-effort; the one-shot heal above already succeeded.
    console.log("[TUNNEL] (watchdog not started: " + (e && e.message) + ")");
  }
}

main().catch((e) => { console.error("[TUNNEL] error:", e); process.exit(1); });
