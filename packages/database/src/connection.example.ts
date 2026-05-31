/**
 * REFERENCE — copy this pattern into your existing Knex bootstrap.
 *
 *   Local:  runtime.database.url → postgres://vibestudio:postgres@localhost:5432/vibestudio
 *   Remote: runtime.database.url → postgres://vibestudio:****@127.0.0.1:5545/vibestudio?sslmode=require
 *
 * The application code below is identical in both cases. The switch
 * happens in @vibestudio/config/runtime — never here.
 */
import knex, { Knex } from "knex";
import { runtime } from "@vibestudio/config";

let _db: Knex | undefined;

export function getDb(): Knex {
  if (_db) return _db;
  _db = knex({
    client: "pg",
    connection: {
      connectionString: runtime.database.url,
      ssl: runtime.database.ssl ? { rejectUnauthorized: true } : false,
    },
    pool: runtime.database.pool,
  });
  return _db;
}
