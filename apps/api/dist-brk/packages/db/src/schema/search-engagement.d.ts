/**
 * §G03-6 [04:00–04:04] — the two sort modes the Sort menu is missing:
 * "Trending In Workspace" and "Trending For You".
 *
 * Trending is a claim about what people are OPENING, and nothing recorded that.
 * The audit note put it plainly: "Real trending needs view/open telemetry per
 * object per user, which Rundesk does not currently record for search targets."
 * So this is that record, and it is the whole reason the feature could not be
 * faked from data already on hand — `updatedAt` tells you what was EDITED,
 * which is a different and much smaller group of people.
 *
 * An append-only event rather than a counter column, deliberately. Trending is
 * about a WINDOW ("what is hot this week"), and a lifetime counter cannot
 * answer that: the busiest task of last quarter would sit at the top forever.
 * Rows are cheap and a window is a WHERE clause.
 *
 * Not a general analytics table. It records one thing — somebody opened this
 * search result — because a table that records everything is one nobody can
 * reason about the size of.
 */
export declare const searchEngagement: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "search_engagement";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "search_engagement";
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
            tableName: "search_engagement";
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
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "search_engagement";
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
        entityType: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "entity_type";
            tableName: "search_engagement";
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
        entityId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "entity_id";
            tableName: "search_engagement";
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
        openedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "opened_at";
            tableName: "search_engagement";
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
