/**
 * §V2-02 — the Planner's time blocks.
 *
 * `[14:52]` "Yahan pe jo mujhe task add hote hain, main un ko bhi apne planner
 * mein add kar sakti hoon DRAG AND DROP se", and `[14:56]` "to yeh meri planner
 * pe bhi show honge — yaani ke Google Calendar pe aur yahan pe bhi." Frame
 * `13:08` is the grid they land on: a week, an all-day row, an hour gutter and
 * a red now-line.
 *
 * `grep -ri "time.block\|time_block"` across `apps/` and `packages/` returned
 * zero files before this. Rundesk's calendar was a list VIEW TYPE and a
 * read-only strip on the person panel; there was nowhere for "I will do this
 * task from 2 to 4 on Thursday" to be recorded.
 *
 * A BLOCK IS NOT A TASK, AND NOT A DUE DATE.
 *
 * A due date says when something must be finished. A block says when you
 * intend to work on it, and there can be several for one task — an hour on
 * Tuesday and two more on Thursday is the normal shape of real work. That is
 * why this is its own table rather than columns on `tasks`: the moment you
 * allow two, a column cannot hold it.
 *
 * `taskId` is nullable for the same reason `user_priorities.taskId` is: a block
 * can be "lunch" or "school run", and requiring a task first would make the
 * fast case slow. `title` carries those; a task-backed block leaves it null and
 * renders from the task, so renaming the task renames the block.
 */
export declare const taskTimeBlocks: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "task_time_blocks";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "task_time_blocks";
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
            tableName: "task_time_blocks";
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
            tableName: "task_time_blocks";
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
        taskId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "task_id";
            tableName: "task_time_blocks";
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
        title: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "task_time_blocks";
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
        startsAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "starts_at";
            tableName: "task_time_blocks";
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
        endsAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "ends_at";
            tableName: "task_time_blocks";
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
        isAllDay: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "is_all_day";
            tableName: "task_time_blocks";
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
            tableName: "task_time_blocks";
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
            tableName: "task_time_blocks";
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
export declare const taskTimeBlocksRelations: import("node_modules/drizzle-orm").Relations<"task_time_blocks", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
    task: import("node_modules/drizzle-orm").One<"tasks", false>;
}>;
/**
 * §V2-02 — the Planner's own preferences, frame `14:10`.
 *
 * Deliberately NOT holding "Start week on", "Timezone" or the time format,
 * even though the Appearance page shows all three. `users` already has
 * `weekStart`, `timezone` and `timeFormat`, and a planner-local copy that
 * disagreed with the account would be a bug with a UI for creating it: the
 * grid would start on Monday while every date elsewhere started on Sunday.
 * The settings page reads and writes the existing columns for those.
 *
 * One jsonb rather than a column per switch, following `panelsCollapsed`:
 * these are the same kind of choice repeated, and the list grows.
 */
export type PlannerSettings = {
    /** Frame `14:10`: Subtle | Solid. */
    eventStyle?: 'subtle' | 'solid';
    /** "Default event duration", shown as `1 hour`. */
    defaultDurationMinutes?: number;
    /**
     * "Color tasks by", shown as `None`.
     *
     * FOUR VALUES, and the fourth is the one the pickers kept losing. The web
     * dialog's own copy of this type listed `'none' | 'priority' | 'status'`
     * while the controller accepted `'list'` and the service stored it — the
     * duplicated-list defect, in the smallest possible form: a server that
     * accepts a value no control can send and no reader could colour by.
     */
    colorTasksBy?: 'none' | 'priority' | 'status' | 'list';
    showWeekends?: boolean;
    /**
     * §V2-02e, frame `14:10`'s **Others** group — the five that were declared,
     * stored, accepted by the controller, round-tripped through Postgres and
     * READ BY NOTHING. Five dead keys sitting among six working siblings, which
     * is exactly why nobody noticed: every neighbour worked.
     *
     * Each one now names the reader that honours it, so the next person can
     * check the claim rather than trust it.
     */
    /** Week number beside the month in the planner header — WEEK VIEW ONLY.
     *  Reader: `workspace-planner-page.tsx`, `planner-week-number`. */
    showWeekNumbers?: boolean;
    /** Opening the planner lands on the start of the week, not on today.
     *  Reader: `workspace-planner-page.tsx`, the one-shot anchor effect. */
    alwaysOpenAtStartOfWeek?: boolean;
    /** Dim the hours outside the workspace's work schedule (`work_days` plus
     *  `workspace_holidays`) on the grid.
     *  Reader: `workspace-planner-page.tsx`, `planner-nonworking`. */
    darkenNonWorkingHours?: boolean;
    /** A typed personal event saves on Enter instead of asking to confirm.
     *  Reader: `workspace-planner-page.tsx`, `planner-event-confirm`. */
    savePersonalEventsQuickly?: boolean;
    /**
     * The Time-blocking page. `blockPrefix` is the "Work on" of frame `14:45` —
     * dragging task `dbgdh` onto the grid makes a block called "Work on dbgdh".
     */
    blockPrefix?: string;
    showAssigned?: boolean;
    /** Future occurrences of a block whose task recurs, projected onto the grid.
     *  Reader: `workspace-planner-page.tsx`, `planner-recurring-block`. */
    showRecurring?: boolean;
    showOverdue?: boolean;
    /**
     * §V2-02e, frame `14:10`'s **Upcoming meeting** page.
     *
     * The nav page that was left out because it was "mostly a desktop menubar".
     * The countdown and the quick-join it configures are not a menubar: they are
     * `workspace-meetings-page.tsx`'s Upcoming list, which has drawn both since
     * §2.8 with nothing able to turn either off.
     */
    /** The "in 5m" badge on the Upcoming list. */
    upcomingShowTimeLeft?: boolean;
    /** The Join pill on the Upcoming list. */
    upcomingQuickJoin?: boolean;
    /** "Show in desktop" — a desktop notification when a meeting is joinable. */
    upcomingDesktopNotify?: boolean;
    /**
     * "Default list for new tasks — defaults to your personal list".
     *
     * This is the answer to the question video 1 left open: where a task created
     * from a message, from `/task`, or by the AI should land. Null means the
     * person's own list, which is what ClickUp defaults to.
     */
    defaultListId?: string | null;
};
