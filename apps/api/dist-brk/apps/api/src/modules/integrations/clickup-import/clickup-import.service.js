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
exports.ClickUpImportService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../../common/database/database.module");
const r2_service_1 = require("../../../common/storage/r2.service");
const clickup_csv_util_1 = require("./clickup-csv.util");
const clickup_api_util_1 = require("./clickup-api.util");
/**
 * ClickUp CSV export does NOT contain comments or file attachments — those live
 * only behind the ClickUp API (an OAuth/personal token). We never fabricate
 * them from a CSV; this note states plainly that they are not part of the CSV.
 * When a token IS supplied, the API enrichment path fetches + imports them and
 * this note is replaced with the real imported counts (see `enrichTasks`).
 */
const NOT_IMPORTED = {
    comments: 'ClickUp CSV exports do not include comments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no comments were imported.',
    attachments: 'ClickUp CSV exports do not include file attachments. Importing them requires the ClickUp API (a token) — not available from a CSV, so no attachments were imported.',
};
let ClickUpImportService = class ClickUpImportService {
    constructor(db, r2) {
        this.db = db;
        this.r2 = r2;
    }
    // ── Preview ─────────────────────────────────────────────────────────────────
    /**
     * Parse without writing: row/list counts, a small sample, the detected
     * custom-field columns (name + inferred type), and a duplicate scan against
     * the target scope so the UI can offer a conflict strategy.
     */
    async preview(workspaceId, dto) {
        const { rows, customFieldColumns } = (0, clickup_csv_util_1.parseClickUpCsv)(dto.csv ?? '');
        const existing = await this.loadExistingTaskIndex(workspaceId, dto.targetSpaceId);
        const seen = new Set();
        const seenIds = new Set();
        const dupSample = [];
        let duplicates = 0;
        for (const r of rows) {
            const listName = r.list?.trim() || 'Imported Tasks';
            const key = (0, clickup_csv_util_1.dupKey)(listName, r.title);
            const byId = r.taskId ? seenIds.has(r.taskId) : false;
            const isDup = existing.has(key) || seen.has(key) || byId;
            if (isDup) {
                duplicates++;
                if (dupSample.length < 10) {
                    dupSample.push({
                        title: r.title,
                        list: listName,
                        reason: existing.has(key) ? 'exists-in-target' : byId ? 'duplicate-clickup-id' : 'duplicate-in-file',
                    });
                }
            }
            seen.add(key);
            if (r.taskId)
                seenIds.add(r.taskId);
        }
        return {
            totalRows: rows.length,
            sample: rows.slice(0, 5).map((r) => ({
                title: r.title,
                status: r.status,
                priority: r.priority,
                list: r.list,
            })),
            uniqueLists: Array.from(new Set(rows.map((r) => r.list?.trim()).filter(Boolean))),
            customFields: customFieldColumns.map((c) => ({ name: c.name, type: c.type })),
            duplicates: { count: duplicates, sample: dupSample },
            notImported: NOT_IMPORTED,
        };
    }
    // ── Job lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Create a progress row and kick off the import asynchronously. Returns the
     * job id immediately; the client polls `getJob` for a real progress bar.
     */
    async startImport(workspaceId, userId, dto) {
        if (!dto.csv?.trim())
            throw new common_1.BadRequestException('CSV body is empty');
        const { rows } = (0, clickup_csv_util_1.parseClickUpCsv)(dto.csv);
        if (rows.length === 0)
            throw new common_1.BadRequestException('CSV contained no data rows');
        const [job] = await this.db
            .insert(db_1.clickupImportJobs)
            .values({ workspaceId, createdById: userId, status: 'pending', total: rows.length })
            .returning({ id: db_1.clickupImportJobs.id });
        // Fire-and-forget: the worker updates the job row as it processes.
        void this.processImport(job.id, workspaceId, userId, dto).catch(() => undefined);
        return { jobId: job.id };
    }
    async getJob(workspaceId, jobId) {
        const [job] = await this.db
            .select()
            .from(db_1.clickupImportJobs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId), (0, drizzle_orm_1.eq)(db_1.clickupImportJobs.workspaceId, workspaceId)))
            .limit(1);
        if (!job)
            throw new common_1.NotFoundException('Import job not found');
        return job;
    }
    /**
     * The awaitable worker. Parses the CSV, recreates the hierarchy, creates
     * custom-field definitions + values, applies the conflict strategy per row,
     * and streams progress into the job row. Also callable directly (tests /
     * verification) — resolves with the final summary.
     */
    async processImport(jobId, workspaceId, userId, dto) {
        const strategy = dto.strategy ?? 'create';
        const summary = this.emptySummary();
        try {
            const { rows, customFieldColumns } = (0, clickup_csv_util_1.parseClickUpCsv)(dto.csv);
            if (rows.length === 0)
                throw new common_1.BadRequestException('CSV contained no data rows');
            await this.db
                .update(db_1.clickupImportJobs)
                .set({ status: 'processing', total: rows.length, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId));
            // Resolve / create space
            let spaceId = dto.targetSpaceId;
            if (!spaceId) {
                const [space] = await this.db
                    .insert(db_1.spaces)
                    .values({
                    workspaceId,
                    name: dto.targetProjectName ?? 'Imported from ClickUp',
                    icon: '📥',
                    color: '#354fb0',
                })
                    .returning();
                spaceId = space.id;
                summary.spacesCreated++;
            }
            const [project] = await this.db
                .insert(db_1.projects)
                .values({
                spaceId,
                name: dto.targetProjectName ?? 'ClickUp Import',
                description: `Imported on ${new Date().toISOString()} by user ${userId}`,
            })
                .returning();
            summary.projectsCreated++;
            // Custom-field definitions on the new project (name → def id + type + option map).
            const fieldDefs = await this.createCustomFieldDefinitions(project.id, customFieldColumns, summary);
            // Group rows by list.
            const byList = new Map();
            for (const r of rows) {
                const listName = r.list?.trim() || 'Imported Tasks';
                const arr = byList.get(listName) ?? [];
                arr.push(r);
                byList.set(listName, arr);
            }
            // Members for assignee mapping.
            const memberByKey = await this.loadMemberIndex(workspaceId);
            // Existing tasks in the target scope for duplicate detection.
            const existing = await this.loadExistingTaskIndex(workspaceId, dto.targetSpaceId);
            const labelCache = new Map();
            const ensureLabel = (name) => this.ensureLabel(workspaceId, name, labelCache, summary);
            // dupKey / clickup id → our task id, so merge + subtask linking can target it.
            const seenByKey = new Map();
            const created = new Map();
            const updateEvery = Math.max(1, Math.ceil(rows.length / 200));
            let processed = 0;
            let listPosition = 0;
            for (const [listName, listRows] of byList) {
                let list;
                try {
                    ;
                    [list] = await this.db
                        .insert(db_1.lists)
                        .values({ projectId: project.id, name: listName, position: listPosition++ })
                        .returning();
                    summary.listsCreated++;
                }
                catch (e) {
                    summary.errors.push(`List "${listName}": ${e?.message ?? 'unknown error'}`);
                    // Still advance progress for the rows we won't process.
                    processed += listRows.length;
                    await this.updateProgress(jobId, processed, summary);
                    continue;
                }
                for (const t of listRows) {
                    try {
                        const key = (0, clickup_csv_util_1.dupKey)(listName, t.title);
                        const existingId = existing.get(key);
                        const seenId = seenByKey.get(key);
                        const isDup = !!existingId || !!seenId;
                        if (isDup)
                            summary.duplicatesDetected++;
                        if (isDup && strategy === 'skip') {
                            summary.tasksSkipped++;
                        }
                        else if (isDup && strategy === 'merge') {
                            const targetId = existingId ?? seenId;
                            await this.mergeTask(targetId, t);
                            summary.tasksUpdated++;
                            if (t.taskId)
                                created.set(t.taskId, { ourId: targetId, parentId: t.parentId });
                            seenByKey.set(key, targetId);
                            await this.applyAssigneesTagsFields(targetId, t, memberByKey, ensureLabel, fieldDefs, summary);
                        }
                        else {
                            // create (either not a duplicate, or "import anyway")
                            const [task] = await this.db
                                .insert(db_1.tasks)
                                .values({
                                listId: list.id,
                                createdById: userId,
                                title: t.title.slice(0, 500),
                                description: t.description ?? null,
                                status: (0, clickup_csv_util_1.mapStatus)(t.status),
                                priority: (0, clickup_csv_util_1.mapPriority)(t.priority),
                                dueDate: t.dueDate ? (0, clickup_csv_util_1.safeDate)(t.dueDate) : undefined,
                            })
                                .returning();
                            summary.tasksCreated++;
                            if (t.taskId)
                                created.set(t.taskId, { ourId: task.id, parentId: t.parentId });
                            if (!seenByKey.has(key))
                                seenByKey.set(key, task.id);
                            await this.applyAssigneesTagsFields(task.id, t, memberByKey, ensureLabel, fieldDefs, summary);
                        }
                    }
                    catch (e) {
                        summary.errors.push(`Task "${t.title}": ${e?.message ?? 'unknown error'}`);
                    }
                    finally {
                        processed++;
                        if (processed % updateEvery === 0)
                            await this.updateProgress(jobId, processed, summary);
                    }
                }
            }
            // Second pass: link subtasks to their parent, one level only.
            for (const [, entry] of created) {
                if (!entry.parentId)
                    continue;
                const parent = created.get(entry.parentId);
                if (!parent || parent.parentId)
                    continue;
                try {
                    await this.db.update(db_1.tasks).set({ parentTaskId: parent.ourId }).where((0, drizzle_orm_1.eq)(db_1.tasks.id, entry.ourId));
                    summary.subtasksLinked++;
                }
                catch {
                    // leave top-level
                }
            }
            // Optional third pass: if an API token was supplied, ALSO pull the two
            // things the CSV cannot carry — comments + attachments — for every task
            // we could map back to its ClickUp id. Reuses the in-memory id-mapping
            // the CSV import just built. Errors are collected, never thrown.
            if (dto.apiToken?.trim()) {
                const mapping = Array.from(created.entries()).map(([clickupTaskId, entry]) => ({
                    clickupTaskId,
                    taskId: entry.ourId,
                }));
                try {
                    await this.enrichTasks(workspaceId, userId, dto.apiToken, mapping, { summary });
                }
                catch (e) {
                    summary.errors.push(`ClickUp API enrichment failed: ${e?.message ?? 'unknown error'}`);
                }
            }
            await this.db
                .update(db_1.clickupImportJobs)
                .set({
                status: 'completed',
                processed: rows.length,
                createdCount: summary.tasksCreated,
                updatedCount: summary.tasksUpdated,
                skippedCount: summary.tasksSkipped,
                result: summary,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId));
            return summary;
        }
        catch (e) {
            await this.db
                .update(db_1.clickupImportJobs)
                .set({ status: 'failed', error: e?.message ?? 'Import failed', updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId))
                .catch(() => undefined);
            throw e;
        }
    }
    // ── ClickUp API enrichment (comments + attachments — Plan §12.5 gap) ──────────
    /**
     * Follow-up path for an already-finished CSV job: import the comments +
     * attachments the CSV omitted, given an API token and a ClickUp→our task-id
     * mapping. Validates each target task belongs to the workspace, runs the same
     * `enrichTasks` core, and folds the result back into the stored job report.
     */
    async enrichJob(workspaceId, jobId, userId, input) {
        const job = await this.getJob(workspaceId, jobId);
        if (!input.apiToken?.trim()) {
            throw new common_1.BadRequestException('apiToken is required to import ClickUp comments + attachments');
        }
        const mapping = Array.isArray(input.mapping) ? input.mapping : [];
        const summary = await this.enrichTasks(workspaceId, userId, input.apiToken, mapping);
        const prevResult = (job.result ?? {});
        await this.db
            .update(db_1.clickupImportJobs)
            .set({
            result: {
                ...prevResult,
                enrichment: summary.enrichment,
                commentsImported: summary.commentsImported,
                attachmentsImported: summary.attachmentsImported,
                attachmentsSkipped: summary.attachmentsSkipped,
            },
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId))
            .catch(() => undefined);
        return summary;
    }
    /**
     * Import each mapped task's ClickUp comments + attachments. Shared by the
     * in-job token path (via `processImport`) and the follow-up `enrichJob`
     * endpoint. Per-item failures are collected into `summary.errors`, never
     * thrown, so one bad comment/file can't sink the batch.
     */
    async enrichTasks(workspaceId, userId, apiToken, mapping, opts = {}) {
        const summary = opts.summary ?? this.emptySummary();
        if (!apiToken?.trim()) {
            summary.errors.push('ClickUp API enrichment skipped: no API token provided');
            return summary;
        }
        const pairs = mapping.filter((m) => m?.clickupTaskId && m?.taskId);
        const r2Ready = !!this.r2?.configured;
        if (pairs.length === 0) {
            summary.enrichment = {
                attempted: true,
                tasksEnriched: 0,
                commentsImported: 0,
                attachmentsImported: 0,
                attachmentsSkipped: 0,
                r2Configured: r2Ready,
            };
            return summary;
        }
        // Guard against a crafted mapping: only touch tasks in this workspace.
        const validIds = await this.loadWorkspaceTaskIds(workspaceId, pairs.map((p) => p.taskId));
        const memberByKey = await this.loadMemberIndex(workspaceId);
        const client = opts.client ?? new clickup_api_util_1.ClickUpApiClient({ apiToken });
        let tasksEnriched = 0;
        for (const { clickupTaskId, taskId } of pairs) {
            if (!validIds.has(taskId)) {
                summary.errors.push(`Enrich: task ${taskId} is not in this workspace — skipped`);
                continue;
            }
            tasksEnriched++;
            // Comments — a whole-task fetch failure is recorded, then we move on.
            try {
                const comments = await client.getTaskComments(clickupTaskId);
                for (const c of comments) {
                    try {
                        await this.importComment(taskId, userId, c, memberByKey);
                        summary.commentsImported++;
                    }
                    catch (e) {
                        summary.errors.push(`Comment ${c?.id} on ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`);
                    }
                }
            }
            catch (e) {
                summary.errors.push(`Comments for ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`);
            }
            // Attachments — re-upload bytes to R2, then row the metadata.
            try {
                const attachments = await client.getTaskAttachments(clickupTaskId);
                for (const att of attachments) {
                    try {
                        const outcome = await this.importAttachment(workspaceId, taskId, userId, att, client, r2Ready);
                        if (outcome === 'imported')
                            summary.attachmentsImported++;
                        else
                            summary.attachmentsSkipped++;
                    }
                    catch (e) {
                        summary.attachmentsSkipped++;
                        summary.errors.push(`Attachment ${att?.id} on ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`);
                    }
                }
            }
            catch (e) {
                summary.errors.push(`Attachments for ClickUp task ${clickupTaskId}: ${e?.message ?? 'error'}`);
            }
        }
        summary.enrichment = {
            attempted: true,
            tasksEnriched,
            commentsImported: summary.commentsImported,
            attachmentsImported: summary.attachmentsImported,
            attachmentsSkipped: summary.attachmentsSkipped,
            r2Configured: r2Ready,
            ...(r2Ready
                ? {}
                : {
                    attachmentsSkippedReason: 'R2 storage is not configured — attachment bytes were not downloaded or stored.',
                }),
        };
        // Replace the CSV "not imported" note with the honest imported counts.
        summary.notImported = {
            comments: summary.commentsImported > 0
                ? `Imported ${summary.commentsImported} comment(s) from the ClickUp API.`
                : NOT_IMPORTED.comments,
            attachments: summary.attachmentsImported > 0
                ? `Imported ${summary.attachmentsImported} attachment(s) from the ClickUp API.`
                : r2Ready
                    ? NOT_IMPORTED.attachments
                    : 'R2 storage is not configured — ClickUp attachments were skipped.',
        };
        return summary;
    }
    /**
     * Insert one ClickUp comment as a `task_comments` row. When the ClickUp author
     * can't be resolved to a workspace user, we fall back to the importing user
     * for `author_id` (a NOT NULL FK) and preserve the original author + timestamp
     * as text at the head of the body. The original timestamp is also mirrored
     * into `created_at` when ClickUp provided one.
     */
    async importComment(taskId, userId, c, memberByKey) {
        const text = (0, clickup_api_util_1.extractCommentText)(c);
        const emailKey = c.user?.email?.trim().toLowerCase();
        const nameKey = c.user?.username?.trim().toLowerCase();
        const resolvedAuthor = (emailKey ? memberByKey.get(emailKey) : undefined) ??
            (nameKey ? memberByKey.get(nameKey) : undefined) ??
            null;
        const createdAt = (0, clickup_api_util_1.clickupDate)(c.date);
        let body = text;
        if (!resolvedAuthor) {
            const who = c.user?.username || c.user?.email || 'Unknown ClickUp user';
            const when = createdAt ? createdAt.toISOString() : (c.date ?? 'unknown date');
            body = `**${who}** _(ClickUp comment · ${when})_\n\n${text}`.trim();
        }
        await this.db.insert(db_1.taskComments).values({
            taskId,
            authorId: resolvedAuthor ?? userId,
            body: body || '(empty ClickUp comment)',
            ...(createdAt ? { createdAt } : {}),
        });
    }
    /**
     * Stream one ClickUp attachment to R2 and create a `task_attachments` row,
     * reusing the exact task-attachment storage-key convention + R2 upload path.
     * Returns 'skipped' (not an error) when R2 is off or the bytes can't be
     * fetched, so a missing file degrades gracefully.
     */
    async importAttachment(workspaceId, taskId, userId, att, client, r2Ready) {
        if (!r2Ready || !this.r2)
            return 'skipped';
        const dl = await client.downloadAttachment(att);
        if (!dl)
            return 'skipped';
        const fileName = att.title || (0, clickup_api_util_1.safeAttachmentName)(att.id);
        const key = `workspaces/${workspaceId}/tasks/${taskId}/attachments/${Date.now()}-${(0, clickup_api_util_1.safeAttachmentName)(fileName)}`;
        await this.r2.putObject(key, dl.buffer, dl.contentType, {
            source: 'clickup-import',
            clickupattachmentid: String(att.id).slice(0, 200),
        });
        await this.db.insert(db_1.taskAttachments).values({
            taskId,
            uploadedById: userId,
            fileName,
            contentType: dl.contentType,
            sizeBytes: att.size ?? dl.buffer.length,
            storageKey: key,
        });
        return 'imported';
    }
    /** Subset of `ids` that are tasks inside `workspaceId` (crafted-mapping guard). */
    async loadWorkspaceTaskIds(workspaceId, ids) {
        if (ids.length === 0)
            return new Set();
        const rows = await this.db
            .select({ id: db_1.tasks.id })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.tasks.id, ids)));
        return new Set(rows.map((r) => r.id));
    }
    // ── Helpers ───────────────────────────────────────────────────────────────────
    /** A zeroed summary. Comments/attachments stay 0 unless enrichment runs. */
    emptySummary() {
        return {
            spacesCreated: 0,
            projectsCreated: 0,
            listsCreated: 0,
            tasksCreated: 0,
            tasksUpdated: 0,
            tasksSkipped: 0,
            labelsCreated: 0,
            assigneesLinked: 0,
            subtasksLinked: 0,
            customFieldsCreated: 0,
            customFieldValuesSet: 0,
            duplicatesDetected: 0,
            commentsImported: 0,
            attachmentsImported: 0,
            attachmentsSkipped: 0,
            errors: [],
            notImported: { ...NOT_IMPORTED },
        };
    }
    async updateProgress(jobId, processed, summary) {
        await this.db
            .update(db_1.clickupImportJobs)
            .set({
            processed,
            createdCount: summary.tasksCreated,
            updatedCount: summary.tasksUpdated,
            skippedCount: summary.tasksSkipped,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId))
            .catch(() => undefined);
    }
    async loadMemberIndex(workspaceId) {
        const memberRows = await this.db
            .select({ userId: db_1.users.id, displayName: db_1.users.displayName, email: db_1.users.email })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
        const byKey = new Map();
        for (const m of memberRows) {
            if (m.displayName)
                byKey.set(m.displayName.trim().toLowerCase(), m.userId);
            if (m.email)
                byKey.set(m.email.trim().toLowerCase(), m.userId);
        }
        return byKey;
    }
    /** Existing tasks in the target scope, keyed by dupKey(listName, title). */
    async loadExistingTaskIndex(workspaceId, targetSpaceId) {
        const where = targetSpaceId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.spaces.id, targetSpaceId))
            : (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId);
        const rows = await this.db
            .select({ id: db_1.tasks.id, listName: db_1.lists.name, title: db_1.tasks.title })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where(where);
        const index = new Map();
        for (const r of rows) {
            const key = (0, clickup_csv_util_1.dupKey)(r.listName, r.title);
            if (!index.has(key))
                index.set(key, r.id);
        }
        return index;
    }
    async ensureLabel(workspaceId, name, cache, summary) {
        const key = name.trim().toLowerCase();
        if (!key)
            return null;
        if (cache.has(key))
            return cache.get(key);
        const [existing] = await this.db
            .select({ id: db_1.labels.id })
            .from(db_1.labels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.labels.name, name.trim())))
            .limit(1);
        if (existing) {
            cache.set(key, existing.id);
            return existing.id;
        }
        const [row] = await this.db
            .insert(db_1.labels)
            .values({ workspaceId, name: name.trim().slice(0, 60), color: '#8b5cf6' })
            .onConflictDoNothing()
            .returning();
        const id = row?.id ??
            (await this.db
                .select({ id: db_1.labels.id })
                .from(db_1.labels)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.labels.name, name.trim())))
                .limit(1))[0]?.id;
        if (id) {
            if (row)
                summary.labelsCreated++;
            cache.set(key, id);
            return id;
        }
        return null;
    }
    /**
     * Create a custom-field definition per detected column. Returns a map from the
     * (original-case) column name to its definition id, type, and a lowercase →
     * canonical option-value map (so stored dropdown values match an option).
     */
    async createCustomFieldDefinitions(projectId, columns, summary) {
        const map = new Map();
        let position = 0;
        for (const col of columns) {
            try {
                const [def] = await this.db
                    .insert(db_1.customFieldDefinitions)
                    .values({
                    projectId,
                    name: col.name.slice(0, 200),
                    type: col.type,
                    options: col.type === 'dropdown' ? col.options ?? [] : null,
                    position: position++,
                })
                    .returning({ id: db_1.customFieldDefinitions.id });
                summary.customFieldsCreated++;
                const optionByLower = col.type === 'dropdown'
                    ? new Map((col.options ?? []).map((o) => [o.value.toLowerCase(), o.value]))
                    : undefined;
                map.set(col.name, { id: def.id, type: col.type, optionByLower });
            }
            catch (e) {
                summary.errors.push(`Custom field "${col.name}": ${e?.message ?? 'unknown error'}`);
            }
        }
        return map;
    }
    async applyAssigneesTagsFields(taskId, t, memberByKey, ensureLabel, fieldDefs, summary) {
        for (const who of (0, clickup_csv_util_1.splitList)(t.assignees)) {
            const uid = memberByKey.get(who.toLowerCase());
            if (uid) {
                await this.db.insert(db_1.taskAssignees).values({ taskId, userId: uid }).onConflictDoNothing();
                summary.assigneesLinked++;
            }
        }
        for (const tag of (0, clickup_csv_util_1.splitList)(t.tags)) {
            const labelId = await ensureLabel(tag);
            if (labelId) {
                await this.db.insert(db_1.taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing();
            }
        }
        // Custom-field values — reuse the { v } value-write shape.
        for (const [colName, rawValue] of Object.entries(t.custom)) {
            const def = fieldDefs.get(colName);
            if (!def)
                continue;
            let v = (0, clickup_csv_util_1.coerceCustomValue)(def.type, rawValue);
            if (v === null)
                continue;
            if (def.type === 'dropdown' && def.optionByLower) {
                v = def.optionByLower.get(String(v).toLowerCase()) ?? v;
            }
            try {
                await this.setCustomValue(taskId, def.id, v);
                summary.customFieldValuesSet++;
            }
            catch (e) {
                summary.errors.push(`Custom value "${colName}" on "${t.title}": ${e?.message ?? 'unknown error'}`);
            }
        }
    }
    /** Upsert into custom_field_values (task_id, field_id) — the value-write path. */
    async setCustomValue(taskId, fieldId, v) {
        await this.db
            .insert(db_1.customFieldValues)
            .values({ taskId, fieldId, value: { v } })
            .onConflictDoUpdate({
            target: [db_1.customFieldValues.taskId, db_1.customFieldValues.fieldId],
            set: { value: { v }, updatedAt: new Date() },
        });
    }
    /** Merge = update the existing task's mapped fields from the CSV row. */
    async mergeTask(taskId, t) {
        await this.db
            .update(db_1.tasks)
            .set({
            description: t.description ?? undefined,
            status: (0, clickup_csv_util_1.mapStatus)(t.status),
            priority: (0, clickup_csv_util_1.mapPriority)(t.priority),
            dueDate: t.dueDate ? (0, clickup_csv_util_1.safeDate)(t.dueDate) : undefined,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
    }
};
exports.ClickUpImportService = ClickUpImportService;
exports.ClickUpImportService = ClickUpImportService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object, r2_service_1.R2Service])
], ClickUpImportService);
//# sourceMappingURL=clickup-import.service.js.map