import * as dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";
import { z } from "zod";

// Load env files in priority order. Later loads do NOT override earlier ones
// (dotenv default), so .env.local wins because we load it first.
const repoRoot = path.resolve(__dirname, "../../..");
const nodeEnv = process.env.NODE_ENV ?? "development";

for (const file of [`.env.${nodeEnv}.local`, `.env.local`, `.env.${nodeEnv}`, `.env`]) {
  const full = path.join(repoRoot, file);
  if (fs.existsSync(full)) dotenv.config({ path: full });
}

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"));

const port = z.coerce.number().int().min(1).max(65535);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    PORT: port.default(4100),

    // ---- Database ----
    DATABASE_URL: z.string().url().optional(),
    DB_HOST: z.string().default("localhost"),
    DB_PORT: port.default(5432),
    DB_NAME: z.string().default("vibestudio"),
    DB_USER: z.string().default("vibestudio"),
    DB_PASSWORD: z.string().default("postgres"),
    DB_SSL: bool.default(false),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(10),

    // ---- Redis ----
    REDIS_URL: z.string().url().optional(),

    // ---- Auth ----
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be ≥32 chars"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be ≥32 chars"),

    // ---- Storage ----
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("./storage"),
    STORAGE_PUBLIC_URL: z.string().url().optional(),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(false),

    // ---- CORS / cookies ----
    ALLOWED_ORIGINS: z.string().default("http://localhost:3100"),
    COOKIE_DOMAIN: z.string().optional(),

    // ---- Logging ----
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_FORMAT: z.enum(["json", "text"]).default("json"),
  })
  .superRefine((v, ctx) => {
    if (v.STORAGE_DRIVER === "s3") {
      for (const k of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const) {
        if (!v[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} required when STORAGE_DRIVER=s3` });
      }
    }
    if (v.NODE_ENV === "production") {
      if (v.JWT_SECRET.includes("change-me"))
        ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "placeholder JWT_SECRET in production" });
      if (!v.DB_SSL && !v.DATABASE_URL?.includes("sslmode="))
        ctx.addIssue({ code: "custom", path: ["DB_SSL"], message: "DB_SSL must be true in production" });
    }
  });

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("\n❌ Invalid environment configuration:\n");
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
  }
  // eslint-disable-next-line no-console
  console.error("");
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
