/**
 * Who can see a saved view, and who can change it.
 *
 * §V2-07, frames `10:36` and `11:14` — the Customize panel has "Private view"
 * and "Protect view" as two separate switches, because they answer two
 * different questions:
 *
 *   everyone   what every view was until now: visible to anyone who can open
 *              the list, and editable by them too.
 *   private    only its creator can see it at all. It is not in anyone else's
 *              tab strip, and asking for it by id is a 404 — the same answer
 *              they would get for a view that does not exist, because "you
 *              may not see this one" is itself a disclosure.
 *   protected  everyone sees it; only its creator and the workspace's
 *              managers can rename, reconfigure or delete it. This is the one
 *              that fixes a real hole: before this column existed, ANY member
 *              of a list could delete ANY view on it, including the default
 *              one everybody works in, and nothing recorded that they had.
 */
export type ViewVisibility = 'everyone' | 'private' | 'protected';
export declare const taskViews: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_views";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_views";
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
            tableName: "task_views";
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
        createdById: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "task_views";
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
        name: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "task_views";
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
        type: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "type";
            tableName: "task_views";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "list" | "board" | "calendar" | "gantt" | "table" | "team";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["list", "board", "calendar", "gantt", "table", "team"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        isDefault: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_default";
            tableName: "task_views";
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
        isPinned: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_pinned";
            tableName: "task_views";
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
        visibility: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "visibility";
            tableName: "task_views";
            dataType: "string";
            columnType: "PgText";
            data: ViewVisibility;
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
        }, {}, {
            $type: ViewVisibility;
        }>;
        position: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "position";
            tableName: "task_views";
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
        config: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "config";
            tableName: "task_views";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
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
            $type: Record<string, unknown>;
        }>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "task_views";
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
            tableName: "task_views";
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
/**
 * §V2-07 "Autosave for me" — the one switch in that panel that is explicitly
 * per-user, and the frame says so in its own tooltip:
 *
 *   "Autosave will automatically save any layout changes you make to this
 *    view. Each user turns this on independently, but changes saved by
 *    Autosave will be seen by everyone."
 *
 * So the FLAG is per user and the SAVE is shared — which is exactly why it
 * cannot be a column on `task_views` (that would make one person's preference
 * everyone's) and cannot be browser storage either (the flag has to survive a
 * new laptop, and it is a real preference, not a remembered scroll position).
 */
export declare const taskViewPrefs: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_view_prefs";
    schema: undefined;
    columns: {
        viewId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "view_id";
            tableName: "task_view_prefs";
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
            tableName: "task_view_prefs";
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
        autosave: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "autosave";
            tableName: "task_view_prefs";
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
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "task_view_prefs";
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
            tableName: "task_view_prefs";
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
export declare const taskViewsRelations: import("node_modules/drizzle-orm").Relations<"task_views", {
    list: import("node_modules/drizzle-orm").One<"lists", true>;
    creator: import("node_modules/drizzle-orm").One<"users", false>;
    prefs: import("node_modules/drizzle-orm").Many<"task_view_prefs">;
}>;
export declare const taskViewPrefsRelations: import("node_modules/drizzle-orm").Relations<"task_view_prefs", {
    view: import("node_modules/drizzle-orm").One<"task_views", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
