import { AutomationsService } from './automations.service';
export declare class AutomationsController {
    private readonly svc;
    constructor(svc: AutomationsService);
    list(workspaceId: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        name: string;
        isEnabled: boolean;
        trigger: {
            type: string;
            filters?: Record<string, string | string[] | undefined>;
        };
        actions: {
            type: string;
            params: Record<string, string | string[] | undefined>;
        }[];
        runCount: number;
        lastRunAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(workspaceId: string, user: any, body: {
        name: string;
        trigger: {
            type: string;
            filters?: Record<string, string | string[] | undefined>;
        };
        actions: Array<{
            type: string;
            params: Record<string, string | string[] | undefined>;
        }>;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        actions: {
            type: string;
            params: Record<string, string | string[] | undefined>;
        }[];
        workspaceId: string;
        createdById: string | null;
        isEnabled: boolean;
        trigger: {
            type: string;
            filters?: Record<string, string | string[] | undefined>;
        };
        runCount: number;
        lastRunAt: Date | null;
    }>;
    getOne(workspaceId: string, automationId: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        name: string;
        isEnabled: boolean;
        trigger: {
            type: string;
            filters?: Record<string, string | string[] | undefined>;
        };
        actions: {
            type: string;
            params: Record<string, string | string[] | undefined>;
        }[];
        runCount: number;
        lastRunAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(workspaceId: string, automationId: string, body: any): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        name: string;
        isEnabled: boolean;
        trigger: {
            type: string;
            filters?: Record<string, string | string[] | undefined>;
        };
        actions: {
            type: string;
            params: Record<string, string | string[] | undefined>;
        }[];
        runCount: number;
        lastRunAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(workspaceId: string, automationId: string): Promise<{
        ok: boolean;
    }>;
    listRuns(workspaceId: string, automationId: string): Promise<{
        id: string;
        automationId: string;
        triggeredAt: Date;
        context: Record<string, string> | null;
        outcome: string;
        errorMsg: string | null;
    }[]>;
}
