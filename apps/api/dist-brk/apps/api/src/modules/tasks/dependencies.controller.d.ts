import { TasksService } from './tasks.service';
import type { CurrentUserPayload } from './types';
export declare class TaskDependenciesController {
    private tasks;
    constructor(tasks: TasksService);
    graph(taskId: string, depth?: string): Promise<{
        rootTaskId: string;
        depth: number;
        metrics: {
            nodeCount: number;
            edgeCount: number;
            blockedByOpenCount: number;
            blocksOpenCount: number;
            longestBlockedByChainDepth: number;
            longestBlocksChainDepth: number;
        };
        nodes: {
            id: string;
            title: string;
            status: string;
            priority: "urgent" | "high" | "normal" | "low";
            dueDate: Date | null;
            isArchived: boolean;
        }[];
        edges: {
            taskId: string;
            relatedTaskId: string;
            type: "blocks" | "blocked_by" | "related_to";
        }[];
    }>;
    add(taskId: string, user: CurrentUserPayload, body: {
        relatedTaskId: string;
        type: 'blocks' | 'blocked_by' | 'related_to';
    }): Promise<{
        id: string;
        createdAt: Date;
        createdById: string | null;
        taskId: string;
        type: "blocks" | "blocked_by" | "related_to";
        relatedTaskId: string;
    }>;
    remove(depId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
