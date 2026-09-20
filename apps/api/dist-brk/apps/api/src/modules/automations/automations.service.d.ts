import type { Db } from '@rundesk/db';
import { RealtimeGateway } from '../realtime/realtime.gateway';
type TriggerContext = {
    taskId?: string;
    userId?: string;
    changedField?: string;
    oldValue?: string;
    newValue?: string;
    workspaceId: string;
    projectId?: string;
    listId?: string;
};
/**
 * Replace `{{task.title}}`-style placeholders in an automation message with
 * values from the trigger context. Dotted keys are supported; unknown
 * placeholders are left intact (matches the web i18n interpolator). Pure so the
 * post_to_channel rendering can be unit-tested without a database.
 */
export declare function renderTemplate(template: string, vars: Record<string, string>): string;
export declare class AutomationsService {
    private db;
    private realtime;
    constructor(db: Db, realtime: RealtimeGateway);
    runOverdueTriggers(): Promise<void>;
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
    private assertOwnership;
    getOne(workspaceId: string, id: string): Promise<{
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
    /**
     * Reject/normalise a trigger + actions payload. Persisting a non-object
     * trigger or a non-array `actions` (both reachable via the untyped controller
     * body) stores data the reader can't render — it crashed the automations page
     * via `actions.map is not a function`. Validate at the write boundary so the
     * column invariant (trigger is an object, actions is an array of typed steps)
     * always holds.
     */
    private normaliseTrigger;
    private normaliseActions;
    create(workspaceId: string, userId: string, dto: {
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
    update(workspaceId: string, id: string, patch: {
        name?: string;
        isEnabled?: boolean;
        trigger?: {
            type: string;
            filters?: Record<string, string | string[] | undefined>;
        };
        actions?: Array<{
            type: string;
            params: Record<string, string | string[] | undefined>;
        }>;
    }): Promise<{
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
    remove(workspaceId: string, id: string): Promise<{
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
    fire(triggerType: string, ctx: TriggerContext): Promise<void>;
    private executeRule;
    private runAction;
    /**
     * Post an automation message into a chat channel via the lowest-level insert
     * path (avoids a Chat↔Automations DI cycle — TasksModule already imports
     * AutomationsModule, so importing ChatModule here would cycle). The message is
     * authored by the automation's creator (`createdById`); when that user is
     * missing or no longer a member we fall back to a workspace admin/member —
     * there is no dedicated system user, so the creator is the cleanest identity.
     */
    private postToChannel;
    /** Interpolation variables derived from the trigger context (the task). */
    private buildMessageVars;
    /** A valid author for the posted message: the creator if still a member, else an admin/member. */
    private resolveChannelAuthor;
}
export {};
