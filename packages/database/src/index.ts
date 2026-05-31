import knex, { Knex } from "knex";
import { AsyncLocalStorage } from "async_hooks";
import { config } from "@vibestudio/config";
import { createLogger } from "@vibestudio/logging";

const logger = createLogger({ service: "database" });

const knexInstance: Knex = knex({
  client: "pg",
  connection: {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.username,
    password: config.database.password,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
    // The DB is reached through an SSH tunnel (plink → IONOS). When the tunnel
    // drops or the watchdog restarts plink, every pooled socket dies — but a
    // bare idle TCP socket has NO os-level timeout, so the pool keeps handing
    // out dead connections and queries hang until acquireConnectionTimeout.
    // TCP keepalive makes the OS probe the peer, get an RST on the dead tunnel,
    // and fire the pool's 'error' event so pg discards the dead client and
    // creates a fresh one. It also keeps each socket warm so the tunnel/NAT
    // doesn't idle them out. This is the pool-side half of the tunnel
    // self-healing (scripts/tunnel-watchdog.js is the tunnel-side half).
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  },
  pool: {
    min: config.database.poolMin,
    max: config.database.poolMax,
    // Reap idle conns every 30s; lets the pool recover from sticky trx leaks
    // without requiring a restart. Default is 1000ms which fights healthy
    // pool churn on the tunnel.
    idleTimeoutMillis: 30_000,
    reapIntervalMillis: 5_000,
    // Fail fast on create errors so we don't queue requests behind a dead
    // tunnel. Default propagates pool's create errors to the next waiter.
    propagateCreateError: false,
  },
  // 10s ceiling on waiting for a free conn. Anything longer is a pool leak,
  // not a slow query — surface it loudly instead of timing out at the 60s
  // knex default and hiding the leak as "slow DB."
  acquireConnectionTimeout: 10_000,
  debug: false,
});

/**
 * Per-request store for a transaction-bound knex handle. When a request opens
 * a transaction (typically via the RLS-context middleware), it stores the trx
 * here; the `db` proxy below routes every subsequent `db('table')`,
 * `db.raw(...)`, etc. call through that trx, so service code keeps using the
 * unchanged `db` import while still getting:
 *   - a single Postgres connection per request (sticky for the transaction),
 *   - reliable persistence of session-local settings such as
 *     `app.current_org_id` / `app.current_dev_member_id` for RLS.
 */
export const dbStore = new AsyncLocalStorage<{ trx: Knex.Transaction }>();

/** Underlying knex instance — escape hatch for code that needs the pool
 *  directly (migrations, transaction openers, init/destroy). Most app code
 *  should keep using the default `db` export instead. */
export const knexBase: Knex = knexInstance;

function activeKnex(): Knex {
  return dbStore.getStore()?.trx ?? knexInstance;
}

// Proxy the knex export: a function (db('table')) AND a namespace (db.raw, db.fn,
// db.schema, db.transaction, db.client, ...). Each property access and call
// resolves through the request-active knex (trx if in scope, else the pool).
export const db: Knex = new Proxy(knexInstance, {
  apply(_target, _thisArg, args) {
    return (activeKnex() as any)(...args);
  },
  get(_target, prop, _receiver) {
    const k = activeKnex() as any;
    const value = k[prop];
    return typeof value === "function" ? value.bind(k) : value;
  },
}) as unknown as Knex;

export async function initDatabase(): Promise<void> {
  try {
    await knexInstance.raw("SELECT 1");
    logger.info("Database connection established successfully");
  } catch (error) {
    logger.error("Failed to connect to database", error as Error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  await knexInstance.destroy();
  logger.info("Database connection closed");
}

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantScopedEntity extends BaseEntity {
  organizationId: string;
}

export * from "./repositories";
export * from "./posting-accounts";

// ─── Schema-aware safe insert / safe update ──────────────────────────────
//
// When the DB schema falls behind code (new column referenced by service
// code that hasn't been migrated yet), Postgres raises
// "column \"X\" of relation \"<table>\" does not exist" and the whole
// insert fails. `safeInsert` introspects the table's actual columns once
// (cached for the process lifetime), filters the payload to only known
// columns, and warns about the dropped fields so they don't disappear
// silently.
//
// Usage:
//   import { safeInsert } from "@vibestudio/database";
//   const [row] = await safeInsert("invoices", record).returning("*");
//
// Pair with the migration system, don't replace it — this keeps prod
// running while a migration is in flight, or while a hotfix env hasn't
// been migrated yet. After the migration runs, every column flows through
// normally because the cache discovers the new columns on first miss.

const columnCache = new Map<string, Set<string>>();

export async function getTableColumns(table: string, knexInstance: Knex = knexBase): Promise<Set<string>> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = await knexInstance("information_schema.columns")
    .where({ table_name: table, table_schema: "public" })
    .select<{ column_name: string }[]>("column_name");
  const cols = new Set(rows.map(r => r.column_name));
  columnCache.set(table, cols);
  return cols;
}

/**
 * Drop the cache for one table (or all tables if no arg). Call after a
 * migration that added/removed columns so subsequent inserts pick up the
 * new shape without a process restart.
 */
export function invalidateColumnCache(table?: string): void {
  if (table) columnCache.delete(table);
  else columnCache.clear();
}

interface SafeInsertOptions {
  /** When true, log a warning listing fields that were dropped (default true). */
  warnOnDrop?: boolean;
}

function filterRow(
  table: string,
  cols: Set<string>,
  row: Record<string, any>,
  warnOnDrop: boolean,
): Record<string, any> {
  const out: Record<string, any> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (cols.has(k)) out[k] = v;
    else if (v !== undefined && v !== null) dropped.push(k);
  }
  if (dropped.length && warnOnDrop) {
    logger.warn(`safeInsert(${table}): dropped unknown columns`, { dropped });
  }
  return out;
}

/**
 * Pre-warm the column cache for a table — call once at boot if you want to
 * use the synchronous `safeFilterSync`. Idempotent.
 */
export async function prefetchColumns(...tables: string[]): Promise<void> {
  await Promise.all(tables.map(t => getTableColumns(t)));
}

/**
 * Filter a payload to only columns that exist on the target table.
 * Returns the filtered payload — caller passes it into a normal Knex insert/update.
 *
 * Bug fix note: previous `safeInsert` returned `Promise<QueryBuilder>`, but
 * `await`-ing a Knex QueryBuilder *executes* it (they are thenable), so the
 * caller's `.returning('*')` chain ran on the result array → "not a function".
 * Returning the filtered data is the safe API.
 */
export async function safeFilter(
  table: string,
  data: Record<string, any> | Record<string, any>[],
  opts: SafeInsertOptions = {},
): Promise<Record<string, any> | Record<string, any>[]> {
  const cols = await getTableColumns(table);
  const warn = opts.warnOnDrop ?? true;
  return Array.isArray(data)
    ? data.map(r => filterRow(table, cols, r, warn))
    : filterRow(table, cols, data, warn);
}

/** Synchronous variant — column cache MUST be pre-warmed via `prefetchColumns`. */
export function safeFilterSync(
  table: string,
  data: Record<string, any> | Record<string, any>[],
  opts: SafeInsertOptions = {},
): Record<string, any> | Record<string, any>[] {
  const cols = columnCache.get(table);
  if (!cols) {
    throw new Error(
      `safeFilterSync(${table}): column cache cold. Call \`await prefetchColumns('${table}')\` first, or use the async \`safeFilter\`.`,
    );
  }
  const warn = opts.warnOnDrop ?? true;
  return Array.isArray(data)
    ? data.map(r => filterRow(table, cols, r, warn))
    : filterRow(table, cols, data, warn);
}

/**
 * One-shot helper for the common case: filter + insert + return rows.
 * Replaces the broken old `safeInsert` API. Caller awaits a single call:
 *
 *   const [created] = await safeInsertReturning('invoices', dbRecord, '*');
 */
export async function safeInsertReturning<T = any>(
  table: string,
  data: Record<string, any> | Record<string, any>[],
  returningCols: string | string[] = '*',
  opts: SafeInsertOptions = {},
): Promise<T[]> {
  const filtered = await safeFilter(table, data, opts);
  return db(table).insert(filtered as any).returning(returningCols as any) as unknown as Promise<T[]>;
}

/** Filter an update payload — caller passes the result to a normal Knex `.where(...).update(...)`. */
export async function safeUpdate(
  table: string,
  data: Record<string, any>,
  opts: SafeInsertOptions = {},
): Promise<Record<string, any>> {
  const filtered = await safeFilter(table, data, opts);
  return Array.isArray(filtered) ? (filtered[0] ?? {}) : filtered;
}

/** @deprecated — use `safeInsertReturning` or `await safeFilter` + normal Knex insert. */
export async function safeInsert(
  table: string,
  data: Record<string, any> | Record<string, any>[],
  opts: SafeInsertOptions = {},
): Promise<{ returning: (cols?: string | string[]) => Promise<any[]> }> {
  const filtered = await safeFilter(table, data, opts);
  return {
    returning: (cols: string | string[] = '*') =>
      db(table).insert(filtered as any).returning(cols as any) as unknown as Promise<any[]>,
  };
}
