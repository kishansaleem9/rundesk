export declare const featureFlags: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "feature_flags";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "feature_flags";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        flagKey: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "flag_key";
            tableName: "feature_flags";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scope: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "scope";
            tableName: "feature_flags";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "global" | "workspace" | "role" | "user";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["global", "workspace", "role", "user"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scopeId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "scope_id";
            tableName: "feature_flags";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "feature_flags";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        enabled: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "enabled";
            tableName: "feature_flags";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        updatedBy: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "updated_by";
            tableName: "feature_flags";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        updatedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "feature_flags";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "feature_flags";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
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
    };
    dialect: "pg";
}>;
export declare const flagAuditLog: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "flag_audit_log";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "flag_audit_log";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        flagKey: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "flag_key";
            tableName: "flag_audit_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scope: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "scope";
            tableName: "flag_audit_log";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "global" | "workspace" | "role" | "user";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["global", "workspace", "role", "user"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        scopeId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "scope_id";
            tableName: "flag_audit_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "flag_audit_log";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        fromEnabled: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "from_enabled";
            tableName: "flag_audit_log";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        toEnabled: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "to_enabled";
            tableName: "flag_audit_log";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        changedBy: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "changed_by";
            tableName: "flag_audit_log";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
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
        changedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "changed_at";
            tableName: "flag_audit_log";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
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
        ipAddress: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "ip_address";
            tableName: "flag_audit_log";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * §2.2 — "somebody asked for this feature", recorded once per press.
 *
 * The once-a-day rule used to be read off the `notifications` table: if this
 * requester had produced an access_requested row for this flag in the last
 * day, the ask was a repeat. That row is only written for an admin who has an
 * in-app channel switched on, so a workspace whose admins run email-only
 * produced no row and the rule never tripped — the same press could mail every
 * admin again and again.
 *
 * The ask is its own fact and does not depend on how anybody chose to be told
 * about it, so it is recorded as one.
 */
export declare const featureFlagRequests: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "feature_flag_requests";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "feature_flag_requests";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "feature_flag_requests";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
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
        flagKey: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "flag_key";
            tableName: "feature_flag_requests";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        requesterId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "requester_id";
            tableName: "feature_flag_requests";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "feature_flag_requests";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
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
    };
    dialect: "pg";
}>;
export declare const featureFlagsRelations: import("node_modules/drizzle-orm").Relations<"feature_flags", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", false>;
}>;
