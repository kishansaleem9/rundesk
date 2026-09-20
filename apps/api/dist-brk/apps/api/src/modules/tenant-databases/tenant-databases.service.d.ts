import type { Db } from '@rundesk/db';
export type TenantDatabaseStatus = 'pending' | 'active' | 'disabled';
/**
 * Masked, client-safe projection of a `tenant_databases` row. The raw
 * `connectionUrl` is a server-only secret and is NEVER included here — callers
 * see only the status, an optional label, a masked `host` (host:port) and the
 * last health-check timestamp.
 */
export type TenantDatabaseView = {
    organizationId: string;
    status: TenantDatabaseStatus;
    label: string | null;
    host: string;
    lastCheckedAt: Date | null;
};
export type TestConnectionResult = {
    ok: true;
    status: TenantDatabaseStatus;
    latencyMs: number;
} | {
    ok: false;
    status: TenantDatabaseStatus;
    error: string;
};
/** Result of provisioning an org's dedicated-database schema via `drizzle-kit push`. */
export type ProvisionSchemaResult = {
    ok: true;
    organizationId: string;
    /** True once the declarative push has produced the core schema (verified present). */
    provisioned: boolean;
    /** The mechanism used — declarative schema sync, matching `db:setup`. */
    method: 'drizzle-kit push --force';
} | {
    ok: false;
    organizationId: string;
    error: string;
};
/** Whether an org's dedicated database has the Rundesk schema + is reachable. */
export type SchemaStatusResult = {
    ok: true;
    organizationId: string;
    reachable: true;
    provisioned: boolean;
    /** Migrations recorded in the dedicated DB's ledger (0 if never provisioned). */
    appliedMigrations: number;
    state: 'provisioned' | 'needs-provisioning';
} | {
    ok: false;
    organizationId: string;
    reachable: false;
    provisioned: false;
    error: string;
};
/** Per-table copy tally for a data migration (shared → dedicated). */
export type MigrateTableReport = {
    table: string;
    found: number;
    inserted: number;
};
export type MigrateOrgDataResult = {
    ok: boolean;
    organizationId: string;
    dryRun: boolean;
    /** Tables copied, in FK-dependency order, with source-row and inserted-row counts. */
    tables: MigrateTableReport[];
    totalFound: number;
    totalInserted: number;
    error?: string;
};
/**
 * §14.2 — optional dedicated-database tier for enterprise. Owns the registry of
 * org → dedicated Postgres mappings and the connection resolver that routes an
 * org's queries to its own database (when `active`) or the shared cluster.
 *
 * The injected `db` is the SHARED database — it holds the `tenant_databases`
 * registry itself. Dedicated handles are opened lazily via `getDb(connectionUrl)`.
 */
export declare class TenantDatabasesService {
    private db;
    /**
     * Per-organization cache of dedicated `Db` handles. `getDb(connectionUrl)`
     * opens a connection pool, so we memoize the handle per org to avoid
     * recreating a pool on every resolve. Invalidated whenever the row's
     * connection or status changes (upsert / disable / remove / failed test).
     */
    private readonly handles;
    constructor(db: Db);
    /** All registry entries, masked. Never exposes any raw connection string. */
    listAll(): Promise<TenantDatabaseView[]>;
    /** A single org's registry entry, masked, or null when none is configured. */
    getForOrg(orgId: string): Promise<TenantDatabaseView | null>;
    /** Create or replace an org's dedicated-database mapping. Returns the masked view. */
    upsertForOrg(orgId: string, input: {
        connectionUrl: string;
        label?: string | null;
        status?: TenantDatabaseStatus;
    }): Promise<TenantDatabaseView>;
    /** Flip an org's mapping to `disabled` (stops routing) without deleting it. */
    disable(orgId: string): Promise<TenantDatabaseView | null>;
    /** Permanently remove an org's mapping and drop any cached handle. */
    remove(orgId: string): Promise<{
        ok: true;
    }>;
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
    getDbForOrganization(orgId: string): Promise<Db>;
    /**
     * Connect to the org's dedicated database and run `select 1`, updating
     * `status`/`lastCheckedAt` accordingly (active on success, disabled on
     * failure). Never throws to the caller — always resolves to a result object.
     */
    testConnection(orgId: string): Promise<TestConnectionResult>;
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
    provisionSchema(orgId: string): Promise<ProvisionSchemaResult>;
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
    getSchemaStatus(orgId: string): Promise<SchemaStatusResult>;
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
    migrateOrgData(orgId: string, opts?: {
        dryRun?: boolean;
    }): Promise<MigrateOrgDataResult>;
    /**
     * Open a pooled handle to a dedicated database by its DSN. Thin wrapper over
     * `getDb` so tests can substitute an in-memory fake. NEVER returns the shared
     * handle — the caller has already resolved this DSN from the registry.
     */
    protected openDedicatedConnection(connectionUrl: string): Db;
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
    protected runSchemaSync(connectionUrl: string): Promise<void>;
    /** Registry row for the org, or NotFoundException when no dedicated DB is configured. */
    private getDedicatedRowOrThrow;
    /**
     * Count rows in the dedicated DB's Drizzle migration ledger. Returns 0 (rather
     * than throwing) when the ledger table doesn't exist yet — the signal of a
     * never-provisioned database.
     */
    private countAppliedMigrations;
    /**
     * Idempotently copy `rows` into `table` on the dedicated handle, chunked to
     * respect Postgres' bind-parameter cap. `on conflict do nothing` makes re-runs
     * safe; `returning({ id })` yields the count actually inserted (found − inserted
     * = rows already present).
     */
    private copyRows;
    private markStatus;
    /** Project a row to the masked, client-safe view. NEVER exposes connectionUrl. */
    private toView;
}
/**
 * Reduce a Postgres DSN to just its `host:port` so the registry can show which
 * server an org points at without ever leaking credentials or the database
 * name. Unparseable values collapse to `***`.
 */
export declare function maskConnectionHost(connectionUrl: string): string;
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
export declare function resolveMigrationsDir(): string;
/**
 * Order tasks so every parent precedes its children (topological by
 * `parentTaskId`), so a chunked `insert` never violates the self-referencing
 * `tasks.parent_task_id` FK. Parents outside the set are ignored; cycles (which
 * a well-formed task tree never has) are broken defensively via the `visiting`
 * guard rather than recursing forever.
 */
export declare function orderTasksByParent<T extends {
    id: string;
    parentTaskId: string | null;
}>(rows: T[]): T[];
