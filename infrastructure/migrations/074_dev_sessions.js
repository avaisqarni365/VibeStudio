/**
 * Migration 074: dev_sessions — mirrors user_sessions for the developer portal.
 *
 * Audit item B-5. Lets devAuth enforce per-token revocation the same way the
 * main-app authenticate middleware does (A-1), and gives dev users a list of
 * their active sessions (potentially exposed in the portal UI later).
 *
 * Safe-idempotent: skipped if the table already exists.
 */

exports.up = async function (knex) {
  if (await knex.schema.hasTable("dev_sessions")) return;
  if (!(await knex.schema.hasTable("dev_team_members"))) return;

  await knex.schema.createTable("dev_sessions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("dev_member_id").notNullable()
      .references("id").inTable("dev_team_members").onDelete("CASCADE");
    t.string("platform", 50).notNullable().defaultTo("web");
    t.string("ip_address", 45);
    t.string("user_agent", 500);
    t.string("token_hash", 255).notNullable();
    t.boolean("is_active").defaultTo(true);
    t.timestamp("expires_at", { useTz: true });
    t.timestamp("last_activity_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("revoked_at", { useTz: true });
    t.string("revoked_reason", 255);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["dev_member_id", "is_active"]);
    t.index(["token_hash"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("dev_sessions");
};
