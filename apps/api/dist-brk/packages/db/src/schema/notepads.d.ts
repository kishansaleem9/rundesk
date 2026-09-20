/**
 * §6 frame `087_0535` — the "Notepad" row in Personal Tools.
 *
 * A personal scratch pad, one row per person. Deliberately not a document
 * system: Docs already exist for anything wanting a title, sharing or a place
 * in the tree, and two ways to write a paragraph is how they drift.
 *
 * Not workspace-scoped. It belongs to the person, as ClickUp's does — a
 * thought jotted in one workspace vanishing when they switch would be the
 * opposite of a scratch pad.
 */
export declare const userNotepads: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "user_notepads";
    schema: undefined;
    columns: {
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "user_notepads";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        content: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "content";
            tableName: "user_notepads";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
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
            tableName: "user_notepads";
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
