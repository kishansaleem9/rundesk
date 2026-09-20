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
var KnowledgeIndexerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeIndexerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const r2_service_1 = require("../../common/storage/r2.service");
const embedding_service_1 = require("./embedding.service");
const embedding_1 = require("./embedding");
const attachment_text_1 = require("./attachment-text");
/**
 * §15.1 indexer — embeds a workspace's tasks (title+description), docs
 * (title+plaintext), task comments (body), and the extracted text of
 * text-format task attachments into `knowledge_embeddings`.
 *
 * Upsert-by-source with content-hash skip: a source whose text is unchanged
 * since last run (same `content_hash`) and whose stored vector already has the
 * current embedder's dimension is left untouched, so re-indexing is cheap and
 * idempotent. Workspace-scoped throughout.
 *
 * Trigger (b) is a nightly @Cron that re-indexes every workspace — chosen over
 * per-write hooks so the whole feature lives inside the AI module (the tasks/
 * docs modules are reused read-only). The backfill endpoint
 * POST /workspaces/:id/knowledge/reindex (admin) is trigger (a).
 */
let KnowledgeIndexerService = KnowledgeIndexerService_1 = class KnowledgeIndexerService {
    constructor(db, embeddings, r2) {
        this.db = db;
        this.embeddings = embeddings;
        this.r2 = r2;
        this.logger = new common_1.Logger(KnowledgeIndexerService_1.name);
    }
    /** Build the task/doc/comment URL used for citations (mirrors SearchService). */
    taskUrl(workspaceId, spaceId, projectId, listId, taskId) {
        return `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`;
    }
    /**
     * Gather every embeddable source in a workspace as normalized items. Public so
     * it can be unit-tested against a table-keyed DB mock without touching vectors.
     */
    async collectSources(workspaceId) {
        const items = [];
        const taskRows = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            description: db_1.tasks.description,
            listId: db_1.tasks.listId,
            spaceId: db_1.spaces.id,
            projectId: db_1.projects.id,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false)));
        for (const t of taskRows) {
            items.push({
                sourceType: 'task',
                sourceId: t.id,
                title: t.title,
                url: this.taskUrl(workspaceId, t.spaceId, t.projectId, t.listId, t.id),
                text: `${t.title}\n${t.description ?? ''}`.trim(),
            });
        }
        const docRows = await this.db
            .select({ id: db_1.docs.id, title: db_1.docs.title, plaintext: db_1.docs.plaintext })
            .from(db_1.docs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.docs.isArchived, false)));
        for (const d of docRows) {
            items.push({
                sourceType: 'doc',
                sourceId: d.id,
                title: d.title,
                url: `/app/${workspaceId}/docs?doc=${d.id}`,
                text: `${d.title}\n${d.plaintext ?? ''}`.trim(),
            });
        }
        /*
         * §G14-15 — meeting notes.
         *
         * Indexed on the notes, not the title: a meeting called "Weekly sync"
         * tells retrieval nothing, and what somebody wants back is the decision
         * inside it. A meeting with no notes is skipped rather than embedded as a
         * bare heading — a vector for a title alone matches everything vaguely
         * organisational and answers nothing.
         */
        const meetingRows = await this.db
            .select({ id: db_1.meetings.id, title: db_1.meetings.title, notes: db_1.meetings.notes })
            .from(db_1.meetings)
            .where((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId));
        for (const m of meetingRows) {
            const notes = (m.notes ?? '').trim();
            if (!notes)
                continue;
            items.push({
                sourceType: 'meeting',
                sourceId: m.id,
                title: m.title,
                url: `/app/${workspaceId}/meetings?meeting=${m.id}`,
                text: `${m.title}\n${notes}`.trim(),
            });
        }
        const commentRows = await this.db
            .select({
            id: db_1.taskComments.id,
            body: db_1.taskComments.body,
            taskId: db_1.tasks.id,
            taskTitle: db_1.tasks.title,
            listId: db_1.tasks.listId,
            spaceId: db_1.spaces.id,
            projectId: db_1.projects.id,
        })
            .from(db_1.taskComments)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskComments.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId));
        for (const c of commentRows) {
            const body = (c.body ?? '').trim();
            if (!body)
                continue;
            items.push({
                sourceType: 'comment',
                sourceId: c.id,
                title: `Comment on ${c.taskTitle}`,
                url: this.taskUrl(workspaceId, c.spaceId, c.projectId, c.listId, c.taskId),
                text: body,
            });
        }
        return items;
    }
    /**
     * Gather every text/extractable attachment in a workspace as normalized items,
     * reading each object's bytes from R2 and extracting UTF-8 text.
     *
     * Access: an attachment inherits its parent task's container access, so it is
     * cited at the task URL and carries the same space/project scope — the same
     * `filterAccessibleHits` gate that scopes tasks/comments then scopes it too.
     *
     * Binaries (pdf/docx/images/zip/…) are skipped without any parser dependency
     * (see attachment-text.ts). R2-gated: with no storage configured this returns
     * `[]` so the rest of the reindex still runs. Best-effort per attachment — a
     * single unreadable object is logged and skipped, never fatal to the run.
     *
     * NOTE: extracting text from PDF/Office documents would require a heavy parser
     * lib (pdf-parse / mammoth / OCR) and is intentionally out of scope; only text
     * formats are indexed here.
     */
    async collectAttachmentSources(workspaceId) {
        if (!this.r2?.configured) {
            this.logger.debug(`Attachment indexing skipped for workspace ${workspaceId}: R2 not configured`);
            return [];
        }
        const r2 = this.r2;
        const attachmentRows = await this.db
            .select({
            id: db_1.taskAttachments.id,
            fileName: db_1.taskAttachments.fileName,
            contentType: db_1.taskAttachments.contentType,
            storageKey: db_1.taskAttachments.storageKey,
            sizeBytes: db_1.taskAttachments.sizeBytes,
            taskId: db_1.tasks.id,
            listId: db_1.tasks.listId,
            spaceId: db_1.spaces.id,
            projectId: db_1.projects.id,
        })
            .from(db_1.taskAttachments)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAttachments.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false)));
        const items = [];
        let failed = 0;
        for (const a of attachmentRows) {
            // Skip non-text binaries cleanly (no parser dependency).
            if (!(0, attachment_text_1.isExtractableAttachment)(a.contentType))
                continue;
            // Don't pull a very large object fully into memory just to truncate it.
            if (typeof a.sizeBytes === 'number' && a.sizeBytes > attachment_text_1.MAX_ATTACHMENT_BYTES)
                continue;
            try {
                const bytes = await r2.getObject(a.storageKey);
                const text = (0, attachment_text_1.extractAttachmentText)(bytes, a.contentType, attachment_text_1.ATTACHMENT_TEXT_CAP);
                if (!text)
                    continue;
                items.push({
                    sourceType: 'attachment',
                    sourceId: a.id,
                    title: a.fileName,
                    url: this.taskUrl(workspaceId, a.spaceId, a.projectId, a.listId, a.taskId),
                    text,
                });
            }
            catch (err) {
                failed++;
                this.logger.warn(`Failed to read attachment ${a.id} (${a.fileName}) from R2 — ${err.message}`);
            }
        }
        if (failed > 0) {
            this.logger.warn(`Attachment indexing for workspace ${workspaceId}: ${failed} attachment(s) unreadable`);
        }
        return items;
    }
    /**
     * Embed and upsert a workspace's content, skipping sources whose text is
     * unchanged (same content hash) and already stored at the current dimension.
     * Best-effort per source; never throws for one bad row.
     */
    async indexWorkspaceContent(workspaceId) {
        // Tasks/docs/comments (from the live tables) plus text attachments (bytes
        // read from R2). Both trigger (a) /reindex and trigger (b) the nightly cron
        // flow through here, so attachments are indexed by both.
        const items = [
            ...(await this.collectSources(workspaceId)),
            ...(await this.collectAttachmentSources(workspaceId)),
        ];
        // Existing rows keyed by "type:id" → { contentHash, dim } for skip decisions.
        const existingRows = await this.db
            .select({
            sourceType: db_1.knowledgeEmbeddings.sourceType,
            sourceId: db_1.knowledgeEmbeddings.sourceId,
            contentHash: db_1.knowledgeEmbeddings.contentHash,
            dim: db_1.knowledgeEmbeddings.dim,
        })
            .from(db_1.knowledgeEmbeddings)
            .where((0, drizzle_orm_1.eq)(db_1.knowledgeEmbeddings.workspaceId, workspaceId));
        const existing = new Map();
        for (const r of existingRows)
            existing.set(`${r.sourceType}:${r.sourceId}`, { contentHash: r.contentHash, dim: r.dim });
        // Local embedder has a known fixed dim; the API path can't be checked
        // without embedding, so skip on hash alone there (its dim is model-stable).
        const expectedDim = this.embeddings.usesApi() ? null : this.embeddings.dim;
        let indexed = 0;
        let skipped = 0;
        for (const item of items) {
            const hash = (0, embedding_1.contentHash)(item.text);
            const prev = existing.get(`${item.sourceType}:${item.sourceId}`);
            if (prev && prev.contentHash === hash && (expectedDim === null || prev.dim === expectedDim)) {
                skipped++;
                continue;
            }
            try {
                const { vector, dim } = await this.embeddings.embed(item.text);
                await this.db
                    .insert(db_1.knowledgeEmbeddings)
                    .values({
                    workspaceId,
                    sourceType: item.sourceType,
                    sourceId: item.sourceId,
                    title: item.title,
                    url: item.url,
                    contentHash: hash,
                    embedding: vector,
                    dim,
                    updatedAt: new Date(),
                })
                    .onConflictDoUpdate({
                    target: [db_1.knowledgeEmbeddings.sourceType, db_1.knowledgeEmbeddings.sourceId],
                    set: {
                        workspaceId,
                        title: item.title,
                        url: item.url,
                        contentHash: hash,
                        embedding: vector,
                        dim,
                        updatedAt: new Date(),
                    },
                });
                indexed++;
            }
            catch (err) {
                this.logger.warn(`Failed to index ${item.sourceType}:${item.sourceId} — ${err.message}`);
            }
        }
        this.logger.log(`Indexed workspace ${workspaceId}: ${indexed} embedded, ${skipped} unchanged (${items.length} sources)`);
        return { total: items.length, indexed, skipped };
    }
    /**
     * Nightly reindex of every workspace (trigger b). Best-effort and sequential
     * so it stays bounded; each workspace only re-embeds changed content.
     */
    async reindexAllWorkspaces() {
        const rows = await this.db.select({ id: db_1.workspaces.id }).from(db_1.workspaces);
        for (const w of rows) {
            try {
                await this.indexWorkspaceContent(w.id);
            }
            catch (err) {
                this.logger.warn(`Nightly reindex failed for workspace ${w.id} — ${err.message}`);
            }
        }
    }
};
exports.KnowledgeIndexerService = KnowledgeIndexerService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_3AM, { name: 'knowledge-reindex-nightly' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], KnowledgeIndexerService.prototype, "reindexAllWorkspaces", null);
exports.KnowledgeIndexerService = KnowledgeIndexerService = KnowledgeIndexerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object, embedding_service_1.EmbeddingService,
        r2_service_1.R2Service])
], KnowledgeIndexerService);
//# sourceMappingURL=knowledge-indexer.service.js.map