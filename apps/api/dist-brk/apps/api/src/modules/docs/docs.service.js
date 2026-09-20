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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocsService = exports.DOC_SCOPES = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const db_1 = require("@rundesk/db");
const db_2 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const search_service_1 = require("../search/search.service");
const notifications_service_1 = require("../notifications/notifications.service");
const tiptap_markdown_1 = require("./tiptap-markdown");
const pdf_1 = require("../reports/pdf");
/** Docs-hub buckets (A5.6). `all` excludes archived, matching the old default. */
exports.DOC_SCOPES = ['all', 'mine', 'shared', 'archived'];
// Extract plaintext for denormalized search.
function extractPlaintext(content) {
    if (!content || typeof content !== 'object')
        return '';
    const node = content;
    if (node.text)
        return node.text;
    if (Array.isArray(node.content)) {
        return node.content.map((n) => extractPlaintext(n)).filter(Boolean).join(' ');
    }
    return '';
}
let DocsService = class DocsService {
    constructor(db, realtime, search, notifications) {
        this.db = db;
        this.realtime = realtime;
        this.search = search;
        this.notifications = notifications;
    }
    async indexDocInSearch(docId) {
        try {
            const [row] = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, docId));
            if (!row)
                return;
            await this.search.indexDoc({
                id: row.id,
                title: row.title,
                plaintext: row.plaintext,
                workspaceId: row.workspaceId,
                spaceId: row.spaceId,
                createdAt: row.createdAt,
                // See indexTask: an edited doc must move under a "last updated" sort.
                updatedAt: row.updatedAt,
            });
        }
        catch {
            // best-effort
        }
    }
    /**
     * A5.6 / A5.7 — the hub buckets are filters over columns that already exist,
     * not a new model: `mine` reads `createdById`, `archived` flips the
     * `isArchived` predicate the tree relies on, and `shared` is the reverse
     * `object_shares` lookup. Every row also carries what an index table needs
     * (creator, location, subpage count, sharing state) so the table and the tree
     * are the same read.
     */
    async list(workspaceId, opts = {}) {
        const scope = opts.scope ?? 'all';
        const sharedIds = scope === 'shared' ? await this.docIdsSharedWith(workspaceId, opts.userId) : null;
        // A share grant on a doc nobody has shared means an empty bucket, not the
        // whole workspace — bail before the `inArray` would degenerate.
        if (sharedIds && sharedIds.length === 0)
            return [];
        const where = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.docs.isArchived, scope === 'archived'), scope === 'mine' && opts.userId ? (0, drizzle_orm_1.eq)(db_1.docs.createdById, opts.userId) : undefined, sharedIds ? (0, drizzle_orm_1.inArray)(db_1.docs.id, sharedIds) : undefined, opts.spaceId === null ? (0, drizzle_orm_1.isNull)(db_1.docs.spaceId) : opts.spaceId ? (0, drizzle_orm_1.eq)(db_1.docs.spaceId, opts.spaceId) : undefined, opts.parentDocId === null ? (0, drizzle_orm_1.isNull)(db_1.docs.parentDocId) : opts.parentDocId ? (0, drizzle_orm_1.eq)(db_1.docs.parentDocId, opts.parentDocId) : undefined);
        return this.db
            .select({
            id: db_1.docs.id,
            workspaceId: db_1.docs.workspaceId,
            spaceId: db_1.docs.spaceId,
            parentDocId: db_1.docs.parentDocId,
            createdById: db_1.docs.createdById,
            title: db_1.docs.title,
            icon: db_1.docs.icon,
            coverImageUrl: db_1.docs.coverImageUrl,
            content: db_1.docs.content,
            plaintext: db_1.docs.plaintext,
            position: db_1.docs.position,
            isArchived: db_1.docs.isArchived,
            publicShareId: db_1.docs.publicShareId,
            publicShareEnabledAt: db_1.docs.publicShareEnabledAt,
            createdAt: db_1.docs.createdAt,
            updatedAt: db_1.docs.updatedAt,
            createdByName: db_1.users.displayName,
            createdByEmail: db_1.users.email,
            spaceName: db_1.spaces.name,
            // Correlate on the outer row in SQL text — a bound `${docs.id}` would
            // collapse to one parameter and give every row the same count.
            subpageCount: (0, drizzle_orm_1.sql) `(
          select count(*)::int from docs child
          where child.parent_doc_id = docs.id and child.is_archived = false
        )`,
            shareCount: (0, drizzle_orm_1.sql) `(
          select count(*)::int from object_shares os
          where os.object_type = 'doc' and os.object_id = docs.id
        )`,
        })
            .from(db_1.docs)
            // Left: the creator may have been removed (createdById is set null), and
            // a workspace-level doc has no space.
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.docs.createdById))
            .leftJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.docs.spaceId))
            .where(where)
            .orderBy((0, drizzle_orm_1.asc)(db_1.docs.position), (0, drizzle_orm_1.asc)(db_1.docs.createdAt));
    }
    /**
     * Per-bucket totals for the docs hub rail (A5.6). Counted directly rather
     * than by length of `list()` — that would fetch every doc's jsonb body four
     * times to produce four integers.
     */
    async scopeCounts(workspaceId, userId) {
        const sharedIds = await this.docIdsSharedWith(workspaceId, userId);
        const count = async (extra) => {
            const [row] = await this.db
                .select({ n: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.docs)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), extra));
            return row?.n ?? 0;
        };
        const [all, mine, shared, archived] = await Promise.all([
            count((0, drizzle_orm_1.eq)(db_1.docs.isArchived, false)),
            count((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.isArchived, false), (0, drizzle_orm_1.eq)(db_1.docs.createdById, userId))),
            sharedIds.length === 0
                ? Promise.resolve(0)
                : count((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.isArchived, false), (0, drizzle_orm_1.inArray)(db_1.docs.id, sharedIds))),
            count((0, drizzle_orm_1.eq)(db_1.docs.isArchived, true)),
        ]);
        return { all, mine, shared, archived };
    }
    /** Doc ids in this workspace explicitly granted to `userId` (A1.7's table). */
    async docIdsSharedWith(workspaceId, userId) {
        if (!userId)
            return [];
        const rows = await this.db
            .select({ objectId: db_1.objectShares.objectId })
            .from(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.objectShares.objectType, 'doc'), (0, drizzle_orm_1.eq)(db_1.objectShares.userId, userId)));
        return rows.map((r) => r.objectId);
    }
    async get(docId) {
        const [row] = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, docId));
        if (!row)
            throw new common_1.NotFoundException('Doc not found');
        return row;
    }
    async assertDocAccess(docId, userId) {
        const [row] = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, docId));
        if (!row)
            throw new common_1.NotFoundException('Doc not found');
        const [membership] = await this.db
            .select({ userId: db_2.workspaceMembers.userId })
            .from(db_2.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_2.workspaceMembers.workspaceId, row.workspaceId), (0, drizzle_orm_1.eq)(db_2.workspaceMembers.userId, userId)));
        if (!membership)
            throw new common_1.NotFoundException('Doc not found');
        return row;
    }
    async getForUser(docId, userId) {
        return this.assertDocAccess(docId, userId);
    }
    /**
     * §V2-10 — the tasks linked to this doc.
     *
     * `[06:15]` "acha, is document ka yeh task hai" — she describes reading the
     * relationship FROM THE DOCUMENT. Rundesk has had `task_doc_links` since
     * relationships shipped and read it in exactly one direction:
     * `where(taskDocLinks.taskId)` in `tasks.service.listLinkedDocs`. A task knew
     * its docs; a doc knew nothing. Half a relationship is not a relationship —
     * linking from the task and then opening the doc showed no sign it had
     * happened.
     *
     * Visibility is filtered rather than assumed. Doc access is workspace
     * membership, but a linked task may be PRIVATE, and a doc that lists it would
     * be a way to read titles somebody is not allowed to see. So the same filter
     * the task lists use is applied here — a manager sees everything, everyone
     * else sees public tasks plus their own.
     */
    async listLinkedTasks(docId, userId, globalRole) {
        const doc = await this.assertDocAccess(docId, userId);
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, doc.workspaceId, userId, globalRole);
        const visible = (0, item_visibility_1.taskVisibilityFilter)(this.db, userId, isManager);
        return this.db
            .select({
            id: db_1.taskDocLinks.id,
            taskId: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            listId: db_1.tasks.listId,
            linkedAt: db_1.taskDocLinks.createdAt,
        })
            .from(db_1.taskDocLinks)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskDocLinks.taskId))
            .where(visible ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskDocLinks.docId, docId), visible) : (0, drizzle_orm_1.eq)(db_1.taskDocLinks.docId, docId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskDocLinks.createdAt));
    }
    async create(data) {
        const [row] = await this.db
            .insert(db_1.docs)
            .values({
            workspaceId: data.workspaceId,
            spaceId: data.spaceId ?? null,
            parentDocId: data.parentDocId ?? null,
            // Coerce defensively: a non-string title (e.g. a number from a
            // malformed client) would throw on `.trim()` and surface as a 500.
            title: (typeof data.title === 'string' ? data.title.trim() : '') || 'Untitled',
            icon: data.icon,
            createdById: data.createdById,
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
            plaintext: '',
        })
            .returning();
        await this.snapshotRevision(row, data.createdById);
        this.realtime.emitToWorkspace(data.workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } });
        void this.indexDocInSearch(row.id);
        return row;
    }
    /**
     * Export a doc as Markdown. Access-checked; the title becomes the top H1
     * unless the body already opens with one.
     */
    async exportDocMarkdown(docId, userId) {
        await this.assertDocAccess(docId, userId);
        const [doc] = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, docId)).limit(1);
        if (!doc)
            throw new common_1.NotFoundException('Doc not found');
        const body = (0, tiptap_markdown_1.tiptapToMarkdown)(doc.content);
        const markdown = body.startsWith('# ') ? body : `# ${doc.title}\n\n${body}`;
        const base = (doc.title || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';
        return { fileName: `${base}.md`, markdown };
    }
    /** Export a doc as a (line-based) PDF. Access-checked. */
    async exportDocPdf(docId, userId) {
        await this.assertDocAccess(docId, userId);
        const [doc] = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, docId)).limit(1);
        if (!doc)
            throw new common_1.NotFoundException('Doc not found');
        const pdf = (0, pdf_1.renderReportPdf)(doc.title || 'Untitled', (0, tiptap_markdown_1.tiptapToPlainLines)(doc.content));
        const base = (doc.title || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';
        return { fileName: `${base}.pdf`, pdf };
    }
    // ─── Doc templates ─────────────────────────────────────────────────────────
    /** Reusable doc templates in a workspace, most-recent first. */
    async listDocTemplates(workspaceId) {
        return this.db
            .select({
            id: db_1.docTemplates.id,
            name: db_1.docTemplates.name,
            description: db_1.docTemplates.description,
            icon: db_1.docTemplates.icon,
            createdById: db_1.docTemplates.createdById,
            createdAt: db_1.docTemplates.createdAt,
            updatedAt: db_1.docTemplates.updatedAt,
        })
            .from(db_1.docTemplates)
            .where((0, drizzle_orm_1.eq)(db_1.docTemplates.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.docTemplates.updatedAt));
    }
    /** Snapshot an existing doc's content into a reusable template. */
    async saveDocAsTemplate(workspaceId, userId, data) {
        // Coerce non-string name/description so `.trim()` can't throw a 500.
        const name = (typeof data.name === 'string' ? data.name : '').trim();
        if (!name)
            throw new common_1.ForbiddenException('Template name is required');
        const [doc] = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, data.docId)).limit(1);
        if (!doc || doc.workspaceId !== workspaceId)
            throw new common_1.NotFoundException('Doc not found in this workspace');
        const [row] = await this.db
            .insert(db_1.docTemplates)
            .values({
            workspaceId,
            name,
            description: (typeof data.description === 'string' ? data.description.trim() : '') || null,
            icon: doc.icon,
            content: doc.content,
            plaintext: doc.plaintext,
            createdById: userId,
        })
            .returning();
        return row;
    }
    /** Create a brand-new doc from a template's snapshot content. */
    async createDocFromTemplate(workspaceId, userId, templateId, opts = {}) {
        const [template] = await this.db.select().from(db_1.docTemplates).where((0, drizzle_orm_1.eq)(db_1.docTemplates.id, templateId)).limit(1);
        if (!template || template.workspaceId !== workspaceId)
            throw new common_1.NotFoundException('Template not found in this workspace');
        const [row] = await this.db
            .insert(db_1.docs)
            .values({
            workspaceId,
            spaceId: opts.spaceId ?? null,
            title: opts.title?.trim() || template.name,
            icon: template.icon,
            createdById: userId,
            content: template.content,
            plaintext: template.plaintext,
        })
            .returning();
        await this.snapshotRevision(row, userId);
        this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } });
        void this.indexDocInSearch(row.id);
        return row;
    }
    /** Delete a doc template (workspace-scoped). */
    async deleteDocTemplate(workspaceId, templateId) {
        const [row] = await this.db
            .delete(db_1.docTemplates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docTemplates.id, templateId), (0, drizzle_orm_1.eq)(db_1.docTemplates.workspaceId, workspaceId)))
            .returning({ id: db_1.docTemplates.id });
        if (!row)
            throw new common_1.NotFoundException('Template not found');
        return { ok: true };
    }
    async update(docId, userId, patch) {
        await this.assertDocAccess(docId, userId);
        if (patch.expectedUpdatedAt) {
            const [current] = await this.db
                .select({ updatedAt: db_1.docs.updatedAt })
                .from(db_1.docs)
                .where((0, drizzle_orm_1.eq)(db_1.docs.id, docId));
            if (!current)
                throw new common_1.NotFoundException('Doc not found');
            const expected = new Date(patch.expectedUpdatedAt).getTime();
            const actual = current.updatedAt ? new Date(current.updatedAt).getTime() : NaN;
            if (!Number.isFinite(expected) || expected !== actual) {
                throw new common_1.ConflictException('Doc was updated by a teammate. Refresh and retry your save.');
            }
        }
        const set = { ...patch, updatedAt: new Date() };
        delete set.expectedUpdatedAt;
        if (patch.content)
            set.plaintext = extractPlaintext(patch.content);
        const [row] = await this.db.update(db_1.docs).set(set).where((0, drizzle_orm_1.eq)(db_1.docs.id, docId)).returning();
        if (!row)
            throw new common_1.NotFoundException('Doc not found');
        if (patch.content)
            await this.snapshotRevision(row, userId);
        this.realtime.emitToDoc(docId, { type: 'doc.updated', docId, patch: set });
        this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { updated: true } });
        if (patch.title || patch.content)
            void this.indexDocInSearch(docId);
        return row;
    }
    // ─── Version history ───────────────────────────────────────────────────────
    // Snapshot the given doc state. Consecutive saves by the same editor within a
    // 2-minute window coalesce into the latest snapshot so history stays readable.
    async snapshotRevision(doc, editorId) {
        const [latest] = await this.db
            .select({ id: db_1.docRevisions.id, editorId: db_1.docRevisions.editorId, updatedAt: db_1.docRevisions.updatedAt })
            .from(db_1.docRevisions)
            .where((0, drizzle_orm_1.eq)(db_1.docRevisions.docId, doc.id))
            .orderBy((0, drizzle_orm_1.desc)(db_1.docRevisions.updatedAt))
            .limit(1);
        const within = latest?.updatedAt ? Date.now() - new Date(latest.updatedAt).getTime() < 2 * 60 * 1000 : false;
        if (latest && latest.editorId === editorId && within) {
            await this.db
                .update(db_1.docRevisions)
                .set({ title: doc.title, content: doc.content, plaintext: doc.plaintext, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.docRevisions.id, latest.id));
            return;
        }
        await this.db.insert(db_1.docRevisions).values({
            docId: doc.id,
            workspaceId: doc.workspaceId,
            editorId,
            title: doc.title,
            content: doc.content,
            plaintext: doc.plaintext,
        });
    }
    async listRevisions(docId, userId) {
        await this.assertDocAccess(docId, userId);
        const rows = await this.db
            .select({
            id: db_1.docRevisions.id,
            title: db_1.docRevisions.title,
            createdAt: db_1.docRevisions.createdAt,
            updatedAt: db_1.docRevisions.updatedAt,
            editor: { id: db_1.users.id, displayName: db_1.users.displayName, avatarUrl: db_1.users.avatarUrl },
        })
            .from(db_1.docRevisions)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.docRevisions.editorId))
            .where((0, drizzle_orm_1.eq)(db_1.docRevisions.docId, docId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.docRevisions.updatedAt))
            .limit(100);
        return rows;
    }
    async getRevision(docId, revisionId, userId) {
        await this.assertDocAccess(docId, userId);
        const [row] = await this.db
            .select()
            .from(db_1.docRevisions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docRevisions.id, revisionId), (0, drizzle_orm_1.eq)(db_1.docRevisions.docId, docId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Revision not found');
        return row;
    }
    // Restore a past revision by writing its content back through the normal
    // update path (which itself snapshots the pre-restore state).
    async restoreRevision(docId, revisionId, userId) {
        const rev = await this.getRevision(docId, revisionId, userId);
        return this.update(docId, userId, { title: rev.title, content: rev.content });
    }
    async delete(docId, actorId) {
        const [row] = await this.db
            .update(db_1.docs)
            .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.docs.id, docId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Doc not found');
        this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { archived: true } });
        return { ok: true };
    }
    async deleteForUser(docId, userId) {
        await this.assertDocAccess(docId, userId);
        const [row] = await this.db
            .update(db_1.docs)
            .set({ isArchived: true, archivedAt: new Date(), archivedById: userId, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.docs.id, docId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Doc not found');
        this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { archived: true } });
        return { ok: true };
    }
    // ─── Public anonymous share ─────────────────────────────────────────────────
    /**
     * Turn on public read-only sharing for the doc. Returns the slug for the
     * /d/<slug> route. Idempotent: returns the existing slug if already shared.
     */
    async enablePublicShare(docId, userId) {
        const doc = await this.assertDocAccess(docId, userId);
        if (doc.publicShareId) {
            return { publicShareId: doc.publicShareId, publicShareEnabledAt: doc.publicShareEnabledAt };
        }
        // §A4.2 — the workspace can withdraw the right to mint anonymous links at
        // all. Checked here rather than in the controller so no other caller can
        // reach the slug generator around it. Revoking an existing link stays
        // possible, which is why disablePublicShare is not gated.
        const [workspace] = await this.db
            .select({ blockPublicSharing: db_1.workspaces.blockPublicSharing })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, doc.workspaceId))
            .limit(1);
        if (workspace?.blockPublicSharing) {
            throw new common_1.ForbiddenException('Public sharing is disabled for this workspace');
        }
        const slug = (0, node_crypto_1.randomBytes)(12).toString('base64url');
        const [row] = await this.db
            .update(db_1.docs)
            .set({ publicShareId: slug, publicShareEnabledAt: new Date(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.docs.id, docId))
            .returning();
        this.realtime.emitToWorkspace(doc.workspaceId, {
            type: 'doc.updated',
            docId,
            patch: { publicShareId: row.publicShareId },
        });
        return { publicShareId: row.publicShareId, publicShareEnabledAt: row.publicShareEnabledAt };
    }
    async disablePublicShare(docId, userId) {
        const doc = await this.assertDocAccess(docId, userId);
        if (!doc.publicShareId)
            return { ok: true };
        await this.db
            .update(db_1.docs)
            .set({ publicShareId: null, publicShareEnabledAt: null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.docs.id, docId));
        this.realtime.emitToWorkspace(doc.workspaceId, {
            type: 'doc.updated',
            docId,
            patch: { publicShareId: null },
        });
        return { ok: true };
    }
    /**
     * Anonymous lookup by share slug. Returns only the fields safe for public
     * viewers: title, icon, cover, content, updated_at. Comments, ACL state,
     * and member identity are deliberately excluded.
     */
    async getByPublicShare(slug) {
        if (!slug || slug.length > 64)
            throw new common_1.NotFoundException('Doc not found');
        const [row] = await this.db
            .select({
            id: db_1.docs.id,
            title: db_1.docs.title,
            icon: db_1.docs.icon,
            coverImageUrl: db_1.docs.coverImageUrl,
            content: db_1.docs.content,
            updatedAt: db_1.docs.updatedAt,
            publicShareId: db_1.docs.publicShareId,
            isArchived: db_1.docs.isArchived,
        })
            .from(db_1.docs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.publicShareId, slug), (0, drizzle_orm_1.isNotNull)(db_1.docs.publicShareId)))
            .limit(1);
        if (!row || row.isArchived)
            throw new common_1.NotFoundException('Doc not found');
        return {
            id: row.id,
            title: row.title,
            icon: row.icon,
            coverImageUrl: row.coverImageUrl,
            content: row.content,
            updatedAt: row.updatedAt,
        };
    }
    // ─── Comments ───────────────────────────────────────────────────────────────
    async listComments(docId, userId, opts = {}) {
        const doc = await this.assertDocAccess(docId, userId);
        const rows = await this.db
            .select({
            id: db_1.docComments.id,
            docId: db_1.docComments.docId,
            workspaceId: db_1.docComments.workspaceId,
            authorId: db_1.docComments.authorId,
            parentCommentId: db_1.docComments.parentCommentId,
            body: db_1.docComments.body,
            selection: db_1.docComments.selection,
            isResolved: db_1.docComments.isResolved,
            resolvedById: db_1.docComments.resolvedById,
            resolvedAt: db_1.docComments.resolvedAt,
            createdAt: db_1.docComments.createdAt,
            updatedAt: db_1.docComments.updatedAt,
            authorName: db_1.users.displayName,
            authorEmail: db_1.users.email,
            authorAvatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.docComments)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.docComments.authorId))
            .where((0, drizzle_orm_1.eq)(db_1.docComments.docId, docId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.docComments.createdAt));
        const filtered = opts.includeResolved === false ? rows.filter((r) => !r.isResolved) : rows;
        return { docId: doc.id, workspaceId: doc.workspaceId, comments: filtered };
    }
    async createComment(docId, userId, body) {
        const doc = await this.assertDocAccess(docId, userId);
        const trimmed = body.body?.trim();
        if (!trimmed)
            throw new common_1.ConflictException('Comment body is required');
        if (body.parentCommentId) {
            const [parent] = await this.db
                .select({ id: db_1.docComments.id, docId: db_1.docComments.docId })
                .from(db_1.docComments)
                .where((0, drizzle_orm_1.eq)(db_1.docComments.id, body.parentCommentId))
                .limit(1);
            if (!parent || parent.docId !== docId) {
                throw new common_1.NotFoundException('Parent comment not found');
            }
        }
        const [created] = await this.db
            .insert(db_1.docComments)
            .values({
            docId,
            workspaceId: doc.workspaceId,
            authorId: userId,
            parentCommentId: body.parentCommentId ?? null,
            body: trimmed,
            selection: body.selection ?? null,
        })
            .returning();
        this.realtime.emitToDoc(docId, {
            type: 'doc.comment.created',
            docId,
            commentId: created.id,
            parentCommentId: created.parentCommentId,
        });
        void this.notifyDocCommentRecipients(doc, created, userId, trimmed);
        return created;
    }
    /**
     * Notify the doc creator, the parent comment author (for replies), and any
     * @-mentioned workspace members. Always best-effort.
     */
    async notifyDocCommentRecipients(doc, comment, actorId, bodyText) {
        try {
            const recipients = new Map();
            if (doc.createdById && doc.createdById !== actorId) {
                recipients.set(doc.createdById, 'author');
            }
            if (comment.parentCommentId) {
                const [parent] = await this.db
                    .select({ authorId: db_1.docComments.authorId })
                    .from(db_1.docComments)
                    .where((0, drizzle_orm_1.eq)(db_1.docComments.id, comment.parentCommentId))
                    .limit(1);
                if (parent?.authorId && parent.authorId !== actorId) {
                    recipients.set(parent.authorId, 'reply');
                }
            }
            const mentionedIds = await this.resolveMentions(doc.workspaceId, bodyText);
            for (const userId of mentionedIds) {
                if (userId !== actorId)
                    recipients.set(userId, 'mention');
            }
            if (recipients.size === 0)
                return;
            const docTitle = doc.title || 'Untitled doc';
            const snippet = bodyText.slice(0, 240);
            for (const [userId, kind] of recipients) {
                const type = kind === 'mention' ? 'doc_mentioned' : 'doc_commented';
                const title = kind === 'mention'
                    ? `You were mentioned in "${docTitle}"`
                    : kind === 'reply'
                        ? `Reply to your comment on "${docTitle}"`
                        : `New comment on "${docTitle}"`;
                await this.notifications.create({
                    userId,
                    workspaceId: doc.workspaceId,
                    actorId,
                    type,
                    title,
                    body: snippet,
                    target: {
                        entityType: 'doc',
                        entityId: doc.id,
                        url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
                    },
                    emailContext: { commentSnippet: snippet },
                });
            }
        }
        catch (err) {
            // best-effort; never break the comment write
            // eslint-disable-next-line no-console
            console.error('[docs.notifyDocCommentRecipients] failed:', err);
        }
    }
    /**
     * Extract @-mentions from a comment body and resolve them to workspace
     * member user ids. Mentions match common formats:
     *   - @[Display Name](user:uuid)
     *   - @email@example.com
     *   - bare @username substrings against workspace display names
     */
    async resolveMentions(workspaceId, text) {
        if (!text || text.length < 2)
            return [];
        const ids = new Set();
        const refMatches = text.matchAll(/@\[[^\]]+\]\(user:([0-9a-f-]{36})\)/gi);
        for (const m of refMatches)
            ids.add(m[1]);
        const emailMatches = text.matchAll(/@([\w.+-]+@[\w-]+\.[\w.-]+)/g);
        const emails = Array.from(emailMatches, (m) => m[1].toLowerCase());
        if (emails.length > 0) {
            const rows = await this.db
                .select({ userId: db_1.users.id, email: db_1.users.email })
                .from(db_1.users)
                .innerJoin(db_2.workspaceMembers, (0, drizzle_orm_1.eq)(db_2.workspaceMembers.userId, db_1.users.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_2.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.users.email, emails)));
            for (const r of rows)
                ids.add(r.userId);
        }
        const nameTokens = Array.from(text.matchAll(/@([a-zA-Z][\w-]{1,40})/g), (m) => m[1].toLowerCase());
        if (nameTokens.length > 0) {
            const memberRows = await this.db
                .select({ userId: db_1.users.id, name: db_1.users.displayName, email: db_1.users.email })
                .from(db_1.users)
                .innerJoin(db_2.workspaceMembers, (0, drizzle_orm_1.eq)(db_2.workspaceMembers.userId, db_1.users.id))
                .where((0, drizzle_orm_1.eq)(db_2.workspaceMembers.workspaceId, workspaceId));
            for (const token of nameTokens) {
                for (const row of memberRows) {
                    const normalizedName = (row.name ?? '').toLowerCase().replace(/\s+/g, '');
                    const localPart = (row.email ?? '').split('@')[0].toLowerCase();
                    if (normalizedName.includes(token) || localPart === token) {
                        ids.add(row.userId);
                    }
                }
            }
        }
        return Array.from(ids);
    }
    async updateComment(commentId, userId, patch) {
        const [existing] = await this.db.select().from(db_1.docComments).where((0, drizzle_orm_1.eq)(db_1.docComments.id, commentId)).limit(1);
        if (!existing)
            throw new common_1.NotFoundException('Comment not found');
        await this.assertDocAccess(existing.docId, userId);
        if (existing.authorId && existing.authorId !== userId) {
            throw new common_1.ForbiddenException('Only the author can edit this comment');
        }
        const trimmed = patch.body?.trim();
        if (!trimmed)
            throw new common_1.ConflictException('Comment body is required');
        const [updated] = await this.db
            .update(db_1.docComments)
            .set({ body: trimmed, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.docComments.id, commentId))
            .returning();
        this.realtime.emitToDoc(existing.docId, {
            type: 'doc.comment.updated',
            docId: existing.docId,
            commentId,
        });
        return updated;
    }
    async setCommentResolution(commentId, userId, resolved) {
        const [existing] = await this.db.select().from(db_1.docComments).where((0, drizzle_orm_1.eq)(db_1.docComments.id, commentId)).limit(1);
        if (!existing)
            throw new common_1.NotFoundException('Comment not found');
        await this.assertDocAccess(existing.docId, userId);
        const [updated] = await this.db
            .update(db_1.docComments)
            .set({
            isResolved: resolved,
            resolvedById: resolved ? userId : null,
            resolvedAt: resolved ? new Date() : null,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.docComments.id, commentId))
            .returning();
        this.realtime.emitToDoc(existing.docId, {
            type: 'doc.comment.resolution_changed',
            docId: existing.docId,
            commentId,
            isResolved: resolved,
        });
        if (resolved) {
            void this.notifyDocCommentResolved(existing, userId);
        }
        return updated;
    }
    async notifyDocCommentResolved(comment, actorId) {
        try {
            const [doc] = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, comment.docId)).limit(1);
            if (!doc)
                return;
            const recipientIds = new Set();
            if (comment.authorId && comment.authorId !== actorId)
                recipientIds.add(comment.authorId);
            if (comment.parentCommentId) {
                const [parent] = await this.db
                    .select({ authorId: db_1.docComments.authorId })
                    .from(db_1.docComments)
                    .where((0, drizzle_orm_1.eq)(db_1.docComments.id, comment.parentCommentId))
                    .limit(1);
                if (parent?.authorId && parent.authorId !== actorId)
                    recipientIds.add(parent.authorId);
            }
            if (recipientIds.size === 0)
                return;
            const docTitle = doc.title || 'Untitled doc';
            const snippet = comment.body.slice(0, 240);
            const target = {
                entityType: 'doc',
                entityId: doc.id,
                url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
            };
            for (const userId of recipientIds) {
                await this.notifications.create({
                    userId,
                    workspaceId: doc.workspaceId,
                    actorId,
                    type: 'doc_commented',
                    title: `Your comment was resolved on "${docTitle}"`,
                    body: snippet,
                    target,
                    emailContext: { commentSnippet: snippet },
                });
            }
        }
        catch {
            // Best-effort
        }
    }
    async deleteComment(commentId, userId) {
        const [existing] = await this.db.select().from(db_1.docComments).where((0, drizzle_orm_1.eq)(db_1.docComments.id, commentId)).limit(1);
        if (!existing)
            throw new common_1.NotFoundException('Comment not found');
        await this.assertDocAccess(existing.docId, userId);
        if (existing.authorId && existing.authorId !== userId) {
            throw new common_1.ForbiddenException('Only the author can delete this comment');
        }
        await this.db.delete(db_1.docComments).where((0, drizzle_orm_1.eq)(db_1.docComments.id, commentId));
        this.realtime.emitToDoc(existing.docId, {
            type: 'doc.comment.removed',
            docId: existing.docId,
            commentId,
        });
        return { ok: true };
    }
};
exports.DocsService = DocsService;
exports.DocsService = DocsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, realtime_gateway_1.RealtimeGateway,
        search_service_1.SearchService,
        notifications_service_1.NotificationsService])
], DocsService);
//# sourceMappingURL=docs.service.js.map