/**
 * §V2-07 "Saved filters" — frame `11:41`, top-right of the Filters panel.
 *
 * A named set of filter rules on one list, re-appliable in a click. Distinct
 * from a saved VIEW, which also remembers the layout (which view type, which
 * columns, how it is grouped and sorted): a saved filter is only the question
 * "which tasks", which is why it can be applied on top of whatever view you
 * happen to be in.
 *
 * PER USER, deliberately, matching `saved_searches` — the app's existing
 * answer to "a filter set I saved". A shared one would mean a teammate can
 * delete the filter you use every morning, and nothing in the video says these
 * are shared.
 *
 * Its own table rather than a `list_id` on `saved_searches`: that column would
 * have to be nullable to leave the command palette's presets alone, and a
 * nullable column inside the unique key that palette upserts on is a real
 * behaviour change (Postgres treats NULLs as distinct) for no gain.
 */
export declare const listFilterPresets: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "list_filter_presets";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "list_filter_presets";
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
        listId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "list_id";
            tableName: "list_filter_presets";
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
            tableName: "list_filter_presets";
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
        name: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "list_filter_presets";
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
        rules: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "rules";
            tableName: "list_filter_presets";
            dataType: "json";
            columnType: "PgJsonb";
            data: unknown[];
            driverParam: unknown;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {
            $type: unknown[];
        }>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "list_filter_presets";
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
        updatedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "list_filter_presets";
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
export declare const listFilterPresetsRelations: import("node_modules/drizzle-orm").Relations<"list_filter_presets", {
    list: import("node_modules/drizzle-orm").One<"lists", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
