/**
 * Runtime resolver — the single point where Local vs Remote is decided.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  process.env.NODE_ENV  ──►  resolveRuntime()  ──►  Runtime   │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Every consumer (DB pool, storage driver, mailer, etc.) calls
 *   import { runtime } from "@vibestudio/config";
 * and reads `runtime.database.url`, `runtime.storage.driver`, ...
 *
 * Nothing else in the codebase should read process.env directly.
 */

import { env, isProd, isDev, isTest } from "./env";

export type Mode = "local" | "remote";

export interface DatabaseRuntime {
  url: string;
  ssl: boolean;
  pool: { min: number; max: number };
}

export interface StorageRuntime {
  driver: "local" | "s3";
  /** For driver=local: filesystem root. For driver=s3: bucket name. */
  location: string;
  /** Public base URL the client uses to fetch files. */
  publicBaseUrl?: string;
  /** Only populated when driver=s3. */
  s3?: {
    endpoint?: string;     // undefined = real AWS, set = MinIO/R2/IONOS
    region: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
}

export interface RedisRuntime {
  url: string;
}

export interface Runtime {
  mode: Mode;
  nodeEnv: typeof env.NODE_ENV;
  database: DatabaseRuntime;
  storage: StorageRuntime;
  redis: RedisRuntime;
  cors: { origins: string[] };
  cookies: { domain?: string; secure: boolean; sameSite: "lax" | "none" };
}

// ── The switch ──────────────────────────────────────────────────────────────
//
// "remote" = staging or production. "local" = development or test.
// We key off NODE_ENV (set by the host: PM2/systemd in prod, npm script in dev).
//
const MODE: Mode = isProd || env.NODE_ENV === "staging" ? "remote" : "local";

function buildDatabaseUrl(): string {
  // Prefer DATABASE_URL when supplied (managed Postgres on IONOS gives you one).
  // Fall back to assembling from individual DB_* parts (Docker compose layout).
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const auth = `${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}`;
  const sslParam = env.DB_SSL ? "?sslmode=require" : "";
  return `postgres://${auth}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}${sslParam}`;
}

function buildStorageRuntime(): StorageRuntime {
  if (env.STORAGE_DRIVER === "s3") {
    return {
      driver: "s3",
      location: env.S3_BUCKET!,
      publicBaseUrl: env.STORAGE_PUBLIC_URL, // CDN URL in prod, MinIO URL in dev
      s3: {
        endpoint: env.S3_ENDPOINT,            // unset for AWS; set for MinIO/IONOS
        region: env.S3_REGION!,
        accessKey: env.S3_ACCESS_KEY!,
        secretKey: env.S3_SECRET_KEY!,
        forcePathStyle: env.S3_FORCE_PATH_STYLE, // true for MinIO, false for AWS
      },
    };
  }
  return {
    driver: "local",
    location: env.STORAGE_LOCAL_PATH,
    publicBaseUrl: env.STORAGE_PUBLIC_URL ?? `http://localhost:${env.PORT}/uploads`,
  };
}

export const runtime: Runtime = {
  mode: MODE,
  nodeEnv: env.NODE_ENV,
  database: {
    url: buildDatabaseUrl(),
    ssl: env.DB_SSL || (env.DATABASE_URL?.includes("sslmode=") ?? false),
    pool: { min: env.DB_POOL_MIN, max: env.DB_POOL_MAX },
  },
  storage: buildStorageRuntime(),
  redis: { url: env.REDIS_URL ?? "redis://localhost:6379" },
  cors: { origins: env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) },
  cookies: {
    domain: env.COOKIE_DOMAIN,
    secure: MODE === "remote",          // HTTPS-only cookies in prod
    sameSite: MODE === "remote" ? "none" : "lax",
  },
};

// One-shot boot banner — proves to ops which mode the process started in.
// Appears once per process, never logs secrets.
// eslint-disable-next-line no-console
console.log(
  `[runtime] mode=${runtime.mode} env=${runtime.nodeEnv} ` +
  `db=${runtime.database.url.replace(/:[^:@]+@/, ":****@")} ` +
  `storage=${runtime.storage.driver}:${runtime.storage.location} ` +
  `redis=${runtime.redis.url.replace(/:[^:@]+@/, ":****@")}`,
);

export { isProd, isDev, isTest };
