import type { Db } from '@rundesk/db';
export declare class SlackService {
    private db;
    constructor(db: Db);
    get(workspaceId: string): Promise<{
        id: string;
        isEnabled: boolean;
        channelName: string | null;
        eventFilters: string[];
        successCount: number;
        failureCount: number;
        lastNotifiedAt: Date | null;
        webhookUrlHint: string;
        createdAt: Date;
    } | null>;
    connect(workspaceId: string, userId: string, dto: {
        webhookUrl: string;
        channelName?: string;
        eventFilters?: string[];
    }): Promise<{
        id: string;
        isEnabled: boolean;
        channelName: string | null;
        eventFilters: string[];
        successCount: number;
        failureCount: number;
        lastNotifiedAt: Date | null;
        webhookUrlHint: string;
        createdAt: Date;
    }>;
    update(workspaceId: string, patch: {
        isEnabled?: boolean;
        channelName?: string;
        eventFilters?: string[];
    }): Promise<{
        id: string;
        isEnabled: boolean;
        channelName: string | null;
        eventFilters: string[];
        successCount: number;
        failureCount: number;
        lastNotifiedAt: Date | null;
        webhookUrlHint: string;
        createdAt: Date;
    }>;
    disconnect(workspaceId: string): Promise<{
        ok: boolean;
    }>;
    test(workspaceId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Public entry point: called by other modules (TasksService) when an
     * event is worth notifying about. Resolves the workspace's Slack
     * integration if any, applies event filters, and posts.
     */
    private matches;
    notify(workspaceId: string, event: string, message: string, opts?: {
        projectId?: string;
    }): Promise<void>;
    listRules(workspaceId: string): Promise<{
        webhookUrl: undefined;
        webhookUrlHint: string;
        id: string;
        channelName: string | null;
        projectId: string | null;
        eventFilters: string[];
        isEnabled: boolean;
        createdAt: Date;
    }[]>;
    addRule(workspaceId: string, userId: string, dto: {
        webhookUrl: string;
        channelName?: string;
        projectId?: string | null;
        eventFilters?: string[];
    }): Promise<{
        webhookUrl: undefined;
        webhookUrlHint: string;
        id: string;
        createdAt: Date;
        workspaceId: string;
        createdById: string | null;
        projectId: string | null;
        isEnabled: boolean;
        channelName: string | null;
        eventFilters: string[];
    }>;
    removeRule(id: string, workspaceId: string): Promise<{
        ok: boolean;
    }>;
    private post;
    private shape;
    private hint;
}
