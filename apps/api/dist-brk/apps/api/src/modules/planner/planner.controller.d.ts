import { PlannerService } from './planner.service';
import type { PlannerSettings } from '@rundesk/db';
/**
 * §V2-02 — the Planner, frame `13:08`.
 *
 * `WorkspaceMemberGuard`, and then everything is scoped to `user.id` inside
 * the service. There is no route here that reads another person's blocks:
 * `[14:56]` "yeh MERI planner pe show honge" — a planner is one person's plan
 * for their own week, and a manager who could open yours would be looking at
 * your day rather than at your work.
 */
export declare class PlannerController {
    private planner;
    constructor(planner: PlannerService);
    /** The grid's read: `[from, to)`, half-open so two weeks never double-count. */
    listBlocks(workspaceId: string, user: any, from: string, to: string): Promise<{
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
    createBlock(workspaceId: string, user: any, body: {
        taskId?: string | null;
        title?: string | null;
        startsAt: string;
        endsAt?: string;
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
    updateBlock(blockId: string, user: any, body: {
        startsAt?: string;
        endsAt?: string;
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
    deleteBlock(blockId: string, user: any): Promise<{
        ok: boolean;
    }>;
    /** Frame `14:10` — Appearance and Time blocking. Per person, not per space. */
    getSettings(user: any): Promise<PlannerSettings & {
        weekStart: string;
        timezone: string;
    }>;
    updateSettings(user: any, body: PlannerSettings & {
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
}
