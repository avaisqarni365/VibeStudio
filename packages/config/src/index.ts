export { env, isProd, isDev, isTest, type Env } from "./env";
export { runtime, type Runtime, type Mode, type DatabaseRuntime, type StorageRuntime } from "./runtime";

import * as dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";

// Monorepo runs from many cwds (root, apps/api, apps/web, scripts, tests).
// Resolve the `.env` at the repo root first; fall back to the cwd default if absent.
// __dirname here is .../packages/config/src — three levels up is the monorepo root.
const rootEnv = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

export interface AppConfig {
  env: string;
  port: number;
  jwtSecret: string;
  database: DatabaseConfig;
  auth: AuthConfig;
  logging: LoggingConfig;
  storage: StorageConfig;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  poolMin: number;
  poolMax: number;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  sessionSecret: string;
  sessionMaxAge: number;
}

export interface LoggingConfig {
  level: string;
  format: "json" | "text";
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
}

export interface StorageConfig {
  provider: "local" | "s3";
  localPath?: string;
  s3Bucket?: string;
  s3Region?: string;
}

export const config: AppConfig = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4100", 10),
  // Top-level alias read by the dev-portal auth code (config.jwtSecret).
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "vibestudio",
    username: process.env.DB_USER || "vibestudio",
    password: process.env.DB_PASSWORD || "postgres",
    ssl: process.env.DB_SSL === "true",
    poolMin: parseInt(process.env.DB_POOL_MIN || "2", 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || "10", 10),
  },
  auth: {
    // validateProductionSecrets() fails fast if this placeholder ships in prod.
    jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
    // D-4: 7d is a deliberate default. Shorter lifetimes (e.g. 15m) are
    // safer but require a working refresh-token UX — currently half-wired
    // (see audit plan A-3 follow-up). Override with JWT_EXPIRES_IN as soon
    // as the refresh flow is battle-tested. The cookie maxAge is derived
    // from this value (see apps/api/src/routes/auth.ts setAuthCookie).
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    sessionSecret: process.env.SESSION_SECRET || "change-me-in-production",
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || "604800000", 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: (process.env.LOG_FORMAT as "json" | "text") || "json",
    enableConsole: process.env.LOG_CONSOLE !== "false",
    enableFile: process.env.LOG_FILE === "true",
    filePath: process.env.LOG_FILE_PATH,
  },
  storage: {
    provider: (process.env.STORAGE_PROVIDER as "local" | "s3") || "local",
    localPath: process.env.STORAGE_LOCAL_PATH || "./storage",
    s3Bucket: process.env.STORAGE_S3_BUCKET,
    s3Region: process.env.STORAGE_S3_REGION,
  },
};
