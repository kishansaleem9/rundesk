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
var SearchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchService = void 0;
exports.meiliSort = meiliSort;
const common_1 = require("@nestjs/common");
const drive_scope_1 = require("./drive-scope");
const sources_1 = require("./sources");
const config_1 = require("@nestjs/config");
const meilisearch_1 = require("meilisearch");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const r2_service_1 = require("../../common/storage/r2.service");
const safe_fetch_1 = require("../../common/http/safe-fetch");
const item_visibility_1 = require("../../common/permissions/item-visibility");
// Free-text custom-field types get a case-insensitive "contains" match; every
// other type (dropdown, number, money, rating, date, checkbox) matches exactly.
const TEXT_LIKE_FIELD_TYPES = new Set(['text', 'url', 'email', 'phone']);
/** Meili sort expression for a timestamp mode; undefined when relevance is wanted. */
function meiliSort(sort) {
    if (sort === 'updated')
        return ['updatedAt:desc'];
    if (sort === 'created')
        return ['createdAt:desc'];
    return undefined;
}
/**
 * §G03-6 — the key an engagement row is counted under.
 *
 * A search hit's id is `"<type>-<rawId>"` and the engagement table keeps the
 * two in separate columns, so this is the one place the two spellings meet.
 * Split on the FIRST hyphen only: a uuid contains four more, and splitting on
 * all of them silently produces a key that matches nothing — a trending sort
 * that quietly scores everything zero and looks exactly like a sort nobody uses.
 */
function engagementKey(hitId) {
    const at = hitId.indexOf('-');
    return at < 0 ? `:${hitId}` : `${hitId.slice(0, at)}:${hitId.slice(at + 1)}`;
}
let SearchService = SearchService_1 = class SearchService {
    constructor(db, config, r2) {
        this.db = db;
        this.config = config;
        this.r2 = r2;
        this.logger = new common_1.Logger('SearchService');
        this.enabled = false;
    }
    async onModuleInit() {
        const host = this.config.get('MEILISEARCH_URL') ?? this.config.get('MEILI_HOST');
        const apiKey = this.config.get('MEILISEARCH_MASTER_KEY') ?? this.config.get('MEILI_MASTER_KEY');
        if (!host) {
            this.logger.warn('MEILISEARCH_URL not set - falling back to Postgres ILIKE search');
            return;
        }
        try {
            this.client = new meilisearch_1.MeiliSearch({ host, apiKey });
            this.index = this.client.index('rundesk');
            // Ensure index exists (non-fatal on failure)
            await this.client.createIndex('rundesk', { primaryKey: 'id' }).catch(() => { });
            await this.index.updateSettings({
                searchableAttributes: ['title', 'content'],
                filterableAttributes: ['entityType', 'workspaceId', 'listId', 'spaceId'],
                sortableAttributes: ['createdAt', 'updatedAt'],
            });
            this.enabled = true;
            this.logger.log(`Meilisearch connected at ${host}`);
        }
        catch (err) {
            this.logger.warn(`Meilisearch init failed: ${err.message}`);
        }
    }
    async indexTask(task, workspaceId, spaceId, projectId) {
        if (!this.enabled || !this.index)
            return;
        await this.index.addDocuments([{
                id: `task-${task.id}`,
                entityType: 'task',
                workspaceId,
                listId: task.listId,
                spaceId,
                title: task.title,
                content: task.description ?? '',
                url: `/app/${workspaceId}/${spaceId}/${projectId}/${task.listId}?task=${task.id}`,
                createdAt: new Date(task.createdAt).getTime(),
                // Fall back to createdAt rather than 0 — a document that sorts to the
                // epoch would look like the oldest thing in the workspace.
                updatedAt: new Date(task.updatedAt ?? task.createdAt).getTime(),
            }]);
    }
    async indexDoc(doc) {
        if (!this.enabled || !this.index)
            return;
        await this.index.addDocuments([{
                id: `doc-${doc.id}`,
                entityType: 'doc',
                workspaceId: doc.workspaceId,
                spaceId: doc.spaceId ?? undefined,
                title: doc.title,
                content: doc.plaintext,
                url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
                createdAt: new Date(doc.createdAt).getTime(),
                updatedAt: new Date(doc.updatedAt ?? doc.createdAt).getTime(),
            }]);
    }
    /**
     * Index an uploaded file (task attachment) under the `file` entity type
     * (Plan §11.1). It carries the owning task's workspace/space so Meili's
     * workspace filter keeps it invisible to other workspaces — the same way
     * indexed tasks are scoped — and links back to the task it belongs to.
     */
    /**
     * Take a task back out of the index.
     *
     * There was no removal path anywhere in the codebase: `indexTask` wrote on
     * create and on edit, and nothing ever deleted, so a binned task stayed in
     * Meili for good and the index only grew. Those documents are pure dead
     * weight — an archived task can never be returned from here, because a
     * search asking for archived work skips Meili entirely and goes to Postgres
     * — yet they still occupied the result pages that live work needed.
     *
     * Never fatal. Losing the index entry for something the caller has just
     * binned is not a reason to fail their delete; the read path filters against
     * Postgres regardless, so a document that outlives its task is stale rather
     * than dangerous.
     */
    async removeTask(taskId) {
        if (!this.enabled || !this.index)
            return;
        await this.index.deleteDocument(`task-${taskId}`).catch(() => undefined);
    }
    async indexTaskAttachment(attachment, task, workspaceId, spaceId, projectId) {
        if (!this.enabled || !this.index)
            return;
        await this.index.addDocuments([{
                id: `file-${attachment.id}`,
                entityType: 'file',
                workspaceId,
                listId: task.listId,
                spaceId,
                title: attachment.fileName,
                content: attachment.contentType,
                url: `/app/${workspaceId}/${spaceId}/${projectId}/${task.listId}?task=${task.id}`,
                createdAt: new Date(attachment.createdAt).getTime(),
                // An uploaded file is never edited in place, so it was last "updated"
                // when it was uploaded.
                updatedAt: new Date(attachment.createdAt).getTime(),
            }]);
    }
    async reindexWorkspace(workspaceId) {
        if (!this.enabled || !this.index)
            return;
        const taskRows = await this.db
            .select({
            task: db_1.tasks,
            spaceId: db_1.spaces.id,
            projectId: db_1.projects.id,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false)));
        const docRows = await this.db.select().from(db_1.docs).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.docs.isArchived, false)));
        // Uploaded files (task attachments). Scoped through the owning task's
        // list → project → space so only this workspace's files are indexed.
        const attachmentRows = await this.db
            .select({
            attachment: db_1.taskAttachments,
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
        const payload = [
            ...taskRows.map(({ task, spaceId, projectId }) => ({
                id: `task-${task.id}`,
                entityType: 'task',
                workspaceId,
                listId: task.listId,
                spaceId,
                title: task.title,
                content: task.description ?? '',
                url: `/app/${workspaceId}/${spaceId}/${projectId}/${task.listId}?task=${task.id}`,
                createdAt: new Date(task.createdAt).getTime(),
                updatedAt: new Date(task.updatedAt ?? task.createdAt).getTime(),
            })),
            ...docRows.map((d) => ({
                id: `doc-${d.id}`,
                entityType: 'doc',
                workspaceId,
                spaceId: d.spaceId ?? undefined,
                title: d.title,
                content: d.plaintext,
                url: `/app/${workspaceId}/docs?doc=${d.id}`,
                createdAt: new Date(d.createdAt).getTime(),
                updatedAt: new Date(d.updatedAt ?? d.createdAt).getTime(),
            })),
            ...attachmentRows.map(({ attachment, taskId, listId, spaceId, projectId }) => ({
                id: `file-${attachment.id}`,
                entityType: 'file',
                workspaceId,
                listId,
                spaceId,
                title: attachment.fileName,
                content: attachment.contentType,
                url: `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`,
                createdAt: new Date(attachment.createdAt).getTime(),
                updatedAt: new Date(attachment.createdAt).getTime(),
            })),
        ];
        /*
         * Clear this workspace's documents before writing the new ones.
         *
         * It only ever added, which meant "reindex" could not do the one thing the
         * word promises: make the index match reality. Anything already indexed
         * and no longer live — a task binned before removal-on-archive existed, a
         * doc deleted by a cascade — survived every reindex, and the only tool for
         * fixing a wrong index could not fix it.
         *
         * Scoped by filter so one workspace's repair never touches another's, and
         * awaited so the add below cannot race the delete and lose what it wrote.
         */
        await this.index
            .deleteDocuments({ filter: `workspaceId = "${workspaceId}"` })
            .then((task) => this.index?.waitForTask(task.taskUid, { timeOutMs: 60_000 }))
            .catch(() => undefined);
        if (payload.length)
            await this.index.addDocuments(payload);
        this.logger.log(`Reindexed workspace ${workspaceId}: ${payload.length} documents`);
        // Answers with the count, so whoever runs the repair can see it did something.
        return { indexed: payload.length };
    }
    async search(workspaceId, userId, query, limit = 10, filters = {}) {
        const trimmed = query.trim();
        /*
         * §G03-6 — fetched once for the whole search, and only when a trending mode
         * is asked for: an extra grouped scan on every keystroke of every ordinary
         * search would be a real cost for a feature nobody switched on.
         */
        const trending = filters.sort === 'trending' || filters.sort === 'trending_me'
            ? await this.engagementScores(workspaceId, userId, filters.sort === 'trending_me')
            : undefined;
        // §2 per-item privacy: private tasks are only searchable by their creator,
        // assignees, or a workspace manager. Computed once and applied to every
        // task-bearing branch (Postgres task hits, comment hits, attachment hits,
        // and as a post-filter over Meili task hits, which aren't visibility-indexed).
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, userId);
        const hasCustomFieldFilter = Boolean(filters.customFieldId && filters.customFieldValue);
        const hasTaskFilter = Boolean(filters.statusCategory ||
            filters.priority ||
            filters.assigneeId ||
            filters.creatorId ||
            filters.labelId ||
            filters.taskTypeId ||
            filters.dueAfter ||
            filters.dueBefore ||
            // These belong here for the same reason as every line above it: Meili
            // indexes none of them, so a search carrying one has to take the
            // Postgres path. Leaving a filter out of this list does not error — it
            // routes to Meili, which ignores it and answers as though you had not
            // filtered at all. "The filter did nothing" is the failure mode.
            filters.createdAfter ||
            filters.createdBefore ||
            filters.spaceId ||
            filters.folderId ||
            filters.listId ||
            hasCustomFieldFilter);
        const wantTasks = !filters.types || filters.types.includes('task');
        // Task-specific filters imply the caller wants tasks, so docs are excluded.
        const wantDocs = (!filters.types || filters.types.includes('doc')) && !hasTaskFilter;
        // Uploaded files (task attachments + clips). Like docs they carry none of the
        // task-specific filters, so a task-filtered search excludes them (Plan §11.1).
        const wantFiles = (!filters.types || filters.types.includes('file')) && !hasTaskFilter;
        // §4 — Drive carries none of the task-specific filters, so a task-filtered
        // search excludes it, exactly as docs and files are excluded above.
        const wantDrive = (!filters.types || filters.types.includes('drive')) && !hasTaskFilter;
        // Nothing to match on at all → empty. (Filter-only searches are allowed.)
        if (!trimmed && !hasTaskFilter && !filters.types)
            return [];
        // Meilisearch can only satisfy the text + entity-type filters — it doesn't
        // index status/priority/assignee, nor the archived flag. Fall back to
        // Postgres for those.
        //
        // Sorting no longer forces that fallback. Both timestamps are indexed now,
        // so Meili orders every mode itself. Previously a date sort dropped to the
        // Postgres path, and because the two engines match differently — Meili
        // tokenises, Postgres does substring ILIKE — reordering a result list also
        // changed which rows were in it.
        if (this.enabled && this.index && trimmed && !hasTaskFilter && !filters.includeArchived) {
            const filterExpr = [`workspaceId = "${workspaceId}"`];
            // Narrow to every requested type, not just a lone one. With two or more
            // selected this used to push no filter at all, so Meili happily returned
            // the types the caller had just excluded. Types Meili does not index
            // (user, comment, channel, message) simply match nothing here and are
            // supplied by searchExtras instead.
            if (filters.types?.length) {
                filterExpr.push(`(${filters.types.map((t) => `entityType = "${t}"`).join(' OR ')})`);
            }
            const safeMeili = await this.visibleMeiliHits(trimmed, filterExpr, filters.sort, limit, userId, isManager, Boolean(filters.includeArchived));
            const extras = await this.searchExtras(workspaceId, userId, `%${trimmed}%`, limit, isManager, filters.types);
            // Clips live in R2, never in Meili, so they're queried separately.
            const clipHits = wantFiles ? await this.searchClips(workspaceId, trimmed, limit) : [];
            const driveHits = wantDrive ? await this.searchDrive(workspaceId, trimmed, limit) : [];
            return this.merge(filters.sort, limit, [...safeMeili, ...extras, ...clipHits, ...driveHits], trending);
        }
        // Fallback / rich-filter path: Postgres ILIKE + structured filters.
        const like = trimmed ? `%${trimmed}%` : null;
        const taskHits = wantTasks
            ? await (async () => {
                const conds = [
                    (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId),
                    filters.includeArchived ? undefined : (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false),
                    (0, item_visibility_1.taskVisibilityFilter)(this.db, userId, isManager),
                ];
                if (like)
                    conds.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(db_1.tasks.title, like), (0, drizzle_orm_1.ilike)(db_1.tasks.description, like)));
                if (filters.statusCategory)
                    conds.push((0, drizzle_orm_1.eq)(db_1.tasks.statusCategory, filters.statusCategory));
                if (filters.priority)
                    conds.push((0, drizzle_orm_1.eq)(db_1.tasks.priority, filters.priority));
                if (filters.creatorId)
                    conds.push((0, drizzle_orm_1.eq)(db_1.tasks.createdById, filters.creatorId));
                if (filters.assigneeId) {
                    conds.push((0, drizzle_orm_1.inArray)(db_1.tasks.id, this.db
                        .select({ taskId: db_1.taskAssignees.taskId })
                        .from(db_1.taskAssignees)
                        .where((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, filters.assigneeId))));
                }
                if (filters.labelId) {
                    conds.push((0, drizzle_orm_1.inArray)(db_1.tasks.id, this.db
                        .select({ taskId: db_1.taskLabelAssignments.taskId })
                        .from(db_1.taskLabelAssignments)
                        .where((0, drizzle_orm_1.eq)(db_1.taskLabelAssignments.labelId, filters.labelId))));
                }
                if (filters.taskTypeId)
                    conds.push((0, drizzle_orm_1.eq)(db_1.tasks.taskTypeId, filters.taskTypeId));
                if (filters.dueAfter)
                    conds.push((0, drizzle_orm_1.gte)(db_1.tasks.dueDate, filters.dueAfter));
                if (filters.dueBefore)
                    conds.push((0, drizzle_orm_1.lte)(db_1.tasks.dueDate, filters.dueBefore));
                if (filters.createdAfter)
                    conds.push((0, drizzle_orm_1.gte)(db_1.tasks.createdAt, filters.createdAfter));
                if (filters.createdBefore)
                    conds.push((0, drizzle_orm_1.lte)(db_1.tasks.createdAt, filters.createdBefore));
                // Location narrows by container. `spaceId` is already joined below.
                if (filters.listId)
                    conds.push((0, drizzle_orm_1.eq)(db_1.tasks.listId, filters.listId));
                if (filters.spaceId)
                    conds.push((0, drizzle_orm_1.eq)(db_1.spaces.id, filters.spaceId));
                // A folder sits between the space and the list: it groups projects,
                // and the task branch is already joined through projects to reach here.
                if (filters.folderId)
                    conds.push((0, drizzle_orm_1.eq)(db_1.projects.folderId, filters.folderId));
                if (hasCustomFieldFilter) {
                    conds.push(await this.customFieldValueCondition(workspaceId, filters.customFieldId, filters.customFieldValue));
                }
                return this.db
                    .select({ id: db_1.tasks.id, title: db_1.tasks.title, description: db_1.tasks.description, listId: db_1.tasks.listId, projectId: db_1.projects.id, spaceId: db_1.spaces.id, updatedAt: db_1.tasks.updatedAt, createdAt: db_1.tasks.createdAt })
                    .from(db_1.tasks)
                    .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.and)(...conds))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.updatedAt))
                    .limit(limit);
            })()
            : [];
        const docHits = wantDocs
            ? await this.db
                .select()
                .from(db_1.docs)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), filters.includeArchived ? undefined : (0, drizzle_orm_1.eq)(db_1.docs.isArchived, false), ...(like ? [(0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(db_1.docs.title, like), (0, drizzle_orm_1.ilike)(db_1.docs.plaintext, like))] : [])))
                .orderBy((0, drizzle_orm_1.desc)(db_1.docs.updatedAt))
                .limit(limit)
            : [];
        // Uploaded files: task attachments (Postgres, access-scoped) + clips (R2).
        const fileHits = wantFiles ? await this.searchTaskAttachments(workspaceId, userId, isManager, like, limit) : [];
        const clipHits = wantFiles ? await this.searchClips(workspaceId, trimmed, limit) : [];
        const driveHits = wantDrive ? await this.searchDrive(workspaceId, trimmed, limit) : [];
        // Extras only for a general text search (no type/task-specific filter).
        const extras = like ? await this.searchExtras(workspaceId, userId, like, limit, isManager, filters.types) : [];
        return this.merge(filters.sort, limit, [
            ...taskHits.map((t) => ({
                id: `task-${t.id}`,
                entityType: 'task',
                title: t.title,
                content: (t.description ?? '').slice(0, 200),
                url: `/app/${workspaceId}/${t.spaceId}/${t.projectId}/${t.listId}?task=${t.id}`,
                sortedAt: (filters.sort === 'created' ? t.createdAt : t.updatedAt) ?? null,
            })),
            ...docHits.map((d) => ({
                id: `doc-${d.id}`,
                entityType: 'doc',
                title: d.title,
                content: d.plaintext.slice(0, 200),
                url: `/app/${workspaceId}/docs?doc=${d.id}`,
                sortedAt: (filters.sort === 'created' ? d.createdAt : d.updatedAt) ?? null,
            })),
            ...fileHits,
            ...clipHits,
            ...driveHits,
            ...extras,
        ], trending);
    }
    /**
     * Order the merged hits, then cut the list to the size the caller asked for.
     *
     * Both branches build their result by concatenating several independently
     * limited queries, so `limit` was silently behaving as "per source" rather
     * than a total: the same query returned 5 hits sorted by relevance and 16
     * sorted by date, because the date path fans out over five Postgres queries
     * and the relevance path mostly hits Meili. Changing the order of a list
     * must not change what is in it.
     *
     * The cut happens after the sort, never before — truncating first would keep
     * an arbitrary subset and then order that, which is not the top N.
     */
    merge(sort, limit, hits, trending) {
        return this.applySort(sort, hits, trending).slice(0, limit);
    }
    /**
     * §G02-9 — the source strip, and whether each one can actually answer.
     *
     * Returned as data rather than assumed by the client, because "connected" is
     * a fact about this workspace's stored credentials and the client has no way
     * to know it. A tab that cannot answer must say so — an unconnected source
     * that returns nothing reads as "you have no matching files", which is false.
     */
    async listSources(workspaceId) {
        const rows = await this.db
            .select({
            provider: db_1.workspaceIntegrationConnections.provider,
            status: db_1.workspaceIntegrationConnections.status,
            accessToken: db_1.workspaceIntegrationConnections.accessToken,
        })
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId));
        const live = new Set(rows.filter((r) => r.status === 'connected' && !!r.accessToken).map((r) => r.provider));
        return sources_1.SEARCH_SOURCES.map((id) => {
            const provider = sources_1.SOURCE_PROVIDER[id];
            // Our own data needs no credential and is always available.
            return { id, provider, connected: provider === null ? true : live.has(provider) };
        });
    }
    /** §G03-6 — somebody opened a search result. */
    async recordOpen(workspaceId, userId, entityType, entityId) {
        const type = (entityType ?? '').trim().slice(0, 40);
        const id = (entityId ?? '').trim().slice(0, 200);
        // Nothing to count without both halves, and a row with a blank id would
        // score against every hit that also has none.
        if (!type || !id)
            return { ok: true };
        await this.db.insert(db_1.searchEngagement).values({ workspaceId, userId, entityType: type, entityId: id });
        return { ok: true };
    }
    /**
     * §G03-6 — opens per hit inside the window, for one of the two questions.
     *
     * `mine` narrows to this person ("Trending For You"); otherwise it is the
     * whole workspace ("Trending In Workspace"). Counted in SQL rather than by
     * reading rows into the process: a busy workspace produces far more events
     * than search results, and pulling them all back to count them here is the
     * shape that works on a demo and falls over in a year.
     */
    async engagementScores(workspaceId, userId, mine) {
        const since = new Date(Date.now() - SearchService_1.TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const rows = await this.db
            .select({
            entityType: db_1.searchEngagement.entityType,
            entityId: db_1.searchEngagement.entityId,
            opens: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(db_1.searchEngagement)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.searchEngagement.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.searchEngagement.openedAt, since), mine ? (0, drizzle_orm_1.eq)(db_1.searchEngagement.userId, userId) : undefined))
            .groupBy(db_1.searchEngagement.entityType, db_1.searchEngagement.entityId);
        const scores = new Map();
        for (const r of rows)
            scores.set(`${r.entityType}:${r.entityId}`, Number(r.opens));
        return scores;
    }
    /**
     * Order the merged result set. Relevance is whatever each branch's own query
     * returned, so we leave it alone; the timestamp modes sort across branches,
     * putting hits with no timestamp (files, people, messages) last rather than
     * letting an absent date read as "oldest".
     */
    applySort(sort, hits, trending) {
        if (!sort || sort === 'relevance')
            return hits;
        /*
         * §G03-6 — most-opened first, and ties fall back to RELEVANCE rather than
         * to nothing.
         *
         * Most hits have never been opened, so without a tiebreak the whole
         * unopened tail would come back in whatever order the branches happened to
         * produce — a sort that reorders the top few and shuffles everything else.
         * Keeping the incoming order for equal scores means trending PROMOTES what
         * is hot and leaves the rest exactly as relevance had it.
         */
        if (sort === 'trending' || sort === 'trending_me') {
            const scored = hits.map((h, i) => ({ h, i, score: trending?.get(engagementKey(h.id)) ?? 0 }));
            scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
            return scored.map((x) => x.h);
        }
        const at = (h) => (h.sortedAt ? new Date(h.sortedAt).getTime() : null);
        return [...hits].sort((a, b) => {
            const x = at(a), y = at(b);
            if (x === null && y === null)
                return 0;
            if (x === null)
                return 1;
            if (y === null)
                return -1;
            return y - x;
        });
    }
    /**
     * The first `limit` Meili hits this caller is actually allowed to see.
     *
     * Meili applies its own limit before anything in this process can look at a
     * row, and both rules that remove a hit — archived, and per-caller
     * visibility — live in Postgres. Filtering a single page therefore throws
     * hits away without replacing them, and the search reports fewer results
     * than exist. Where most of what matches a word is in the bin it reports
     * NONE: the workspace this was found on holds 66 archived tasks matching
     * "a" against 10 live ones, so every hit on page one was binned, all five
     * were dropped, and an ordinary search answered "nothing" while ten live
     * tasks matched.
     *
     * That is worse than the leak it came from — a leak shows too much and is
     * obvious, an empty result looks like an answer.
     *
     * Visibility cannot be pushed into Meili (it is per caller, and the index
     * has no such field), and archived cannot either: `indexTask` runs on create
     * and on edit only, so a document's idea of archived would be stale the
     * moment anything was binned. Postgres stays the authority; this pages until
     * enough survive it.
     *
     * Bounded on purpose. A workspace with an enormous bin must not turn one
     * search into an unbounded scan, so scanning stops at SCAN_CAP and returns
     * what it has: fewer hits than ideal, rather than a slow request or none.
     */
    async visibleMeiliHits(query, filterExpr, sort, limit, userId, isManager, includeArchived) {
        const SCAN_CAP = 500;
        // Comfortably more than one page in the ordinary case, so the common
        // search still costs exactly one round trip to each of Meili and Postgres.
        const page = Math.min(Math.max(limit * 4, 40), SCAN_CAP);
        const kept = [];
        const seen = new Set();
        for (let offset = 0; offset < SCAN_CAP && kept.length < limit; offset += page) {
            const res = await this.index.search(query, {
                filter: filterExpr,
                limit: Math.min(page, SCAN_CAP - offset),
                offset,
                sort: meiliSort(sort),
            });
            if (res.hits.length === 0)
                break;
            const mapped = res.hits.map((h) => ({
                id: h.id,
                entityType: h.entityType,
                title: h.title,
                content: (h.content ?? '').slice(0, 200),
                url: h.url,
                // Carried through so the merge orders Meili hits and Postgres extras as
                // one list. Without it every Meili hit would look undated and sort to
                // the bottom, silently undoing the order Meili just applied.
                sortedAt: sort === 'created'
                    ? new Date(h.createdAt)
                    : sort === 'updated'
                        ? new Date(h.updatedAt)
                        : null,
            }));
            for (const hit of await this.dropUnsearchableTaskHits(mapped, userId, isManager, includeArchived)) {
                // Meili paginates a live index; a document can shift between pages and
                // arrive twice. Deduped here so a search cannot show the same task
                // under two headings.
                if (seen.has(hit.id))
                    continue;
                seen.add(hit.id);
                kept.push(hit);
                if (kept.length >= limit)
                    break;
            }
            // A short page is the end of the result set, so there is nothing left to
            // page into — asking again would return the same nothing.
            if (res.hits.length < page)
                break;
        }
        return kept;
    }
    /**
     * Drop task hits from the Meili index that this search should not return —
     * ones the caller may not see, and ones that are in the bin.
     *
     * The index carries neither field. `indexTask` writes a task in on create and
     * on edit and there is no removal path anywhere, so a deleted task stays in
     * Meili forever: on a deployment with Meilisearch configured, an ordinary
     * search returned work that had been thrown away. The Postgres path had
     * filtered `isArchived` all along (see the fallback query), which is why this
     * only ever showed up where Meili was actually running.
     *
     * Archived is enforced even for a manager. Managers skip the VISIBILITY
     * check — that is what being a manager means here — but nobody is meant to
     * find deleted work by searching, and the previous early return for managers
     * meant they skipped both checks at once.
     *
     * Non-task hits pass through untouched.
     */
    async dropUnsearchableTaskHits(hits, userId, isManager, includeArchived) {
        /*
         * A Meili hit's id is the DOCUMENT id, which `indexTask` writes as
         * `task-<uuid>` — not a uuid. Handing those straight to a uuid column is a
         * Postgres 22P02 and a 400 for the whole search.
         *
         * The previous version had the same bug and never showed it: it returned
         * early for managers, and a manager is who tends to be looking when anyone
         * checks. Stripped here once, and compared stripped.
         */
        const taskHits = hits.filter((h) => h.entityType === 'task');
        if (taskHits.length === 0)
            return hits;
        const rawId = (docId) => docId.replace(/^task-/, '');
        // Nothing to ask the database when neither rule applies to this caller.
        if (isManager && includeArchived)
            return hits;
        const conds = [(0, drizzle_orm_1.inArray)(db_1.tasks.id, taskHits.map((h) => rawId(h.id)))];
        if (!includeArchived)
            conds.push((0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false));
        if (!isManager)
            conds.push((0, item_visibility_1.taskVisibilityFilter)(this.db, userId, false));
        const keep = await this.db
            .select({ id: db_1.tasks.id })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.and)(...conds));
        const ok = new Set(keep.map((r) => r.id));
        return hits.filter((h) => h.entityType !== 'task' || ok.has(rawId(h.id)));
    }
    /** Search users, comments, channels, and messages (Plan §11.1). */
    /**
     * Users, comments, channels and messages — the entity types Meilisearch does
     * not index. `types` narrows which of them to run; passing a filter that
     * names none of them short-circuits to nothing, which is why the caller can
     * hand its type chips straight through instead of skipping this entirely.
     */
    /**
     * The one network call Drive search makes, behind a method so a test can
     * replace it.
     *
     * `safeFetch` issues through node:http rather than global fetch — there is no
     * global to stub — and its SSRF guard rejects loopback, so a local test server
     * is not an option either. Without this seam the Drive tests would either hit
     * the real Google or, worse, quietly pass while never calling anything.
     */
    async driveRequest(url, token) {
        const res = await (0, safe_fetch_1.safeFetch)(url, {
            headers: { Authorization: `Bearer ${token}` },
            timeoutMs: 10_000,
        });
        return { status: res.status, text: res.text() };
    }
    /**
     * §4 [04:20] — files from the workspace's linked Google Drive.
     *
     * "Yeh ClickUp ki quality hai ke woh apni workspace ko itna BROADER mein le
     * ke jaa raha hai" [04:26]: the point is that searching here reaches past
     * here. Returns nothing — never throws — when no Drive is linked, when the
     * token has gone stale, or when Google is having a bad day: an integration
     * being down must not take the whole search down with it.
     */
    async searchDrive(workspaceId, query, limit) {
        const trimmed = query.trim();
        if (!trimmed)
            return [];
        const [conn] = await this.db
            .select({
            status: db_1.workspaceIntegrationConnections.status,
            accessToken: db_1.workspaceIntegrationConnections.accessToken,
            scopes: db_1.workspaceIntegrationConnections.scopes,
        })
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.provider, 'google-drive')))
            .limit(1);
        if (!conn || conn.status !== 'connected' || !conn.accessToken)
            return [];
        /*
         * A grant that cannot answer the question we are about to ask.
         *
         * Connections made before the scope changed hold `drive.file`, which sees
         * only files this app created or the user picked by hand. The query below
         * is account-wide, so against such a grant Google answers "nothing" — and
         * an empty Drive section reads to a person as "you have no matching
         * files", which is false.
         *
         * Skipped and logged rather than sent anyway: a request that cannot
         * succeed is not worth a round trip, and the log is the only place this
         * currently says why. Reconnecting the integration re-consents at the
         * broader scope.
         */
        if (!(0, drive_scope_1.grantCoversWholeDrive)(conn.scopes)) {
            this.logger?.warn?.(`Drive search skipped for workspace ${workspaceId}: the stored grant is missing ` +
                `${drive_scope_1.DRIVE_SEARCH_SCOPE}, so an account-wide query would return nothing. Reconnect Google Drive.`);
            return [];
        }
        // Drive's `q` is its own query language, and the term is interpolated into
        // a quoted string inside it. A name containing an apostrophe would close
        // that string early and change the query — so escape backslashes first,
        // then quotes, exactly as Google's grammar requires.
        const escaped = trimmed.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const base = process.env.GOOGLE_DRIVE_API_URL ?? 'https://www.googleapis.com/drive/v3';
        const params = new URLSearchParams({
            q: `name contains '${escaped}' and trashed = false`,
            fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
            pageSize: String(Math.min(Math.max(limit, 1), 25)),
        });
        try {
            const res = await this.driveRequest(`${base}/files?${params.toString()}`, conn.accessToken);
            if (!res || res.status < 200 || res.status >= 300)
                return [];
            const body = JSON.parse(res.text);
            return (body.files ?? [])
                .filter((f) => f.id && f.name)
                .map((f) => ({
                id: `drive-${f.id}`,
                entityType: 'drive',
                title: f.name,
                // Says it is not from here, because a result that opens a new tab to
                // another product should say so before you click it.
                content: 'Google Drive',
                url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
                sortedAt: f.modifiedTime ? new Date(f.modifiedTime) : null,
            }));
        }
        catch {
            return [];
        }
    }
    async searchExtras(workspaceId, userId, like, limit, isManager = false, types) {
        const wants = (t) => !types || types.includes(t);
        const EXTRA_TYPES = ['user', 'comment', 'channel', 'message', 'folder', 'list', 'space', 'meeting'];
        if (!EXTRA_TYPES.some(wants))
            return [];
        // Chat search must respect channel access (Plan §6): a user may only see
        // hits from public channels or channels they belong to — never from private
        // channels or DMs they're not a member of. Compute their channels once and
        // scope both the channel-name and message-body searches to accessible ones.
        const memberRows = await this.db
            .select({ channelId: db_1.chatChannelMembers.channelId })
            .from(db_1.chatChannelMembers)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannelMembers.userId, userId));
        const memberChannelIds = memberRows.map((r) => r.channelId);
        const publicChannel = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.isPrivate, false), (0, drizzle_orm_1.eq)(db_1.chatChannels.isDm, false));
        const accessibleChannel = memberChannelIds.length > 0 ? (0, drizzle_orm_1.or)(publicChannel, (0, drizzle_orm_1.inArray)(db_1.chatChannels.id, memberChannelIds)) : publicChannel;
        const [userHits, commentHits, channelHits, messageHits, folderHits, listHits, spaceHits, meetingHits] = await Promise.all([
            this.db
                .select({ id: db_1.users.id, displayName: db_1.users.displayName, email: db_1.users.email })
                .from(db_1.users)
                .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, db_1.users.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(db_1.users.displayName, like), (0, drizzle_orm_1.ilike)(db_1.users.email, like))))
                .limit(limit),
            this.db
                .select({ id: db_1.taskComments.id, body: db_1.taskComments.body, taskId: db_1.tasks.id, taskTitle: db_1.tasks.title, listId: db_1.tasks.listId, projectId: db_1.projects.id, spaceId: db_1.spaces.id })
                .from(db_1.taskComments)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskComments.taskId))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.ilike)(db_1.taskComments.body, like), (0, item_visibility_1.taskVisibilityFilter)(this.db, userId, isManager)))
                .orderBy((0, drizzle_orm_1.desc)(db_1.taskComments.createdAt))
                .limit(limit),
            this.db
                .select({ id: db_1.chatChannels.id, name: db_1.chatChannels.name })
                .from(db_1.chatChannels)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.ilike)(db_1.chatChannels.name, like), accessibleChannel))
                .limit(limit),
            this.db
                .select({ id: db_1.chatMessages.id, body: db_1.chatMessages.body, channelId: db_1.chatMessages.channelId })
                .from(db_1.chatMessages)
                .innerJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.ilike)(db_1.chatMessages.body, like), accessibleChannel))
                .orderBy((0, drizzle_orm_1.desc)(db_1.chatMessages.createdAt))
                .limit(limit),
            /*
             * §2 [02:03] — the containers themselves. Scoped with the same visibility
             * filters every other read path uses, so a private folder or list stays
             * invisible here too; search must not become the one surface where a
             * container you cannot open is still discoverable by name.
             */
            wants('folder')
                ? this.db
                    .select({ id: db_1.folders.id, name: db_1.folders.name, spaceId: db_1.folders.spaceId, spaceName: db_1.spaces.name })
                    .from(db_1.folders)
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.folders.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.ilike)(db_1.folders.name, like), (0, drizzle_orm_1.eq)(db_1.folders.isArchived, false), (0, item_visibility_1.folderVisibilityFilter)(userId, isManager)))
                    .limit(limit)
                : Promise.resolve([]),
            wants('list')
                ? this.db
                    .select({
                    id: db_1.lists.id, name: db_1.lists.name,
                    projectId: db_1.projects.id, spaceId: db_1.spaces.id, projectName: db_1.projects.name,
                })
                    .from(db_1.lists)
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.ilike)(db_1.lists.name, like), (0, item_visibility_1.listVisibilityFilter)(userId, isManager)))
                    .limit(limit)
                : Promise.resolve([]),
            wants('space')
                ? this.db
                    .select({ id: db_1.spaces.id, name: db_1.spaces.name })
                    .from(db_1.spaces)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.ilike)(db_1.spaces.name, like)))
                    .limit(limit)
                : Promise.resolve([]),
            /*
             * §G14-15 — meeting notes.
             *
             * A meeting you could read on its own page could not be found from
             * anywhere else, and the notes are often the only written record of a
             * decision. Title AND notes, because "what did we decide about pricing"
             * is a question about the body, not the heading.
             *
             * Scoped by workspace and nothing more, which is the whole rule: meetings
             * carry no per-item privacy (`meetings.service.ts` gates on workspace
             * membership alone), and inventing a stricter filter here would hide rows
             * from search that the meetings page shows.
             */
            wants('meeting')
                ? this.db
                    .select({ id: db_1.meetings.id, title: db_1.meetings.title, notes: db_1.meetings.notes })
                    .from(db_1.meetings)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(db_1.meetings.title, like), (0, drizzle_orm_1.ilike)(db_1.meetings.notes, like))))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.meetings.createdAt))
                    .limit(limit)
                : Promise.resolve([]),
        ]);
        return [
            ...(wants('user') ? userHits : []).map((u) => ({
                id: `user-${u.id}`, entityType: 'user', title: u.displayName || u.email, content: u.email,
                url: `/app/${workspaceId}/settings`,
            })),
            ...(wants('comment') ? commentHits : []).map((c) => ({
                id: `comment-${c.id}`, entityType: 'comment', title: `Comment on “${c.taskTitle}”`, content: c.body.slice(0, 200),
                url: `/app/${workspaceId}/${c.spaceId}/${c.projectId}/${c.listId}?task=${c.taskId}`,
            })),
            ...(wants('channel') ? channelHits : []).map((c) => ({
                id: `channel-${c.id}`, entityType: 'channel', title: `#${c.name}`, content: '',
                url: `/app/${workspaceId}/chat?channel=${c.id}`,
            })),
            ...(wants('message') ? messageHits : []).map((m) => ({
                id: `message-${m.id}`, entityType: 'message', title: 'Chat message', content: m.body.slice(0, 200),
                url: `/app/${workspaceId}/chat?channel=${m.channelId}&message=${m.id}`,
            })),
            // Containers say where they live, because "Design" as a folder name is
            // only useful once you know which space it is in.
            ...folderHits.map((f) => ({
                id: `folder-${f.id}`, entityType: 'folder', title: f.name, content: f.spaceName ?? '',
                url: `/app/${workspaceId}/${f.spaceId}`,
            })),
            ...listHits.map((l) => ({
                id: `list-${l.id}`, entityType: 'list', title: l.name, content: l.projectName ?? '',
                url: `/app/${workspaceId}/${l.spaceId}/${l.projectId}/${l.id}`,
            })),
            ...spaceHits.map((sp) => ({
                id: `space-${sp.id}`, entityType: 'space', title: sp.name, content: '',
                url: `/app/${workspaceId}/${sp.id}`,
            })),
            // Deep-linked, not just "the meetings page": a hit that lands you among
            // two hundred rows and leaves you to find it is search that found
            // something rather than search that took you to it.
            ...meetingHits.map((m) => ({
                id: `meeting-${m.id}`, entityType: 'meeting', title: m.title,
                content: (m.notes ?? '').slice(0, 200),
                url: `/app/${workspaceId}/meetings?meeting=${m.id}`,
            })),
        ];
    }
    /**
     * Search uploaded files stored as task attachments (Plan §11.1). Access is
     * scoped exactly like task and comment search: an attachment is reachable only
     * through its task → list → project → space, and that space must belong to the
     * caller's workspace. An attachment whose task lives in another workspace (or
     * any container the caller can't reach) never satisfies the join, so it can
     * never leak into these results. Matches the file name and its content type.
     */
    async searchTaskAttachments(workspaceId, userId, isManager, like, limit) {
        const conds = [
            (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId),
            (0, item_visibility_1.taskVisibilityFilter)(this.db, userId, isManager),
        ];
        if (like)
            conds.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(db_1.taskAttachments.fileName, like), (0, drizzle_orm_1.ilike)(db_1.taskAttachments.contentType, like)));
        const rows = await this.db
            .select({
            id: db_1.taskAttachments.id,
            fileName: db_1.taskAttachments.fileName,
            contentType: db_1.taskAttachments.contentType,
            taskId: db_1.tasks.id,
            listId: db_1.tasks.listId,
            projectId: db_1.projects.id,
            spaceId: db_1.spaces.id,
        })
            .from(db_1.taskAttachments)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAttachments.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)(...conds))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskAttachments.createdAt))
            .limit(limit);
        return rows.map((f) => ({
            id: `file-${f.id}`,
            entityType: 'file',
            title: f.fileName,
            content: f.contentType,
            url: `/app/${workspaceId}/${f.spaceId}/${f.projectId}/${f.listId}?task=${f.taskId}`,
        }));
    }
    /**
     * Search uploaded screen-recording "clips" (Plan §11.1). Clips are stored as
     * R2 objects under `workspaces/<id>/clips/`, not in the DB, so we match on the
     * file name embedded in each object key. The workspace prefix is the entire
     * access boundary — a clip is only ever listed under its own workspace, so it
     * cannot cross workspaces. Best-effort: any storage error (or R2 not being
     * configured) yields no clip hits rather than failing the whole search.
     */
    async searchClips(workspaceId, query, limit) {
        const r2 = this.r2;
        const needle = query.trim().toLowerCase();
        if (!needle || !r2 || !r2.configured)
            return [];
        const hits = [];
        try {
            const listed = await r2.listObjects(`workspaces/${workspaceId}/clips/`, 200);
            for (const obj of listed.Contents ?? []) {
                if (!obj.Key)
                    continue;
                const fileName = obj.Key.split('/').pop() ?? '';
                // Keys are `<timestamp>-<sanitizedFileName>`; drop the timestamp prefix
                // so the searchable label matches what the recorder named the clip.
                const label = fileName.replace(/^\d+-/, '');
                if (!label.toLowerCase().includes(needle))
                    continue;
                hits.push({
                    id: `file-${obj.Key}`,
                    entityType: 'file',
                    title: label,
                    content: 'Clip',
                    url: `/app/${workspaceId}/clips`,
                });
                if (hits.length >= limit)
                    break;
            }
        }
        catch {
            // Storage is best-effort; a listing failure just yields no clip hits.
        }
        return hits;
    }
    // ── Custom-field value filter (Plan §11.2) ──────────────────────────────────
    /**
     * List every custom-field definition reachable in a workspace (across all its
     * spaces/projects) so the search UI can offer them as a filter. Workspace
     * ownership is enforced via the project → space → workspace join.
     */
    async listWorkspaceCustomFields(workspaceId) {
        return this.db
            .select({
            id: db_1.customFieldDefinitions.id,
            name: db_1.customFieldDefinitions.name,
            type: db_1.customFieldDefinitions.type,
            options: db_1.customFieldDefinitions.options,
            projectId: db_1.customFieldDefinitions.projectId,
            projectName: db_1.projects.name,
        })
            .from(db_1.customFieldDefinitions)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.customFieldDefinitions.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.projects.name), (0, drizzle_orm_1.asc)(db_1.customFieldDefinitions.position), (0, drizzle_orm_1.asc)(db_1.customFieldDefinitions.name));
    }
    /**
     * Build the SQL condition that restricts `tasks.id` to those whose stored
     * value for the given custom-field definition matches `value`. The field's
     * type decides the operator: free-text types use a case-insensitive contains
     * (ILIKE), everything else uses exact equality on the JSON scalar (`value->>'v'`).
     * An unknown/foreign field id matches nothing, keeping results workspace-scoped.
     */
    async customFieldValueCondition(workspaceId, fieldId, value) {
        const [def] = await this.db
            .select({ type: db_1.customFieldDefinitions.type })
            .from(db_1.customFieldDefinitions)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.customFieldDefinitions.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.id, fieldId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
            .limit(1);
        if (!def)
            return (0, drizzle_orm_1.sql) `false`;
        const valueExpr = (0, drizzle_orm_1.sql) `${db_1.customFieldValues.value} ->> 'v'`;
        const match = TEXT_LIKE_FIELD_TYPES.has(def.type)
            ? (0, drizzle_orm_1.sql) `${valueExpr} ILIKE ${`%${value}%`}`
            : (0, drizzle_orm_1.sql) `${valueExpr} = ${value}`;
        return (0, drizzle_orm_1.inArray)(db_1.tasks.id, this.db
            .select({ taskId: db_1.customFieldValues.taskId })
            .from(db_1.customFieldValues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customFieldValues.fieldId, fieldId), match)));
    }
    // ── Saved search presets (Plan §11.2) ───────────────────────────────────────
    async listSavedSearches(workspaceId, userId) {
        return this.db
            .select()
            .from(db_1.savedSearches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.savedSearches.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.savedSearches.userId, userId)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.savedSearches.updatedAt));
    }
    async createSavedSearch(workspaceId, userId, name, query, filters) {
        const trimmed = name?.trim();
        if (!trimmed)
            throw new Error('A preset name is required');
        const [row] = await this.db
            .insert(db_1.savedSearches)
            .values({ workspaceId, userId, name: trimmed.slice(0, 80), query: query || null, filters: filters ?? {} })
            .onConflictDoUpdate({
            target: [db_1.savedSearches.userId, db_1.savedSearches.workspaceId, db_1.savedSearches.name],
            set: { query: query || null, filters: filters ?? {}, updatedAt: new Date() },
        })
            .returning();
        return row;
    }
    async deleteSavedSearch(id, userId) {
        await this.db
            .delete(db_1.savedSearches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.savedSearches.id, id), (0, drizzle_orm_1.eq)(db_1.savedSearches.userId, userId)));
        return { ok: true };
    }
};
exports.SearchService = SearchService;
/**
 * §G03-6 — how long "trending" looks back.
 *
 * Seven days. Short enough that a burst of interest still shows while it is
 * happening; long enough that a quiet Monday does not empty the list. The
 * window is the reason this is an event table and not a counter — a lifetime
 * count would put last quarter's busiest task on top forever.
 */
SearchService.TRENDING_WINDOW_DAYS = 7;
exports.SearchService = SearchService = SearchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object, config_1.ConfigService,
        r2_service_1.R2Service])
], SearchService);
//# sourceMappingURL=search.service.js.map