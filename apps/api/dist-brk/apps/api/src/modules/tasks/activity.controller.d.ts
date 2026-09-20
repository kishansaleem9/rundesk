import type { CurrentUserPayload } from './types';
import { TasksService } from './tasks.service';
export declare class TaskActivityController {
    private tasks;
    constructor(tasks: TasksService);
    list(taskId: string): Promise<{
        id: string;
        createdAt: Date;
        taskId: string;
        actorId: string | null;
        action: "created" | "updated" | "deleted" | "archived" | "restored" | "status_changed" | "priority_changed" | "assigned" | "unassigned" | "commented" | "label_added" | "label_removed" | "due_date_changed" | "dependency_added" | "dependency_removed" | "checklist_item_toggled" | "checklist_item_added" | "attachment_added" | "attachment_removed" | "subtask_added" | "moved" | "merged_in" | "merged_away";
        meta: Record<string, unknown> | null;
        actor: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            passwordHash: string | null;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        } | null;
    }[]>;
}
export declare class ProjectActivityController {
    private tasks;
    constructor(tasks: TasksService);
    list(projectId: string, user: CurrentUserPayload, limit?: string): Promise<{
        id: string;
        action: "created" | "updated" | "deleted" | "archived" | "restored" | "status_changed" | "priority_changed" | "assigned" | "unassigned" | "commented" | "label_added" | "label_removed" | "due_date_changed" | "dependency_added" | "dependency_removed" | "checklist_item_toggled" | "checklist_item_added" | "attachment_added" | "attachment_removed" | "subtask_added" | "moved" | "merged_in" | "merged_away";
        meta: Record<string, unknown> | null;
        createdAt: Date;
        taskId: string;
        taskTitle: string;
        actor: {
            id: string;
            displayName: string | null;
            email: string | null;
        } | null;
    }[]>;
}
