"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantDatabasesService = void 0;
exports.maskConnectionHost = maskConnectionHost;
exports.resolveMigrationsDir = resolveMigrationsDir;
exports.orderTasksByParent = orderTasksByParent;
const common_1 = require("@nestjs/common");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/**
 * Promisified `execFile`, used to spawn the `drizzle-kit` CLI when provisioning a
 * dedicated database's schema (see `runSchemaSync`).
 */
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
/**
 * Postgres caps a single statement at 65535 bind parameters. The widest table we
 * copy (`tasks`) has ~20 columns, so 500 rows/statement (≈10k params) stays well
 * clear while keeping the number of round-trips reasonable.
 */
const COPY_CHUNK_SIZE = 500;
/**
 * §14.2 — optional dedicated-database tier for enterprise. Owns the registry of
 * org → dedicated Postgres mappings and the connection resolver that routes an
 * org's queries to its own database (when `active`) or the shared cluster.
 *
 * The injected `db` is the SHARED database — it holds the `tenant_databases`
 * registry itself. Dedicated handles are opened lazily via `getDb(connectionUrl)`.
 */
let TenantDatabasesService = class TenantDatabasesService {
    // The registry (`tenant_databases`) itself always lives on the SHARED cluster,
    // so this service injects the raw shared handle rather than the tenant-aware
    // proxy — its lookups must never be re-routed to a dedicated database by the
    // request-scoped routing it powers (that would also recurse through the proxy).
    constructor(db) {
        this.db = db;
        /**
         * Per-organization cache of dedicated `Db` handles. `getDb(connectionUrl)`
         * opens a connection pool, so we memoize the handle per org to avoid
         * recreating a pool on every resolve. Invalidated whenever the row's
         * connection or status changes (upsert / disable / remove / failed test).
         */
        this.handles = new Map();
    }
    // ---- Registry CRUD (super-admin only; the gate is enforced in the controller)
    /** All registry entries, masked. Never exposes any raw connection string. */
    async listAll() {
        const rows = await this.db.select().from(db_1.tenantDatabases);
        return rows.map((row) => this.toView(row));
    }
    /** A single org's registry entry, masked, or null when none is configured. */
    async getForOrg(orgId) {
        const [row] = await this.db
            .select()
            .from(db_1.tenantDatabases)
            .where((0, drizzle_orm_1.eq)(db_1.tenantDatabases.organizationId, orgId))
            .limit(1);
        return row ? this.toView(row) : null;
    }
    /** Create or replace an org's dedicated-database mapping. Returns the masked view. */
    async upsertForOrg(orgId, input) {
        const status = input.status ?? 'pending';
        const label = input.label ?? null;
        const [row] = await this.db
            .insert(db_1.tenantDatabases)
            .values({ organizationId: orgId, connectionUrl: input.connectionUrl, label, status })
            .onConflictDoUpdate({
            target: db_1.tenantDatabases.organizationId,
            set: { connectionUrl: input.connectionUrl, label, status, updatedAt: new Date() },
        })
            .returning();
        // The connection may have changed — drop any cached handle for this org.
        this.handles.delete(orgId);
        return this.toView(row);
    }
    /** Flip an org's mapping to `disabled` (stops routing) without deleting it. */
    async disable(orgId) {
        const [row] = await this.db
            .update(db_1.tenantDatabases)
            .set({ status: 'disabled', updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.tenantDatabases.organizationId, orgId))
            .returning();
        this.handles.delete(orgId);
        return row ? this.toView(row) : null;
    }
    /** Permanently remove an org's mapping and drop any cached handle. */
    async remove(orgId) {
        await this.db.delete(db_1.tenantDatabases).where((0, drizzle_orm_1.eq)(db_1.tenantDatabases.organizationId, orgId));
        this.handles.delete(orgId);
        return { ok: true };
    }
    // ---- Connection resolver -------------------------------------------------
    /**
     * Resolve the `Db` handle an organization's queries should run against.
     *
     * If an ACTIVE `tenant_databases` row exists, returns a dedicated
     * `getDb(connectionUrl)` handle (cached per-org so the pool is reused);
     * otherwise falls back to the SHARED db. This is the routing foundation:
     * per-request routing is OPT-IN (callers choose to consult this resolver) and
     * moving an org's existing rows onto its dedicated database is a separate OPS
     * step — flipping a mapping to `active` only changes where NEW queries are
     * sent, it does not migrate data.
     */
    async getDbForOrganization(orgId) {
        const cached = this.handles.get(orgId);
        if (cached)
            return cached;
        const [row] = await this.db
            .select()
            .from(db_1.tenantDatabases)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tenantDatabases.organizationId, orgId), (0, drizzle_orm_1.eq)(db_1.tenantDatabases.status, 'active')))
            .limit(1);
        // No active dedicated database — stay on the shared cluster. We intentionally
        // do NOT cache this fallback so a later activation is picked up immediately.
        if (!row)
            return this.db;
        const handle = (0, db_1.getDb)(row.connectionUrl);
        this.handles.set(orgId, handle);
        return handle;
    }
    /**
     * Connect to the org's dedicated database and run `select 1`, updating
     * `status`/`lastCheckedAt` accordingly (active on success, disabled on
     * failure). Never throws to the caller — always resolves to a result object.
     */
    async testConnection(orgId) {
        const start = Date.now();
        try {
            const [row] = await this.db
                .select()
                .from(db_1.tenantDatabases)
                .where((0, drizzle_orm_1.eq)(db_1.tenantDatabases.organizationId, orgId))
                .limit(1);
            if (!row) {
                return { ok: false, status: 'pending', error: 'No dedicated database configured for this organization' };
            }
            const handle = (0, db_1.getDb)(row.connectionUrl);
            try {
                await handle.execute((0, drizzle_orm_1.sql) `select 1`);
            }
            catch (err) {
                // Connection is unhealthy — drop the cached handle and mark it disabled.
                this.handles.delete(orgId);
                await this.markStatus(orgId, 'disabled').catch(() => undefined);
                return { ok: false, status: 'disabled', error: err.message };
            }
            this.handles.set(orgId, handle);
            await this.markStatus(orgId, 'active');
            return { ok: true, status: 'active', latencyMs: Date.now() - start };
        }
        catch (err) {
            // Registry lookup / status write failed on the shared db — still never throw.
            return { ok: false, status: 'pending', error: err.message };
        }
    }
    // ---- Provisioning + data migration (super-admin only) --------------------
    /**
     * Physically provision the org's dedicated database so an empty database ends up
     * with the full Rundesk schema.
     *
     * MECHANISM — declarative schema sync via `drizzle-kit push --force`, the SAME
     * mechanism the shared DB's own `db:setup` uses (see packages/db package.json).
     * The repo's hand-written migration files are NOT in drizzle-migrator format
     * (they carry no `--> statement-breakpoint` markers), so the file migrator
     * (`migrate()`) FAILS against a fresh empty database. `push` diffs the schema
     * modules against the live DB and applies the delta declaratively, which builds
     * the full schema cleanly on an empty database.
     *
     * Closes the §14.2 caveat's "provisioning is an ops step": the app now owns
     * schema creation. Never touches the shared cluster — the shared handle is used
     * only to look up the registry row (the connection secret); the push and its
     * verification run exclusively against the dedicated database.
     *
     * Guard: only runs when the org has a `tenant_databases` (dedicated-database)
     * row — otherwise throws NotFoundException. Sync / verification failures are
     * caught and returned as `{ ok: false, error }`; this method never crashes.
     */
    async provisionSchema(orgId) {
        const row = await this.getDedicatedRowOrThrow(orgId);
        // 1) Declaratively sync the schema onto the dedicated DB (drizzle-kit push).
        try {
            await this.runSchemaSync(row.connectionUrl);
        }
        catch (err) {
            return { ok: false, organizationId: orgId, error: `Provisioning failed: ${err.message}` };
        }
        // 2) Verify the push landed: open the dedicated connection and confirm the
        //    core tables now exist. `to_regclass` returns NULL for a missing table
        //    (never throws), so this single round-trip both proves the schema is
        //    present and doubles as a health check.
        let handle;
        try {
            handle = this.openDedicatedConnection(row.connectionUrl);
        }
        catch (err) {
            return { ok: false, organizationId: orgId, error: `Failed to open dedicated connection: ${err.message}` };
        }
        try {
            const rows = (await handle.execute((0, drizzle_orm_1.sql) `select to_regclass('public.workspaces') is not null and to_regclass('public.tasks') is not null as present`));
            const provisioned = Boolean(rows[0]?.present);
            if (!provisioned) {
                return {
                    ok: false,
                    organizationId: orgId,
                    error: 'Schema sync completed but the core tables (workspaces/tasks) are still missing',
                };
            }
            return { ok: true, organizationId: orgId, provisioned, method: 'drizzle-kit push --force' };
        }
        catch (err) {
            return { ok: false, organizationId: orgId, error: `Schema verification failed: ${err.message}` };
        }
    }
    /**
     * Report whether an org's dedicated database is reachable and already carries
     * the Rundesk schema — so an admin UI/endpoint can show "provisioned" vs
     * "needs-provisioning". Presence is probed with a sentinel: does the core
     * `workspaces` table exist? The same round-trip doubles as a health check (an
     * unreachable DB throws on `execute`, reported as `reachable: false`).
     *
     * Guard: throws NotFoundException when the org has no dedicated-database row.
     * Connection failures are caught and returned, never thrown.
     */
    async getSchemaStatus(orgId) {
        const row = await this.getDedicatedRowOrThrow(orgId);
        let handle;
        try {
            handle = this.openDedicatedConnection(row.connectionUrl);
        }
        catch (err) {
            return { ok: false, organizationId: orgId, reachable: false, provisioned: false, error: err.message };
        }
        try {
            // `to_regclass` returns NULL for a missing table instead of raising, so this
            // single query is both the health check (throws only if unreachable) and the
            // schema-presence sentinel.
            const rows = (await handle.execute((0, drizzle_orm_1.sql) `select to_regclass('public.workspaces') is not null as present`));
            const provisioned = Boolean(rows[0]?.present);
            const appliedMigrations = await this.countAppliedMigrations(handle);
            return {
                ok: true,
                organizationId: orgId,
                reachable: true,
                provisioned,
                appliedMigrations,
                state: provisioned ? 'provisioned' : 'needs-provisioning',
            };
        }
        catch (err) {
            return { ok: false, organizationId: orgId, reachable: false, provisioned: false, error: err.message };
        }
    }
    /**
     * Copy an organization's data from the SHARED database to its dedicated
     * database, in FK-dependency order, idempotently (`insert … on conflict do
     * nothing`). Supports `dryRun` — report the row counts that WOULD be copied
     * without writing anything.
     *
     * SCOPE — HONEST NOTE: this covers the CORE identity + hierarchy tree only, NOT
     * a full copy of all ~70 tables. The ordered `plan` below is the authoritative
     * coverage list:
     *
     *   users → organizations → organization_members → workspaces →
     *   workspace_members → clients → spaces → space_members → folders →
     *   projects → project_members → lists → tasks → task_assignees
     *
     * `users` is seeded first with exactly the identity rows the copied tree
     * references (members + every `created_by`/`added_by`/assignee) so the copy is
     * FK-complete for this subtree. `tasks` are topologically ordered by
     * `parent_task_id` so a subtask never lands before its parent.
     *
     * Peripheral / workspace-scoped tables (comments, attachments, docs, labels,
     * custom fields, time entries, views, automations, …) are intentionally NOT
     * copied yet. Each can be appended to `plan` at the correct position following
     * the same read-then-chunked-insert pattern; nothing here claims to be a full
     * tenant clone.
     *
     * Guard: throws NotFoundException when the org has no dedicated-database row.
     * Connection / query failures are caught and returned, never thrown. Writes go
     * ONLY to the dedicated handle; the shared DB is read-only here.
     */
    async migrateOrgData(orgId, opts = {}) {
        const dryRun = opts.dryRun ?? false;
        const row = await this.getDedicatedRowOrThrow(orgId);
        let target;
        try {
            target = this.openDedicatedConnection(row.connectionUrl);
        }
        catch (err) {
            return {
                ok: false,
                organizationId: orgId,
                dryRun,
                tables: [],
                totalFound: 0,
                totalInserted: 0,
                error: `Failed to open dedicated connection: ${err.message}`,
            };
        }
        // Source is ALWAYS the shared cluster (the registry handle). We only ever read
        // from it here; every write targets the dedicated `target` handle.
        const source = this.db;
        try {
            // ---- Phase 1: read the org's core row-tree from the shared db ----
            const orgRows = await source.select().from(db_1.organizations).where((0, drizzle_orm_1.eq)(db_1.organizations.id, orgId));
            const orgMemberRows = await source
                .select()
                .from(db_1.organizationMembers)
                .where((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, orgId));
            const workspaceRows = await source.select().from(db_1.workspaces).where((0, drizzle_orm_1.eq)(db_1.workspaces.organizationId, orgId));
            const workspaceIds = workspaceRows.map((w) => w.id);
            const workspaceMemberRows = workspaceIds.length
                ? await source.select().from(db_1.workspaceMembers).where((0, drizzle_orm_1.inArray)(db_1.workspaceMembers.workspaceId, workspaceIds))
                : [];
            const clientRows = workspaceIds.length
                ? await source.select().from(db_1.clients).where((0, drizzle_orm_1.inArray)(db_1.clients.workspaceId, workspaceIds))
                : [];
            const spaceRows = workspaceIds.length
                ? await source.select().from(db_1.spaces).where((0, drizzle_orm_1.inArray)(db_1.spaces.workspaceId, workspaceIds))
                : [];
            const spaceIds = spaceRows.map((s) => s.id);
            const spaceMemberRows = spaceIds.length
                ? await source.select().from(db_1.spaceMembers).where((0, drizzle_orm_1.inArray)(db_1.spaceMembers.spaceId, spaceIds))
                : [];
            const folderRows = spaceIds.length
                ? await source.select().from(db_1.folders).where((0, drizzle_orm_1.inArray)(db_1.folders.spaceId, spaceIds))
                : [];
            const projectRows = spaceIds.length
                ? await source.select().from(db_1.projects).where((0, drizzle_orm_1.inArray)(db_1.projects.spaceId, spaceIds))
                : [];
            const projectIds = projectRows.map((p) => p.id);
            const projectMemberRows = projectIds.length
                ? await source.select().from(db_1.projectMembers).where((0, drizzle_orm_1.inArray)(db_1.projectMembers.projectId, projectIds))
                : [];
            const listRows = projectIds.length
                ? await source.select().from(db_1.lists).where((0, drizzle_orm_1.inArray)(db_1.lists.projectId, projectIds))
                : [];
            const listIds = listRows.map((l) => l.id);
            const taskRows = listIds.length
                ? await source.select().from(db_1.tasks).where((0, drizzle_orm_1.inArray)(db_1.tasks.listId, listIds))
                : [];
            const taskIds = taskRows.map((t) => t.id);
            const taskAssigneeRows = taskIds.length
                ? await source.select().from(db_1.taskAssignees).where((0, drizzle_orm_1.inArray)(db_1.taskAssignees.taskId, taskIds))
                : [];
            // Every user identity the copied tree points at (members + creators +
            // adders + assignees). Copying exactly this set keeps all user FKs valid on
            // the dedicated DB without leaking users from other tenants.
            const userIds = new Set();
            for (const r of orgMemberRows)
                userIds.add(r.userId);
            for (const r of workspaceMemberRows)
                userIds.add(r.userId);
            for (const r of spaceMemberRows) {
                userIds.add(r.userId);
                if (r.addedById)
                    userIds.add(r.addedById);
            }
            for (const r of projectMemberRows) {
                userIds.add(r.userId);
                if (r.addedById)
                    userIds.add(r.addedById);
            }
            for (const r of clientRows)
                if (r.createdById)
                    userIds.add(r.createdById);
            for (const r of spaceRows)
                if (r.createdById)
                    userIds.add(r.createdById);
            for (const r of folderRows)
                if (r.createdById)
                    userIds.add(r.createdById);
            for (const r of projectRows)
                if (r.createdById)
                    userIds.add(r.createdById);
            for (const r of listRows)
                if (r.createdById)
                    userIds.add(r.createdById);
            for (const r of taskRows)
                if (r.createdById)
                    userIds.add(r.createdById);
            for (const r of taskAssigneeRows)
                userIds.add(r.userId);
            const userIdList = [...userIds];
            const userRows = userIdList.length
                ? await source.select().from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, userIdList))
                : [];
            // ---- Phase 2: write to the dedicated db, in FK-dependency order ----
            // (documented coverage list — see the method doc-comment).
            const plan = [
                { table: 'users', tbl: db_1.users, rows: userRows },
                { table: 'organizations', tbl: db_1.organizations, rows: orgRows },
                { table: 'organization_members', tbl: db_1.organizationMembers, rows: orgMemberRows },
                { table: 'workspaces', tbl: db_1.workspaces, rows: workspaceRows },
                { table: 'workspace_members', tbl: db_1.workspaceMembers, rows: workspaceMemberRows },
                { table: 'clients', tbl: db_1.clients, rows: clientRows },
                { table: 'spaces', tbl: db_1.spaces, rows: spaceRows },
                { table: 'space_members', tbl: db_1.spaceMembers, rows: spaceMemberRows },
                { table: 'folders', tbl: db_1.folders, rows: folderRows },
                { table: 'projects', tbl: db_1.projects, rows: projectRows },
                { table: 'project_members', tbl: db_1.projectMembers, rows: projectMemberRows },
                { table: 'lists', tbl: db_1.lists, rows: listRows },
                // Parents before children so a subtask never violates the self-FK.
                { table: 'tasks', tbl: db_1.tasks, rows: orderTasksByParent(taskRows) },
                { table: 'task_assignees', tbl: db_1.taskAssignees, rows: taskAssigneeRows },
            ];
            const tables = [];
            let totalFound = 0;
            let totalInserted = 0;
            for (const step of plan) {
                const found = step.rows.length;
                let inserted = 0;
                if (!dryRun && found > 0) {
                    inserted = await this.copyRows(target, step.tbl, step.rows);
                }
                tables.push({ table: step.table, found, inserted });
                totalFound += found;
                totalInserted += inserted;
            }
            return { ok: true, organizationId: orgId, dryRun, tables, totalFound, totalInserted };
        }
        catch (err) {
            return {
                ok: false,
                organizationId: orgId,
                dryRun,
                tables: [],
                totalFound: 0,
                totalInserted: 0,
                error: err.message,
            };
        }
    }
    // ---- seams (overridable in tests) ----------------------------------------
    /**
     * Open a pooled handle to a dedicated database by its DSN. Thin wrapper over
     * `getDb` so tests can substitute an in-memory fake. NEVER returns the shared
     * handle — the caller has already resolved this DSN from the registry.
     */
    openDedicatedConnection(connectionUrl) {
        return (0, db_1.getDb)(connectionUrl);
    }
    /**
     * Declaratively sync the full Rundesk schema onto the database at
     * `connectionUrl` by shelling out to `drizzle-kit push --force` — the SAME
     * mechanism the shared DB's `db:setup` uses. Runs from the `packages/db`
     * directory (which holds `drizzle.config.ts`) with the dedicated DSN injected as
     * `DATABASE_URL`, so the push targets the dedicated database and nothing else.
     *
     * RUNTIME REQUIREMENT: this needs the drizzle-kit toolchain available at runtime
     * — it is a `packages/db` devDependency, the SAME requirement as running
     * `db:setup` for the shared cluster. A missing binary (spawn ENOENT) is caught
     * and surfaced as a clear, actionable message rather than crashing the request.
     *
     * Isolated as a protected seam so tests can override it without spawning a
     * process.
     */
    async runSchemaSync(connectionUrl) {
        // resolveMigrationsDir() -> <repo>/packages/db/src/migrations; two dirnames up
        // is <repo>/packages/db, the cwd drizzle-kit needs to find drizzle.config.ts.
        const packagesDbDir = node_path_1.default.dirname(node_path_1.default.dirname(resolveMigrationsDir()));
        try {
            await execFileAsync('npx', ['drizzle-kit', 'push', '--force'], {
                cwd: packagesDbDir,
                // Point the push at the dedicated database, leaving the rest of the env intact.
                env: { ...process.env, DATABASE_URL: connectionUrl },
                timeout: 180_000,
            });
        }
        catch (err) {
            const e = err;
            // Spawn failure: the drizzle-kit CLI isn't installed/available at runtime.
            if (e.code === 'ENOENT') {
                throw new Error('drizzle-kit CLI not found — the drizzle-kit toolchain (a packages/db devDependency) must be ' +
                    'available at runtime to provision a dedicated schema (same requirement as db:setup)');
            }
            if (e.killed) {
                throw new Error('drizzle-kit push timed out before the schema finished syncing');
            }
            // Non-zero exit — surface stderr so the failure reason is actionable.
            const stderr = e.stderr?.trim();
            throw new Error(`drizzle-kit push failed: ${stderr || e.message}`);
        }
    }
    // ---- helpers -------------------------------------------------------------
    /** Registry row for the org, or NotFoundException when no dedicated DB is configured. */
    async getDedicatedRowOrThrow(orgId) {
        const [row] = await this.db
            .select()
            .from(db_1.tenantDatabases)
            .where((0, drizzle_orm_1.eq)(db_1.tenantDatabases.organizationId, orgId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('No dedicated database configured for this organization');
        return row;
    }
    /**
     * Count rows in the dedicated DB's Drizzle migration ledger. Returns 0 (rather
     * than throwing) when the ledger table doesn't exist yet — the signal of a
     * never-provisioned database.
     */
    async countAppliedMigrations(handle) {
        try {
            const rows = (await handle.execute((0, drizzle_orm_1.sql) `select count(*)::int as count from drizzle.__drizzle_migrations`));
            return Number(rows[0]?.count ?? 0);
        }
        catch {
            return 0;
        }
    }
    /**
     * Idempotently copy `rows` into `table` on the dedicated handle, chunked to
     * respect Postgres' bind-parameter cap. `on conflict do nothing` makes re-runs
     * safe; `returning({ id })` yields the count actually inserted (found − inserted
     * = rows already present).
     */
    // drizzle's insert builder is typed per-table; this helper copies heterogeneous
    // tables generically, so `table`/`rows` are intentionally `any` here (the whole
    // point is a single code path over all 14 tables in the plan).
    async copyRows(target, table, rows) {
        let inserted = 0;
        for (let i = 0; i < rows.length; i += COPY_CHUNK_SIZE) {
            const chunk = rows.slice(i, i + COPY_CHUNK_SIZE);
            const returned = await target
                .insert(table)
                .values(chunk)
                .onConflictDoNothing()
                .returning({ id: table.id });
            inserted += returned.length;
        }
        return inserted;
    }
    async markStatus(orgId, status) {
        await this.db
            .update(db_1.tenantDatabases)
            .set({ status, lastCheckedAt: new Date(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.tenantDatabases.organizationId, orgId));
    }
    /** Project a row to the masked, client-safe view. NEVER exposes connectionUrl. */
    toView(row) {
        return {
            organizationId: row.organizationId,
            status: row.status,
            label: row.label,
            host: maskConnectionHost(row.connectionUrl),
            lastCheckedAt: row.lastCheckedAt,
        };
    }
};
exports.TenantDatabasesService = TenantDatabasesService;
exports.TenantDatabasesService = TenantDatabasesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.SHARED_DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], TenantDatabasesService);
/**
 * Reduce a Postgres DSN to just its `host:port` so the registry can show which
 * server an org points at without ever leaking credentials or the database
 * name. Unparseable values collapse to `***`.
 */
function maskConnectionHost(connectionUrl) {
    try {
        const url = new URL(connectionUrl);
        return url.host || '***';
    }
    catch {
        return '***';
    }
}
/**
 * Locate the Drizzle migrations folder (`packages/db/src/migrations`) at runtime,
 * robustly across dev (ts-node/tsx), tests (tsx), and the compiled build:
 *
 *  1. `RUNDESK_MIGRATIONS_DIR` env override (for containers that ship migrations
 *     at a fixed path), when it actually contains `meta/_journal.json`.
 *  2. Resolve the `@rundesk/db` package entry (`.../packages/db/src/index.ts`)
 *     and use its sibling `migrations/` folder — the same folder drizzle.config's
 *     `out` points at. This is the primary mechanism.
 *
 * Throws a clear error (rather than silently pointing at a non-existent folder)
 * when neither locates a valid migrations directory.
 */
function resolveMigrationsDir() {
    const journalRel = node_path_1.default.join('meta', '_journal.json');
    const override = process.env.RUNDESK_MIGRATIONS_DIR;
    if (override && (0, node_fs_1.existsSync)(node_path_1.default.join(override, journalRel)))
        return override;
    try {
        // require.resolve('@rundesk/db') -> <repo>/packages/db/src/index.ts.
        // Migrations live in the sibling `migrations/` directory.
        const pkgEntry = require.resolve('@rundesk/db');
        const candidate = node_path_1.default.join(node_path_1.default.dirname(pkgEntry), 'migrations');
        if ((0, node_fs_1.existsSync)(node_path_1.default.join(candidate, journalRel)))
            return candidate;
    }
    catch {
        // require.resolve unavailable or package not found — fall through to error.
    }
    throw new Error('Could not locate the Rundesk migrations folder (packages/db/src/migrations); ' +
        'set RUNDESK_MIGRATIONS_DIR to its absolute path');
}
/**
 * Order tasks so every parent precedes its children (topological by
 * `parentTaskId`), so a chunked `insert` never violates the self-referencing
 * `tasks.parent_task_id` FK. Parents outside the set are ignored; cycles (which
 * a well-formed task tree never has) are broken defensively via the `visiting`
 * guard rather than recursing forever.
 */
function orderTasksByParent(rows) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const emitted = new Set();
    const visiting = new Set();
    const out = [];
    const visit = (r) => {
        if (emitted.has(r.id) || visiting.has(r.id))
            return;
        visiting.add(r.id);
        if (r.parentTaskId) {
            const parent = byId.get(r.parentTaskId);
            if (parent)
                visit(parent);
        }
        visiting.delete(r.id);
        emitted.add(r.id);
        out.push(r);
    };
    for (const r of rows)
        visit(r);
    return out;
}
//# sourceMappingURL=tenant-databases.service.js.map