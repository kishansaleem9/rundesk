import { TaskTypesService } from './task-types.service';
import type { CurrentUserPayload } from './types';
/**
 * Task Types. Membership and admin rights are checked inside the service for
 * every route — the collection hangs off a workspace but is applied from a
 * task, so no single guard covers both shapes.
 */
export declare class TaskTypesController {
    private types;
    constructor(types: TaskTypesService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        icon: string | null;
        color: string | null;
        isDefault: boolean;
        isMilestone: boolean;
        origin: string | null;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(workspaceId: string, user: CurrentUserPayload, body: {
        name: string;
        icon?: string | null;
        color?: string | null;
        isDefault?: boolean;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        color: string | null;
        icon: string | null;
        position: number;
        isMilestone: boolean;
        isDefault: boolean;
        origin: string | null;
    }>;
    update(workspaceId: string, typeId: string, user: CurrentUserPayload, body: {
        name?: string;
        icon?: string | null;
        color?: string | null;
        isDefault?: boolean;
        position?: number;
    }): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        icon: string | null;
        color: string | null;
        isDefault: boolean;
        isMilestone: boolean;
        origin: string | null;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, typeId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
        untypedTasks: number;
    }>;
    setForTask(taskId: string, user: CurrentUserPayload, body: {
        taskTypeId: string | null;
    }): Promise<{
        id: string;
        taskTypeId: string | null;
        isMilestone: boolean;
    }>;
}
