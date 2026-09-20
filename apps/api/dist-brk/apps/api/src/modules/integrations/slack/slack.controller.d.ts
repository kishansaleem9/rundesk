import { SlackService } from './slack.service';
export declare class SlackController {
    private readonly slack;
    constructor(slack: SlackService);
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
    connect(workspaceId: string, user: any, body: {
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
    update(workspaceId: string, body: {
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
    addRule(workspaceId: string, user: any, body: {
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
    removeRule(workspaceId: string, ruleId: string): Promise<{
        ok: boolean;
    }>;
}
