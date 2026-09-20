/**
 * Client-facing project portals (Plan §14.7).
 *
 * A portal exposes exactly ONE project's client-safe view behind an
 * unguessable token, mirroring the public doc-share (`/d/:slug`) and public
 * form (`/submit/:slug`) patterns: no auth, token-scoped, minimal projection.
 *
 * The public read (`GET /portal/:token`) returns only client-appropriate task
 * fields (title, status label, due date, coarse progress) plus workspace
 * branding — never assignees, comments, internal notes, or any other project's
 * data. `is_enabled` gates access (disabled → 404), `show_completed` hides
 * closed tasks. `token` is a random ~24-char base64url string.
 */
export declare const clientPortals: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "client_portals";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "client_portals";
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
            tableName: "client_portals";
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
        projectId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "project_id";
            tableName: "client_portals";
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
        clientId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "client_id";
            tableName: "client_portals";
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
        token: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "token";
            tableName: "client_portals";
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
        name: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "client_portals";
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
        isEnabled: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_enabled";
            tableName: "client_portals";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        showCompleted: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "show_completed";
            tableName: "client_portals";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
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
        createdById: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "client_portals";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "client_portals";
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
        lastViewedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "last_viewed_at";
            tableName: "client_portals";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
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
    };
    dialect: "pg";
}>;
export declare const clientPortalsRelations: import("node_modules/drizzle-orm").Relations<"client_portals", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    project: import("node_modules/drizzle-orm").One<"projects", true>;
    client: import("node_modules/drizzle-orm").One<"clients", false>;
    creator: import("node_modules/drizzle-orm").One<"users", false>;
}>;
