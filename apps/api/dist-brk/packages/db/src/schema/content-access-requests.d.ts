/**
 * §G10 [12:16–12:20] — "someone asked for access to something".
 *
 * The `access_requested` notification kind has existed since the enum was
 * written, and was only ever emitted for FEATURE requests. Somebody who hit a
 * doc, list or space they could not see had no way to ask for it.
 *
 * Shaped after `featureFlagRequests`, and read for exactly one question: has
 * this person asked for this object lately. That is the de-dup, and it is
 * deliberately read from the ASKS rather than from the notifications they
 * produced — a notification row only exists for a recipient with in-app
 * switched on, so counting rows let an email-only owner be re-mailed on every
 * press.
 */
export declare const contentAccessRequests: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "content_access_requests";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "content_access_requests";
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
            tableName: "content_access_requests";
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
        objectType: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "object_type";
            tableName: "content_access_requests";
            dataType: "string";
            columnType: "PgText";
            data: "list" | "view" | "space" | "project" | "task" | "doc" | "channel" | "folder" | "dashboard";
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
        }, {}, {
            $type: "list" | "view" | "space" | "project" | "task" | "doc" | "channel" | "folder" | "dashboard";
        }>;
        objectId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "object_id";
            tableName: "content_access_requests";
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
        requesterId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "requester_id";
            tableName: "content_access_requests";
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
            tableName: "content_access_requests";
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
