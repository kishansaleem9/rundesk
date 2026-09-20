import type { Db } from '@rundesk/db';
import type { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
export declare class WebhooksService {
    private db;
    constructor(db: Db);
    getAvailableEvents(): string[];
    list(workspaceId: string): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        name: string;
        url: string;
        secret: string | null;
        isEnabled: boolean;
        events: string[];
        successCount: number;
        failureCount: number;
        lastDeliveredAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /**
     * Reject a webhook target URL that is not a public http/https endpoint before
     * it is ever persisted: non-http(s) schemes and literal private/reserved IPs
     * (loopback, link-local incl. the 169.254.169.254 cloud-metadata endpoint,
     * RFC-1918, CGNAT, …) are refused here. Hostnames that resolve to a private
     * address are additionally blocked at delivery time by {@link safeFetch}'s
     * DNS-pinned guard, so DNS-rebinding cannot repoint a "public" host inward.
     */
    private assertPublicHttpUrl;
    create(workspaceId: string, userId: string, dto: CreateWebhookDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        createdById: string | null;
        isEnabled: boolean;
        lastDeliveredAt: Date | null;
        secret: string | null;
        url: string;
        events: string[];
        successCount: number;
        failureCount: number;
    }>;
    private assertOwnership;
    update(workspaceId: string, webhookId: string, patch: UpdateWebhookDto): Promise<{
        id: string;
        workspaceId: string;
        createdById: string | null;
        name: string;
        url: string;
        secret: string | null;
        isEnabled: boolean;
        events: string[];
        successCount: number;
        failureCount: number;
        lastDeliveredAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    delete(workspaceId: string, webhookId: string): Promise<{
        ok: boolean;
    }>;
    listDeliveries(workspaceId: string, webhookId: string): Promise<{
        id: string;
        webhookId: string;
        event: string;
        payload: unknown;
        statusCode: number | null;
        responseBody: string | null;
        duration: number | null;
        attempts: number;
        success: boolean;
        deliveredAt: Date;
    }[]>;
    fire(workspaceId: string, event: string, payload: object): Promise<void>;
    private deliver;
    testWebhook(workspaceId: string, webhookId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Post with retry. Retries on network errors AND on HTTP 5xx responses with
     * exponential backoff (250ms, 750ms, 1.5s). 4xx responses are treated as
     * permanent failures and not retried.
     *
     * All delivery traffic goes through {@link safeFetch}, which enforces
     * http/https only, blocks private/reserved IPs with DNS pinning, and
     * re-validates every redirect hop — so a webhook can never be used to read an
     * internal endpoint (e.g. the cloud-metadata service). A {@link SsrfBlockedError}
     * is a permanent block: it is recorded as a failed delivery and never retried.
     */
    private postWithRetry;
}
