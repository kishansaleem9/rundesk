/**
 * §V2-08 — "Description history", the item she names first.
 *
 * `[15:27]` "yahan par aap ko HISTORY wagera sab cheezein show hoti hain."
 *
 * WHY THIS STORES THE OLD TEXT, NOT THE NEW ONE — the one decision here worth
 * arguing about, because `doc_revisions` does the opposite.
 *
 * A doc is created empty and saved over and over, so snapshotting the text
 * AFTER each save captures its whole life. A task's description arrives already
 * written and is then edited rarely. Snapshotting the new text would mean the
 * description every existing task has RIGHT NOW is never recorded anywhere: the
 * first edit after this ships would overwrite it and the history would begin
 * with the text that replaced it. The thing somebody opens description history
 * to recover is exactly the thing that design throws away.
 *
 * So each row is "what it said until `replaced_at`", written at the moment the
 * text is replaced. The current description is not duplicated here — it is on
 * the task — and the first edit of any task, however old, preserves what was
 * there before.
 *
 * `description` is nullable because `tasks.description` is: a task whose
 * description is cleared has to be able to say "it used to be empty", and a
 * row that silently became `''` would make an emptying look like an edit that
 * never happened.
 */
export declare const taskDescriptionRevisions: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_description_revisions";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_description_revisions";
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
        taskId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "task_id";
            tableName: "task_description_revisions";
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
        editorId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "editor_id";
            tableName: "task_description_revisions";
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
        description: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "task_description_revisions";
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
        replacedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "replaced_at";
            tableName: "task_description_revisions";
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
export declare const taskDescriptionRevisionsRelations: import("node_modules/drizzle-orm").Relations<"task_description_revisions", {
    task: import("node_modules/drizzle-orm").One<"tasks", true>;
    editor: import("node_modules/drizzle-orm").One<"users", false>;
}>;
