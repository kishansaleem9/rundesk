import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
export declare class WebhooksController {
    private readonly svc;
    constructor(svc: WebhooksService);
    events(): string[];
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
    create(workspaceId: string, user: any, body: CreateWebhookDto): Promise<{
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
    update(workspaceId: string, webhookId: string, body: UpdateWebhookDto): Promise<{
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
    test(workspaceId: string, webhookId: string): Promise<{
        ok: boolean;
    }>;
    deliveries(workspaceId: string, webhookId: string): Promise<{
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
}
