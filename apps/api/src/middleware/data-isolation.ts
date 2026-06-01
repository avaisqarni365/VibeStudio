/**
 * Per-request data isolation for the dev portal.
 *
 * Opens ONE transaction for the request, sets the RLS GUC
 * `app.current_dev_member_id` to the authenticated member, and runs the rest of
 * the request inside that transaction via AsyncLocalStorage. The `db` proxy in
 * `@vibestudio/database` routes every query through the request-active trx
 * (`dbStore`), so RLS policies on `dev_*` tables scope to the member when RLS is
 * enabled (migration 079). The trx commits on response finish, rolls back on error.
 *
 * (This middleware is referenced by `devAuth` in routes/dev-portal.ts. It was
 * missing after the standalone extraction — recreated 2026-06-01.)
 */
import { knexBase, dbStore } from "@vibestudio/database";

export function withRlsTransaction(req: any, res: any, next: any): void {
  const memberId = req.devUser?.devMemberId;
  const memberRole = req.devUser?.role;

  knexBase
    .transaction(
      (trx: any) =>
        new Promise<void>((resolve, reject) => {
          // Resolve (→ commit) once the response is fully sent.
          const done = () => resolve();
          res.once("finish", done);
          res.once("close", done);

          (async () => {
            if (memberId) {
              // SET LOCAL (transaction-scoped) so pooled connections don't leak context.
              await trx.raw("SELECT set_config('app.current_dev_member_id', ?, true)", [String(memberId)]);
              // Role GUC drives the CEO super-admin RLS bypass (migration 087).
              await trx.raw("SELECT set_config('app.current_dev_member_role', ?, true)", [String(memberRole || "")]);
            }
            // Run the remainder of the request within the trx's ALS scope.
            dbStore.run({ trx }, () => next());
          })().catch(reject);
        }),
    )
    .catch((err: any) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: { code: "DB_TX_ERROR", message: err?.message || "Request transaction failed" } });
      }
    });
}
