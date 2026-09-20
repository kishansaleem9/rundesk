import { TasksService } from './tasks.service';
import type { CurrentUserPayload } from './types';
export declare class TaskTimeEntriesController {
    private tasks;
    constructor(tasks: TasksService);
    list(taskId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
        user: {
            id: string;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
        };
    }[]>;
    start(taskId: string, user: CurrentUserPayload, body: {
        description?: string;
        isBillable?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
    }>;
    stop(entryId: string, user: CurrentUserPayload): Promise<{
        id: string;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        description: string | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    manual(taskId: string, user: CurrentUserPayload, body: {
        startedAt: string;
        endedAt: string;
        description?: string;
        isBillable?: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        taskId: string;
        userId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSec: number | null;
        isBillable: boolean;
        clientInvoiceId: string | null;
    }>;
}
export declare class TimeEntriesController {
    private tasks;
    constructor(tasks: TasksService);
    active(user: CurrentUserPayload): Promise<{
        id: string;
        taskId: string;
        userId: string;
        description: string | null;
        startedAt: Date;
        isBillable: boolean;
        taskTitle: string;
        workspaceId: string;
        spaceId: string;
        projectId: string;
        listId: string;
    }>;
}
