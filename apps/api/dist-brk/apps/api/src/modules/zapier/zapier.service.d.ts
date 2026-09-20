import type { Db } from '@rundesk/db';
import { WebhooksService } from '../webhooks/webhooks.service';
/**
 * Zapier REST-Hooks surface (Plan §12.4).
 *
 * A Zapier "subscription" is nothing more than one of the platform's existing
 * outbound {@link WebhooksService webhooks} pointed at a Zapier-provided target
 * URL — so subscribe/unsubscribe delegate straight to that service and reuse its
 * delivery pipeline (retries, HMAC signing, delivery log). No Zapier-specific
 * table is introduced.
 */
export declare class ZapierService {
    private readonly db;
    private readonly webhooks;
    constructor(db: Db, webhooks: WebhooksService);
    /** Zapier calls this to validate the API key and label the connection. */
    authTest(workspaceId: string, userId: string): Promise<{
        ok: boolean;
        workspace: {
            id: string;
            name: string;
            slug: string;
        };
        user: {
            id: string;
            email: string;
            displayName: string;
        } | null;
        connectionLabel: string;
    }>;
    /**
     * REST-Hook subscribe: create an outbound webhook for `event` aimed at
     * Zapier's `targetUrl`. Returns `{ id }`; Zapier stores it and hands it back
     * to {@link unsubscribe}.
     */
    subscribe(workspaceId: string, userId: string, dto: {
        event?: string;
        targetUrl?: string;
    }): Promise<{
        id: string;
    }>;
    /** REST-Hook unsubscribe: delete the webhook, scoped to the caller's workspace. */
    unsubscribe(workspaceId: string, id: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Perform-list / sample data for a trigger: a few recent, REAL, workspace-
     * scoped items wrapped in the exact envelope the live webhook delivers
     * (`{ id, event, payload, timestamp }`), so a Zap built from the sample maps
     * identically to real deliveries.
     */
    sample(workspaceId: string, event: string, userId?: string): Promise<{
        id: string;
        event: string;
        payload: Record<string, unknown>;
        timestamp: string;
    }[]>;
    private sampleTasks;
    private sampleComments;
    private sampleTimeEntries;
    /**
     * Same shape WebhooksService.deliver() POSTs, plus a top-level `id` Zapier
     * uses to de-duplicate polled items.
     */
    private envelope;
}
