import { EmailToTaskService } from './email-to-task.service';
/**
 * Authenticated: per-list inbound alias CRUD.
 */
export declare class EmailAliasController {
    private readonly svc;
    constructor(svc: EmailToTaskService);
    get(listId: string): Promise<import("./email-to-task.service").AliasView | null>;
    ensure(user: {
        id: string;
    }, listId: string): Promise<import("./email-to-task.service").AliasView>;
    rotate(user: {
        id: string;
    }, listId: string): Promise<import("./email-to-task.service").AliasView>;
    revoke(user: {
        id: string;
    }, listId: string): Promise<{
        ok: true;
    }>;
}
/**
 * Unauthenticated: inbound webhook receiver. Verified by HMAC over the
 * raw body when INBOUND_EMAIL_WEBHOOK_SECRET is configured; otherwise
 * accepts any request (dev-only behaviour, logged on boot).
 *
 * Supports a Postmark-style JSON payload — see InboundEmailPayload — and
 * accepts attachments as base64-encoded blobs.
 */
type InboundWebhookBody = {
    MessageID?: string;
    messageId?: string;
    From?: string;
    FromName?: string;
    fromAddress?: string;
    fromName?: string;
    To?: string;
    recipient?: string;
    Subject?: string;
    subject?: string;
    TextBody?: string;
    HtmlBody?: string;
    textBody?: string;
    htmlBody?: string;
    InReplyTo?: string;
    inReplyTo?: string;
    References?: string;
    references?: string;
    Attachments?: Array<{
        Name: string;
        ContentType: string;
        Content: string;
    }>;
    attachments?: Array<{
        fileName: string;
        contentType: string;
        contentBase64: string;
    }>;
};
export declare class InboundEmailController {
    private readonly svc;
    constructor(svc: EmailToTaskService);
    ingest(signature: string | undefined, body: InboundWebhookBody): Promise<{
        outcome: import("./email-to-task.service").InboundOutcome;
        taskId?: string;
        commentId?: string;
        reason?: string;
    }>;
    private verifySignature;
    private normalisePayload;
    /** `"Alice <alice@example.com>"` -> `alice@example.com` */
    private extractEmail;
}
export {};
