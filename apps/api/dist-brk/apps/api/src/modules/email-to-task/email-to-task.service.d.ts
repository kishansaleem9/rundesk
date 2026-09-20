import type { Db } from '@rundesk/db';
import { R2Service } from '../../common/storage/r2.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
/**
 * Email-to-task: convert inbound emails into rundesk tasks or comments.
 *
 * Address scheme:
 *   list-${localPart}@${INBOUND_EMAIL_DOMAIN}                -> creates a task
 *   list-${localPart}+task-${taskId}@${INBOUND_EMAIL_DOMAIN}  -> appends comment
 *
 * Replies to notification emails are also routed by `In-Reply-To` /
 * `References` headers, since most mail clients drop sub-addressing.
 *
 * Idempotency: every accepted message inserts a row in
 * `inbound_email_messages` keyed by RFC 822 Message-Id. Duplicate
 * deliveries (Postmark retries, Mailgun re-queues) are dropped silently
 * with outcome=`rejected_duplicate`.
 */
export type InboundEmailPayload = {
    /** RFC 822 Message-Id, e.g. `<abc@example.com>` */
    messageId: string;
    /** Sender's bare address, e.g. `alice@example.com` */
    fromAddress: string;
    fromName?: string;
    /** Recipient address that received the email — drives routing. */
    recipient: string;
    subject?: string;
    textBody?: string;
    htmlBody?: string;
    /** RFC 5322 In-Reply-To header (single id) */
    inReplyTo?: string;
    /** RFC 5322 References header (whitespace-separated ids) */
    references?: string;
    attachments?: InboundEmailAttachment[];
};
export type InboundEmailAttachment = {
    fileName: string;
    contentType: string;
    /** Already-decoded bytes from the email provider */
    content: Buffer;
};
export type InboundOutcome = 'task_created' | 'comment_added' | 'rejected_no_alias' | 'rejected_duplicate' | 'rejected_too_large' | 'rejected_unknown_task';
export declare class EmailToTaskService {
    private readonly db;
    private readonly r2;
    private readonly realtime;
    private readonly logger;
    constructor(db: Db, r2: R2Service, realtime: RealtimeGateway);
    /**
     * Mint (or return the existing) inbound email alias for a list. Idempotent
     * so the UI can "Show address" without thinking about prior state.
     */
    ensureAlias(listId: string, actorId: string): Promise<AliasView>;
    /**
     * Rotate the local part — old emails to the previous address bounce
     * (or rather: get rejected with outcome=rejected_no_alias).
     */
    rotateAlias(listId: string, actorId: string): Promise<AliasView>;
    revokeAlias(listId: string, actorId?: string): Promise<{
        ok: true;
    }>;
    private assertCanManageAlias;
    getAlias(listId: string): Promise<AliasView | null>;
    /**
     * Accept an inbound email payload, route it, and return the audit
     * outcome. Always logs to `inbound_email_messages` — even rejected
     * messages — so we can debug "why didn't this email land?" later.
     */
    ingest(payload: InboundEmailPayload): Promise<{
        outcome: InboundOutcome;
        taskId?: string;
        commentId?: string;
        reason?: string;
    }>;
    private createTaskFromEmail;
    private appendComment;
    /**
     * `list-abc123@inbound.example.com` -> { localPart: 'abc123' }
     * `list-abc123+task-uuid@inbound.example.com` -> { localPart: 'abc123', taskId: 'uuid' }
     */
    parseRecipient(recipient: string): {
        localPart: string;
        taskId?: string;
    } | null;
    private resolveReplyContext;
    /**
     * Look up a user by their email to attribute the inbound message
     * properly. Falls back to the alias creator (or system bootstrap) so
     * we always have a non-null authorId — the comments / tasks schemas
     * disallow nulls there.
     */
    private resolveAuthorId;
    private userBelongsToList;
    private findWorkspaceOwnerForList;
    private findExistingByMessageId;
    private findAliasByListId;
    private findAliasByLocalPart;
    private assertListExists;
    private mintUniqueLocalPart;
    private estimatePayloadBytes;
    private formatSubject;
    private composeDescription;
    /** Drop the most common "On ... wrote:" reply quote so comments stay tidy. */
    private stripQuotedReply;
    private htmlToText;
    private safeFilename;
    private recordOutcome;
    /**
     * §V2-08, frame `15:32` — "Send email to task".
     *
     * THE ADDRESS ALREADY WORKED; NOTHING EVER SHOWED IT. `parseRecipient` has
     * routed `list-<localPart>+task-<id>@domain` to a comment on that task since
     * this module was written, and no screen in the product tells anybody the
     * address exists. That is the whole gap: a working inbound path nobody can
     * reach.
     *
     * Composed HERE rather than in the web app, even though the pieces are all in
     * the alias response. The prefix, the `+task-` tag and the domain are this
     * module's protocol, and a client that assembles them itself is a second
     * place the format lives — the next time it changes, one of the two is wrong
     * and the failure is an email silently going nowhere.
     *
     * Null when the list has no alias, rather than a plausible-looking address
     * that bounces.
     */
    taskEmailAddress(taskId: string): Promise<{
        address: string | null;
        listId: string | null;
    }>;
    private aliasView;
}
export type AliasView = {
    id: string;
    listId: string;
    localPart: string;
    address: string;
    defaultPriority: string;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
};
