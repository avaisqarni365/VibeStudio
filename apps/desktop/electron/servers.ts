/**
 * Spawns the bundled API + web servers inside the packaged desktop app.
 *
 * Both run on Electron's OWN bundled Node (ELECTRON_RUN_AS_NODE=1), so the
 * target machine needs no Node install. Fixed ports keep the web client's
 * build-time NEXT_PUBLIC_API_URL (http://localhost:4100) consistent with the
 * running API, and match the API's CORS default (http://localhost:3100).
 *
 * Secrets are generated once and persisted in userData (so sessions survive
 * restarts). DB credentials are read from <userData>/db.env if present,
 * otherwise inherited from process.env / the app defaults.
 */
import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export const API_PORT = 4100;
export const WEB_PORT = 3100;

const children: ChildProcess[] = [];

function hex32(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Generate-once auth secrets, persisted in userData so tokens survive restarts. */
function loadOrCreateSecrets(): Record<string, string> {
  const file = path.join(app.getPath("userData"), "secrets.json");
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* fall through to regenerate */
  }
  const secrets = {
    JWT_SECRET: hex32(),
    JWT_REFRESH_SECRET: hex32(),
    SESSION_SECRET: hex32(),
    MOBILE_DEPLOY_KEY: hex32(),
  };
  try {
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  } catch {
    /* userData may be read-only in odd setups; secrets are still used in-memory */
  }
  return secrets;
}

/** Optional <userData>/db.env (KEY=VALUE per line) for DB connectivity. */
function loadDbEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(app.getPath("userData"), "db.env");
  try {
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2];
      }
    }
  } catch {
    /* ignore malformed file */
  }
  return out;
}

function waitForPort(port: number, host = "127.0.0.1", timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, host);
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting for ${host}:${port}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function pipeLogs(child: ChildProcess, tag: string, log: (m: string) => void): void {
  child.stdout?.on("data", (d) => log(`[${tag}] ${String(d).trimEnd()}`));
  child.stderr?.on("data", (d) => log(`[${tag}!] ${String(d).trimEnd()}`));
  child.on("exit", (code) => log(`[${tag}] exited (code ${code})`));
}

/**
 * Start the bundled API + web servers and resolve once both ports accept
 * connections. Throws if either fails to come up within the timeout.
 */
export async function startBundledServers(log: (m: string) => void = () => {}): Promise<void> {
  const res = process.resourcesPath;
  const apiDir = path.join(res, "api");
  const webDir = path.join(res, "web");
  const secrets = loadOrCreateSecrets();
  const dbEnv = loadDbEnv();

  const nodeEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" } as NodeJS.ProcessEnv;

  // ── API ──
  const apiEntry = path.join(apiDir, "api.cjs");
  log(`starting API → ${apiEntry}`);
  const api = spawn(process.execPath, [apiEntry], {
    cwd: apiDir,
    env: {
      ...nodeEnv,
      // 'development' avoids Secure-only cookies over http://localhost and the
      // strict production env checks (DB_SSL etc.) in @vibestudio/config.
      NODE_ENV: "development",
      PORT: String(API_PORT),
      WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      ...secrets,
      ...dbEnv, // DB_HOST/PORT/NAME/USER/PASSWORD from userData/db.env, if provided
    },
    stdio: "pipe",
  });
  pipeLogs(api, "api", log);
  children.push(api);

  // ── Web (Next.js standalone) ──
  const webEntry = path.join(webDir, "apps", "web", "server.js");
  log(`starting web → ${webEntry}`);
  const web = spawn(process.execPath, [webEntry], {
    cwd: webDir,
    env: {
      ...nodeEnv,
      NODE_ENV: "production",
      PORT: String(WEB_PORT),
      HOSTNAME: "127.0.0.1",
    },
    stdio: "pipe",
  });
  pipeLogs(web, "web", log);
  children.push(web);

  await Promise.all([waitForPort(API_PORT), waitForPort(WEB_PORT)]);
}

export function stopBundledServers(): void {
  for (const child of children.splice(0)) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
}
