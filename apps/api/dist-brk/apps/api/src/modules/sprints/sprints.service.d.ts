import type { Db } from '@rundesk/db';
import type { SprintStatus } from '@rundesk/db';
export declare class SprintsService {
    private db;
    constructor(db: Db);
    private loadSprintTaskRows;
    /**
     * §2 per-item task-visibility WHERE fragment for a sprint's workspace.
     * undefined = no restriction (no actor, or the actor is a manager).
     */
    private sprintTaskVisFilter;
    private aggregateStats;
    private buildBurndown;
    list(workspaceId: string, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        taskCount: number;
        completedTasks: number;
        totalPoints: number;
        completedPoints: number;
        id: string;
        workspaceId: string;
        spaceId: string | null;
        name: string;
        goal: string | null;
        status: SprintStatus;
        startDate: Date;
        endDate: Date;
        closedAt: Date | null;
        createdAt: Date;
    }[]>;
    getDetail(sprintId: string, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        burndown: {
            day: string;
            ideal: number;
            actual: number | null;
        }[];
        tasks: {
            id: string;
            title: string;
            status: string;
            statusCategory: import("@rundesk/db").StatusCategory;
            priority: "urgent" | "high" | "normal" | "low";
            dueDate: Date | null;
            storyPoints: number | null;
            completedAt: Date | null;
        }[];
        taskCount: number;
        completedTasks: number;
        totalPoints: number;
        completedPoints: number;
        id: string;
        workspaceId: string;
        spaceId: string | null;
        name: string;
        goal: string | null;
        status: SprintStatus;
        startDate: Date;
        endDate: Date;
        closedAt: Date | null;
        createdAt: Date;
    }>;
    get(sprintId: string): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        name: string;
        goal: string | null;
        status: SprintStatus;
        startDate: Date;
        endDate: Date;
        closedAt: Date | null;
        createdAt: Date;
    }>;
    create(data: {
        workspaceId: string;
        spaceId?: string | null;
        name: string;
        goal?: string;
        startDate: Date;
        endDate: Date;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        workspaceId: string;
        spaceId: string | null;
        status: SprintStatus;
        startDate: Date;
        goal: string | null;
        endDate: Date;
        closedAt: Date | null;
    }>;
    update(sprintId: string, patch: {
        name?: string;
        goal?: string | null;
        status?: SprintStatus;
        startDate?: Date;
        endDate?: Date;
    }): Promise<{
        id: string;
        workspaceId: string;
        spaceId: string | null;
        name: string;
        goal: string | null;
        status: SprintStatus;
        startDate: Date;
        endDate: Date;
        closedAt: Date | null;
        createdAt: Date;
    }>;
    delete(sprintId: string): Promise<{
        ok: boolean;
    }>;
    listTasks(sprintId: string, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        id: string;
        title: string;
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        priority: "urgent" | "high" | "normal" | "low";
        dueDate: Date | null;
        storyPoints: number | null;
        completedAt: Date | null;
    }[]>;
    addTask(sprintId: string, taskId: string, storyPoints?: number): Promise<{
        ok: boolean;
    }>;
    removeTask(sprintId: string, taskId: string): Promise<{
        ok: boolean;
    }>;
}
