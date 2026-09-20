import { SprintsService } from './sprints.service';
import { CreateSprintDto } from './dto/sprint.dto';
import type { CurrentUserPayload } from '../tasks/types';
import type { SprintStatus } from '@rundesk/db';
export declare class SprintsController {
    private sprints;
    constructor(sprints: SprintsService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<{
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
    create(workspaceId: string, body: CreateSprintDto): Promise<{
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
    get(sprintId: string, user: CurrentUserPayload): Promise<{
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
    update(sprintId: string, body: {
        name?: string;
        goal?: string | null;
        status?: SprintStatus;
        startDate?: string;
        endDate?: string;
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
    remove(sprintId: string): Promise<{
        ok: boolean;
    }>;
    listTasks(sprintId: string, user: CurrentUserPayload): Promise<{
        id: string;
        title: string;
        status: string;
        statusCategory: import("@rundesk/db").StatusCategory;
        priority: "urgent" | "high" | "normal" | "low";
        dueDate: Date | null;
        storyPoints: number | null;
        completedAt: Date | null;
    }[]>;
    addTask(sprintId: string, body: {
        taskId: string;
        storyPoints?: number;
    }): Promise<{
        ok: boolean;
    }>;
    removeTask(sprintId: string, taskId: string): Promise<{
        ok: boolean;
    }>;
}
