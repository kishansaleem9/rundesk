import type { Db, PlannerSettings } from '@rundesk/db';
/** Frame `14:45` — dragging task `dbgdh` on makes a block "Work on dbgdh". */
export declare const DEFAULT_BLOCK_PREFIX = "Work on";
export declare class PlannerService {
    private db;
    constructor(db: Db);
    /**
     * The blocks on one person's grid between two instants.
     *
     * Half-open on purpose — `[from, to)` — so asking for two consecutive weeks
     * returns each block exactly once. A closed range double-counts anything
     * starting precisely at midnight on the boundary, which is most all-day
     * blocks.
     */
    listBlocks(workspaceId: string, userId: string, fromRaw: unknown, toRaw: unknown): Promise<{
        label: string | null;
        id: string;
        taskId: string | null;
        title: string | null;
        startsAt: Date;
        endsAt: Date;
        isAllDay: boolean;
        taskTitle: string | null;
        taskStatus: string | null;
        taskPriority: "urgent" | "high" | "normal" | "low" | null;
        taskListId: string | null;
        taskRecurrence: {
            cadenceDays?: number | null;
            rule?: {
                mode: "daily" | "weekly" | "monthly";
                interval?: number;
                weekdays?: number[];
                dayOfMonth?: number;
                skipWeekends?: boolean;
            } | null;
        } | null;
    }[]>;
    /**
     * The person's own planner preferences.
     *
     * Returned WITH `weekStart` and `timezone`, which are columns on `users` and
     * not part of the planner blob. Frame `14:10` puts "Start week on" and
     * "Timezone" on the Appearance page, so the page needs them — but they are
     * account-wide settings that every date in the product already honours, and
     * a planner-local copy that could drift from them would be a bug with a
     * settings page for creating it. The page reads and writes the real columns
     * through here.
     */
    getSettings(userId: string): Promise<PlannerSettings & {
        weekStart: string;
        timezone: string;
    }>;
    updateSettings(userId: string, patch: PlannerSettings & {
        weekStart?: string;
        timezone?: string;
    }): Promise<{
        weekStart: string;
        timezone: string;
        eventStyle?: "subtle" | "solid";
        defaultDurationMinutes?: number;
        colorTasksBy?: "none" | "priority" | "status" | "list";
        showWeekends?: boolean;
        showWeekNumbers?: boolean;
        alwaysOpenAtStartOfWeek?: boolean;
        darkenNonWorkingHours?: boolean;
        savePersonalEventsQuickly?: boolean;
        blockPrefix?: string;
        showAssigned?: boolean;
        showRecurring?: boolean;
        showOverdue?: boolean;
        upcomingShowTimeLeft?: boolean;
        upcomingQuickJoin?: boolean;
        upcomingDesktopNotify?: boolean;
        defaultListId?: string | null;
    }>;
    /**
     * Put a block on the grid. `[14:52]` — the drop target of the drag.
     *
     * A task-backed block stores no title: it renders from the task, prefixed
     * with the person's own "Work on". Storing the composed string would freeze
     * both the prefix and the task's name at the moment of the drag.
     */
    createBlock(workspaceId: string, userId: string, body: {
        taskId?: string | null;
        title?: string | null;
        startsAt: unknown;
        endsAt?: unknown;
        isAllDay?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        userId: string;
        title: string | null;
        taskId: string | null;
        startsAt: Date;
        endsAt: Date;
        isAllDay: boolean;
    }>;
    /** Moving or resizing a block on the grid. */
    updateBlock(blockId: string, userId: string, patch: {
        startsAt?: unknown;
        endsAt?: unknown;
        title?: string | null;
        isAllDay?: boolean;
    }): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        taskId: string | null;
        title: string | null;
        startsAt: Date;
        endsAt: Date;
        isAllDay: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deleteBlock(blockId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * A block you do not own is a 404, not a 403 — the same reasoning as a
     * private view. Somebody else's plan for their Thursday is not something you
     * should be able to confirm the existence of.
     */
    private ownedBlock;
}
