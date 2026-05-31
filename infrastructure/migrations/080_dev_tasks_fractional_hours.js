/**
 * Migration 080 — Allow fractional hours on dev_tasks time columns.
 *
 * The dev portal task form lets users enter hours with `step="0.5"` (e.g.
 * 4.5h, 7.5h), but the underlying columns were declared `integer`, so any
 * fractional value caused
 *   "invalid input syntax for type integer: \"4.5\""
 * and a 500 from POST /projects/:id/tasks.
 *
 * Promote the four hour-bearing columns to numeric(8,2): up to ~999,999.99h
 * is well past anything realistic, two decimal places covers 0.5h or 0.25h
 * granularity comfortably. Existing integer values cast losslessly.
 */

const COLUMNS = ["time_estimate", "time_spent", "estimated_hours", "actual_hours"];

exports.up = async function (knex) {
  for (const col of COLUMNS) {
    if (!(await knex.schema.hasColumn("dev_tasks", col))) continue;
    await knex.raw(`ALTER TABLE "dev_tasks" ALTER COLUMN "${col}" TYPE numeric(8,2) USING "${col}"::numeric`);
  }
};

exports.down = async function (knex) {
  for (const col of COLUMNS) {
    if (!(await knex.schema.hasColumn("dev_tasks", col))) continue;
    // Round any fractional values before casting back to integer to avoid
    // "cannot cast type numeric to integer" on rows with decimals.
    await knex.raw(`ALTER TABLE "dev_tasks" ALTER COLUMN "${col}" TYPE integer USING ROUND("${col}")::integer`);
  }
};
