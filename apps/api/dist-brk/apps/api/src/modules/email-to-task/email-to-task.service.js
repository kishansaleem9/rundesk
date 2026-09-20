"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EmailToTaskService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailToTaskService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const r2_service_1 = require("../../common/storage/r2.service");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const container_access_1 = require("../../common/permissions/container-access");
const MAX_EMAIL_BYTES = 25 * 1024 * 1024; // 25 MB total payload
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB per attachment
const MAX_ATTACHMENTS = 10;
const LOCAL_PART_PREFIX = 'list-';
const TASK_TAG = '+task-';
let EmailToTaskService = EmailToTaskService_1 = class EmailToTaskService {
    constructor(db, r2, realtime) {
        this.db = db;
        this.r2 = r2;
        this.realtime = realtime;
        this.logger = new common_1.Logger(EmailToTaskService_1.name);
    }
    // ─── alias management ────────────────────────────────────────────────────
    /**
     * Mint (or return the existing) inbound email alias for a list. Idempotent
     * so the UI can "Show address" without thinking about prior state.
     */
    async ensureAlias(listId, actorId) {
        const existing = await this.findAliasByListId(listId);
        if (existing && !existing.revokedAt)
            return this.aliasView(existing);
        return this.rotateAlias(listId, actorId);
    }
    /**
     * Rotate the local part — old emails to the previous address bounce
     * (or rather: get rejected with outcome=rejected_no_alias).
     */
    async rotateAlias(listId, actorId) {
        await this.assertListExists(listId);
        await this.assertCanManageAlias(listId, actorId);
        const localPart = await this.mintUniqueLocalPart();
        const [row] = await this.db
            .insert(db_1.listEmailAliases)
            .values({ listId, localPart, createdById: actorId })
            .onConflictDoUpdate({
            target: db_1.listEmailAliases.listId,
            set: { localPart, revokedAt: null, updatedAt: new Date(), createdById: actorId },
        })
            .returning();
        return this.aliasView(row);
    }
    async revokeAlias(listId, actorId) {
        if (actorId)
            await this.assertCanManageAlias(listId, actorId);
        await this.db
            .update(db_1.listEmailAliases)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.listEmailAliases.listId, listId));
        return { ok: true };
    }
    // Managing a list's inbound-email alias requires the list's creator or a
    // workspace admin/manager (not any member).
    async assertCanManageAlias(listId, actorId) {
        const [row] = await this.db
            .select({ createdById: db_1.lists.createdById, workspaceId: db_1.spaces.workspaceId })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('List not found');
        await (0, container_access_1.assertCanManageContainer)(this.db, {
            workspaceId: row.workspaceId,
            createdById: row.createdById,
            actorId,
            kind: 'list email alias',
        });
    }
    async getAlias(listId) {
        const row = await this.findAliasByListId(listId);
        if (!row || row.revokedAt)
            return null;
        return this.aliasView(row);
    }
    // ─── inbound webhook entry point ─────────────────────────────────────────
    /**
     * Accept an inbound email payload, route it, and return the audit
     * outcome. Always logs to `inbound_email_messages` — even rejected
     * messages — so we can debug "why didn't this email land?" later.
     */
    async ingest(payload) {
        // Idempotency: Postmark / Mailgun retry on 5xx. Always check Message-Id first.
        const dup = await this.findExistingByMessageId(payload.messageId);
        if (dup) {
            this.logger.log(`Skipped duplicate inbound email ${payload.messageId}`);
            return { outcome: 'rejected_duplicate', reason: 'message already processed' };
        }
        const totalBytes = this.estimatePayloadBytes(payload);
        if (totalBytes > MAX_EMAIL_BYTES) {
            await this.recordOutcome(payload, totalBytes, 'rejected_too_large');
            return { outcome: 'rejected_too_large', reason: `Payload ${totalBytes}B exceeds 25MB limit` };
        }
        // Reply routing: if In-Reply-To matches a prior message, append a comment.
        const replyContext = await this.resolveReplyContext(payload);
        if (replyContext) {
            return this.appendComment(payload, replyContext, totalBytes);
        }
        // Otherwise: route via recipient sub-address.
        const route = this.parseRecipient(payload.recipient);
        if (!route) {
            await this.recordOutcome(payload, totalBytes, 'rejected_no_alias', 'recipient not recognized');
            return { outcome: 'rejected_no_alias', reason: `No alias found for ${payload.recipient}` };
        }
        if (route.taskId) {
            const [task] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, route.taskId)).limit(1);
            if (!task) {
                await this.recordOutcome(payload, totalBytes, 'rejected_unknown_task');
                return { outcome: 'rejected_unknown_task', reason: `Task ${route.taskId} not found` };
            }
            return this.appendComment(payload, { taskId: route.taskId, listId: task.listId }, totalBytes);
        }
        return this.createTaskFromEmail(payload, route.localPart, totalBytes);
    }
    // ─── private: task / comment creation ─────────────────────────────────────
    async createTaskFromEmail(payload, localPart, totalBytes) {
        const alias = await this.findAliasByLocalPart(localPart);
        if (!alias || alias.revokedAt) {
            await this.recordOutcome(payload, totalBytes, 'rejected_no_alias', 'alias revoked or missing');
            return { outcome: 'rejected_no_alias', reason: 'alias revoked' };
        }
        const authorId = await this.resolveAuthorId(alias.listId, payload.fromAddress, alias.createdById);
        const trimmedAttachments = (payload.attachments ?? []).slice(0, MAX_ATTACHMENTS);
        const [task] = await this.db
            .insert(db_1.tasks)
            .values({
            listId: alias.listId,
            title: this.formatSubject(payload.subject) || `Email from ${payload.fromAddress}`,
            description: this.composeDescription(payload),
            priority: alias.defaultPriority,
            createdById: authorId,
        })
            .returning();
        // Best-effort attachment upload — failures don't sink the whole ingest.
        let attachmentCount = 0;
        for (const att of trimmedAttachments) {
            if (att.content.length > MAX_ATTACHMENT_BYTES)
                continue;
            try {
                const key = `inbound-email/${task.id}/${Date.now()}-${this.safeFilename(att.fileName)}`;
                await this.r2.putObject(key, att.content, att.contentType, {
                    source: 'inbound-email',
                    messageId: payload.messageId.slice(0, 200),
                });
                await this.db.insert(db_1.taskAttachments).values({
                    taskId: task.id,
                    uploadedById: authorId,
                    fileName: att.fileName,
                    contentType: att.contentType,
                    sizeBytes: att.content.length,
                    storageKey: key,
                });
                attachmentCount += 1;
            }
            catch (err) {
                this.logger.warn(`Failed to persist attachment "${att.fileName}": ${err.message}`);
            }
        }
        await this.db
            .update(db_1.listEmailAliases)
            .set({ lastUsedAt: new Date(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.listEmailAliases.id, alias.id));
        await this.recordOutcome(payload, totalBytes, 'task_created', null, alias.listId, task.id, attachmentCount);
        this.realtime.emitToList(alias.listId, {
            type: 'task.created',
            listId: alias.listId,
            task: { id: task.id },
        });
        return { outcome: 'task_created', taskId: task.id };
    }
    async appendComment(payload, ctx, totalBytes) {
        const authorId = await this.resolveAuthorId(ctx.listId, payload.fromAddress, null);
        const body = this.stripQuotedReply(payload.textBody ?? this.htmlToText(payload.htmlBody ?? ''));
        const [comment] = await this.db
            .insert(db_1.taskComments)
            .values({
            taskId: ctx.taskId,
            authorId,
            body: body || '(empty reply)',
        })
            .returning();
        await this.recordOutcome(payload, totalBytes, 'comment_added', null, ctx.listId, ctx.taskId, 0);
        this.realtime.emitToTask(ctx.taskId, {
            type: 'comment.created',
            taskId: ctx.taskId,
            comment: { id: comment.id, body: comment.body },
        });
        return { outcome: 'comment_added', commentId: comment.id };
    }
    // ─── private: routing ─────────────────────────────────────────────────────
    /**
     * `list-abc123@inbound.example.com` -> { localPart: 'abc123' }
     * `list-abc123+task-uuid@inbound.example.com` -> { localPart: 'abc123', taskId: 'uuid' }
     */
    parseRecipient(recipient) {
        const lower = recipient.trim().toLowerCase();
        const at = lower.indexOf('@');
        if (at < 1)
            return null;
        const left = lower.slice(0, at);
        if (!left.startsWith(LOCAL_PART_PREFIX))
            return null;
        const rest = left.slice(LOCAL_PART_PREFIX.length);
        const plus = rest.indexOf(TASK_TAG);
        if (plus === -1) {
            // Reject an empty local part — e.g. `list-@…` — that would otherwise
            // route to a meaningless alias and produce ambiguous error logs.
            if (!rest)
                return null;
            return { localPart: rest };
        }
        const localPart = rest.slice(0, plus);
        const taskId = rest.slice(plus + TASK_TAG.length);
        if (!localPart || !taskId)
            return null;
        return { localPart, taskId };
    }
    async resolveReplyContext(payload) {
        const candidates = [];
        if (payload.inReplyTo)
            candidates.push(payload.inReplyTo.trim());
        if (payload.references)
            candidates.push(...payload.references.split(/\s+/).map((s) => s.trim()));
        for (const ref of candidates) {
            if (!ref)
                continue;
            const [row] = await this.db
                .select({ taskId: db_1.inboundEmailMessages.taskId, listId: db_1.inboundEmailMessages.listId })
                .from(db_1.inboundEmailMessages)
                .where((0, drizzle_orm_1.eq)(db_1.inboundEmailMessages.messageId, ref))
                .limit(1);
            if (row?.taskId && row.listId)
                return { taskId: row.taskId, listId: row.listId };
        }
        return null;
    }
    // ─── private: helpers ─────────────────────────────────────────────────────
    /**
     * Look up a user by their email to attribute the inbound message
     * properly. Falls back to the alias creator (or system bootstrap) so
     * we always have a non-null authorId — the comments / tasks schemas
     * disallow nulls there.
     */
    async resolveAuthorId(listId, fromAddress, fallback) {
        const normalized = fromAddress.toLowerCase().trim();
        const [byEmail] = await this.db
            .select({ id: db_1.users.id })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.email, normalized))
            .limit(1);
        if (byEmail) {
            // Ensure they're a member of the workspace owning this list
            const isMember = await this.userBelongsToList(byEmail.id, listId);
            if (isMember)
                return byEmail.id;
        }
        if (fallback)
            return fallback;
        // Last-resort: any active workspace admin / first member. Inbound mail
        // from strangers gets attributed to the workspace owner.
        const owner = await this.findWorkspaceOwnerForList(listId);
        if (owner)
            return owner;
        throw new common_1.BadRequestException('No author available — list has no workspace members and alias has no creator');
    }
    async userBelongsToList(userId, listId) {
        const [row] = await this.db
            .select({ id: db_1.workspaceMembers.id })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, db_1.workspaceMembers.workspaceId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId), (0, drizzle_orm_1.eq)(db_1.lists.id, listId)))
            .limit(1);
        return Boolean(row);
    }
    async findWorkspaceOwnerForList(listId) {
        const [row] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, db_1.workspaceMembers.workspaceId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        return row?.userId ?? null;
    }
    async findExistingByMessageId(messageId) {
        const [row] = await this.db
            .select({ id: db_1.inboundEmailMessages.id })
            .from(db_1.inboundEmailMessages)
            .where((0, drizzle_orm_1.eq)(db_1.inboundEmailMessages.messageId, messageId))
            .limit(1);
        return row ?? null;
    }
    async findAliasByListId(listId) {
        const [row] = await this.db
            .select()
            .from(db_1.listEmailAliases)
            .where((0, drizzle_orm_1.eq)(db_1.listEmailAliases.listId, listId))
            .limit(1);
        return row ?? null;
    }
    async findAliasByLocalPart(localPart) {
        const [row] = await this.db
            .select()
            .from(db_1.listEmailAliases)
            .where((0, drizzle_orm_1.eq)(db_1.listEmailAliases.localPart, localPart))
            .limit(1);
        return row ?? null;
    }
    async assertListExists(listId) {
        const [row] = await this.db.select({ id: db_1.lists.id }).from(db_1.lists).where((0, drizzle_orm_1.eq)(db_1.lists.id, listId)).limit(1);
        if (!row)
            throw new common_1.NotFoundException(`List ${listId} not found`);
    }
    async mintUniqueLocalPart() {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            // 9-char base32 — ~46 bits of entropy, short enough to type if needed
            const candidate = (0, node_crypto_1.randomBytes)(6).toString('base64url').slice(0, 9).toLowerCase();
            const existing = await this.findAliasByLocalPart(candidate);
            if (!existing)
                return candidate;
        }
        throw new Error('Failed to mint unique email alias after 8 attempts');
    }
    estimatePayloadBytes(payload) {
        const textLen = (payload.textBody?.length ?? 0) + (payload.htmlBody?.length ?? 0);
        const attLen = (payload.attachments ?? []).reduce((sum, a) => sum + a.content.length, 0);
        return textLen + attLen;
    }
    formatSubject(subject) {
        if (!subject)
            return '';
        return subject.replace(/^(re|fwd?):\s*/i, '').trim().slice(0, 240);
    }
    composeDescription(payload) {
        const text = (payload.textBody ?? this.htmlToText(payload.htmlBody ?? '')).trim();
        const header = `From: ${payload.fromName ? `${payload.fromName} <${payload.fromAddress}>` : payload.fromAddress}`;
        return [header, '', this.stripQuotedReply(text)].filter(Boolean).join('\n');
    }
    /** Drop the most common "On ... wrote:" reply quote so comments stay tidy. */
    stripQuotedReply(text) {
        if (!text)
            return '';
        const lines = text.split(/\r?\n/);
        const cutAt = lines.findIndex((l) => /^On .* wrote:$/i.test(l.trim()) ||
            /^-+\s*Original Message\s*-+$/i.test(l.trim()) ||
            /^From: .+@/i.test(l.trim()));
        if (cutAt > 0)
            return lines.slice(0, cutAt).join('\n').trimEnd();
        return text.trimEnd();
    }
    htmlToText(html) {
        return html
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
            .replace(/<\/p\s*>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    safeFilename(name) {
        return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'attachment';
    }
    async recordOutcome(payload, bytes, outcome, reason, listId, taskId, attachmentCount) {
        await this.db.insert(db_1.inboundEmailMessages).values({
            messageId: payload.messageId,
            inReplyTo: payload.inReplyTo ?? null,
            fromAddress: payload.fromAddress,
            fromName: payload.fromName ?? null,
            recipient: payload.recipient,
            subject: payload.subject ?? null,
            bytes,
            attachmentCount: attachmentCount ?? (payload.attachments?.length ?? 0),
            outcome,
            reason: reason ?? null,
            listId: listId ?? null,
            taskId: taskId ?? null,
        }).onConflictDoNothing();
    }
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
    async taskEmailAddress(taskId) {
        const [row] = await this.db
            .select({ listId: db_1.tasks.listId })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Task not found');
        const alias = await this.getAlias(row.listId);
        if (!alias || alias.revokedAt)
            return { address: null, listId: row.listId };
        const domain = process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.rundesk.local';
        return {
            address: `${LOCAL_PART_PREFIX}${alias.localPart}${TASK_TAG}${taskId}@${domain}`,
            listId: row.listId,
        };
    }
    aliasView(row) {
        const domain = process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.rundesk.local';
        return {
            id: row.id,
            listId: row.listId,
            localPart: row.localPart,
            address: `${LOCAL_PART_PREFIX}${row.localPart}@${domain}`,
            defaultPriority: row.defaultPriority,
            revokedAt: row.revokedAt,
            lastUsedAt: row.lastUsedAt,
            createdAt: row.createdAt,
        };
    }
};
exports.EmailToTaskService = EmailToTaskService;
exports.EmailToTaskService = EmailToTaskService = EmailToTaskService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, r2_service_1.R2Service,
        realtime_gateway_1.RealtimeGateway])
], EmailToTaskService);
//# sourceMappingURL=email-to-task.service.js.map