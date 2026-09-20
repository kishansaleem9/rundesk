/**
 * Shared fixed-window rate-limit counters (hardening §rate-limit). Backs the
 * multi-instance rate limiter: every API replica increments the same
 * `(key, window)` bucket here, so a horizontally-scaled deployment enforces ONE
 * global limit instead of per-replica limits. `bucket` is `"<routeKey>:<ip>:<windowStart>"`;
 * `expiresAt` lets a periodic sweep prune old rows. Auth endpoints are low-volume
 * so the per-request upsert cost is negligible.
 */
export declare const rateLimitCounters: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "rate_limit_counters";
    schema: undefined;
    columns: {
        bucket: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "bucket";
            tableName: "rate_limit_counters";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        count: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "count";
            tableName: "rate_limit_counters";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        expiresAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "expires_at";
            tableName: "rate_limit_counters";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
