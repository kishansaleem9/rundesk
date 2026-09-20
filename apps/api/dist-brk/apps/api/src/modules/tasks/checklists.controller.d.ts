import { TasksService } from './tasks.service';
import type { CurrentUserPayload } from './types';
export declare class TaskChecklistsController {
    private tasks;
    constructor(tasks: TasksService);
    create(taskId: string, user: CurrentUserPayload, body: {
        title: string;
    }): Promise<{
        items: never[];
        id: string;
        createdAt: Date;
        updatedAt: Date;
        position: number;
        title: string;
        taskId: string;
    }>;
    update(checklistId: string, body: {
        title?: string;
        position?: number;
    }): Promise<{
        id: string;
        taskId: string;
        title: string;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    delete(checklistId: string): Promise<{
        ok: boolean;
    }>;
    addItem(checklistId: string, user: CurrentUserPayload, body: {
        content: string;
        assigneeId?: string | null;
        dueDate?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        position: number;
        dueDate: Date | null;
        completedAt: Date | null;
        content: string;
        checklistId: string;
        assigneeId: string | null;
        isDone: boolean;
    }>;
    updateItem(itemId: string, user: CurrentUserPayload, body: {
        content?: string;
        isDone?: boolean;
        position?: number;
        dueDate?: string | null;
        assigneeId?: string | null;
    }): Promise<{
        id: string;
        checklistId: string;
        assigneeId: string | null;
        content: string;
        isDone: boolean;
        position: number;
        dueDate: Date | null;
        completedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deleteItem(itemId: string): Promise<{
        ok: boolean;
    }>;
}
