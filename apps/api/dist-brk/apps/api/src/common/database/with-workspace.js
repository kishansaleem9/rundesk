"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withWorkspace = withWorkspace;
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Run `fn` inside a transaction whose Postgres session has
 * `app.current_workspace_id` pinned to `workspaceId` (via `SET LOCAL`, so it is
 * scoped to — and rolled back with — this transaction).
 *
 * This is the tenant-context plumbing for the row-level-security policies added
 * in migration 0071. Those policies gate every workspace-scoped table on
 * `app.rls_current_workspace_id()`, which reads exactly this GUC.
 *
 * IMPORTANT — this is defense-in-depth, not the app's primary access control:
 *   * The app connects to Postgres as the table OWNER, and a table owner
 *     BYPASSES RLS unless the table is FORCEd (0071 never FORCEs). So for the
 *     current owner connection this helper is a behavioral NO-OP: it sets the
 *     GUC, but RLS is not consulted, and every query behaves exactly as before.
 *   * The value is realized when a restricted (non-owner, non-superuser,
 *     non-BYPASSRLS) role is used — e.g. a future per-tenant connection, a
 *     read-only BI/support role, or a blast-radius limit on leaked
 *     credentials. Then RLS confines that role to the pinned workspace.
 *
 * Adoption (opt-in, incremental — no existing call site is required to change):
 * a service that already knows the request's workspace can wrap its DB work:
 *
 *   return withWorkspace(this.db, workspaceId, (tx) =>
 *     tx.select().from(tasks).where(...),
 *   )
 *
 * Or drive it centrally from a NestJS interceptor/middleware once request
 * context carries the workspace id. Because `SET LOCAL` is transaction-scoped,
 * connection pooling is safe: the setting never leaks to the next checkout.
 *
 * @param db          the injected drizzle database (DB_TOKEN)
 * @param workspaceId the tenant to pin; must be a UUID string
 * @param fn          receives the transactional db bound to that tenant context
 */
function withWorkspace(db, workspaceId, fn) {
    return db.transaction(async (tx) => {
        // set_config(setting, value, is_local=true) === SET LOCAL, but parameterized
        // so the workspace id is bound safely rather than string-interpolated.
        await tx.execute((0, drizzle_orm_1.sql) `select set_config('app.current_workspace_id', ${workspaceId}, true)`);
        return fn(tx);
    });
}
//# sourceMappingURL=with-workspace.js.map