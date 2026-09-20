"use strict";
/**
 * §V2-S13 frame `12:08` — the generic **Spreadsheet files** importer.
 *
 * One parser, one writer, and per-source column presets on top (see
 * `spreadsheet-import.util.ts`). The presets are why several of the frame's
 * named tools are genuinely covered without ten half-built code paths: Asana,
 * Jira Software, Monday, Notion, Todoist, Trello and Wrike all export a
 * task-shaped delimited file, and a mapping over one real importer is a real
 * importer for each of them.
 *
 * Three things this does that the ClickUp path does not, each of which was a
 * live defect there:
 *
 *  1. **Seeds the list's status pipeline.** `db.insert(lists)` does not; only
 *     `ListsService.createList` seeds `list_statuses`. A list imported without
 *     one has no columns to group by, so Board view renders nothing.
 *  2. **Sets `lists.space_id`.** Left null by the ClickUp path, so every
 *     "which space is this list in?" read has to join back through the project.
 *  3. **Stamps `tasks.status_category`.** Every rollup, the Closed toggle and
 *     the progress ring read that column and not `status`; an imported "Done"
 *     task with the default `open` category counts as open everywhere — a
 *     confident zero with a database row behind it.
 *
 * REJECTED ROWS ARE NEVER WRITTEN, and each one is reported by file line
 * number with the reason and the offending column.
 */
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
exports.SpreadsheetImportService = exports.CLICKUP_SOURCE = exports.SHEET_SOURCE = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../../common/database/database.module");
const clickup_csv_util_1 = require("./clickup-csv.util");
const spreadsheet_import_util_1 = require("./spreadsheet-import.util");
/** `source` values written to `clickup_import_jobs.source`. */
exports.SHEET_SOURCE = 'spreadsheet';
exports.CLICKUP_SOURCE = 'clickup_csv';
/** At most this many rejections are stored on the job row. */
const MAX_STORED_ROW_ERRORS = 200;
let SpreadsheetImportService = class SpreadsheetImportService {
    constructor(db) {
        this.db = db;
    }
    /** The picker's catalogue — served so the UI cannot drift from the parser. */
    sources() {
        return {
            sources: spreadsheet_import_util_1.SHEET_SOURCES.map((s) => ({
                key: s.key,
                label: s.label,
                exportHint: s.exportHint,
                columns: Object.keys(s.columns).length,
            })),
            /*
             * Listed as TEXT for the report, never as a control. A tile that opens a
             * dialog which cannot import is the facade defect; a sentence saying why
             * there is no tile is the opposite of one.
             */
            unsupported: spreadsheet_import_util_1.UNSUPPORTED_SOURCES.map((u) => ({ key: u.key, label: u.label, reason: u.reason })),
            /*
             * No XLSX parser ships in this repo and none was added for this row, so
             * the UI says "save it as CSV" rather than accepting an .xlsx it would
             * then fail to read.
             */
            acceptedExtensions: ['.csv', '.tsv', '.txt'],
        };
    }
    // ── preview ────────────────────────────────────────────────────────────────
    /**
     * Parse without writing. Returns the headers, the delimiter it found, the
     * starting mapping for the chosen preset, a small sample of what the rows
     * would become, and — importantly — the rows that WOULD be rejected, so the
     * refusals are visible before anything is created.
     */
    async previewSheet(workspaceId, dto) {
        const source = (0, spreadsheet_import_util_1.sourceByKey)(dto.preset);
        const table = (0, spreadsheet_import_util_1.parseSheet)(dto.content ?? '', dto.delimiter);
        if (table.headers.length === 0) {
            throw new common_1.BadRequestException('The file has no header row.');
        }
        const mapping = this.resolveMapping(table.headers, dto.mapping, dto.preset);
        const problem = (0, spreadsheet_import_util_1.mappingError)(mapping);
        const { rows, rejections } = problem
            ? { rows: [], rejections: [] }
            : (0, spreadsheet_import_util_1.mapSheet)(table, mapping, {
                priorityScale: source.priorityScale,
                defaultListName: dto.defaultListName,
            });
        // Duplicate scan against the target scope, same key the writer uses.
        const existing = problem ? new Map() : await this.loadExistingTaskIndex(workspaceId);
        const seen = new Set();
        let duplicates = 0;
        for (const r of rows) {
            const key = (0, clickup_csv_util_1.dupKey)(r.listName, r.title);
            if (existing.has(key) || seen.has(key))
                duplicates++;
            seen.add(key);
        }
        return {
            preset: source.key,
            presetLabel: source.label,
            delimiter: table.delimiter,
            headers: table.headers,
            mapping,
            mappingError: problem,
            totalRows: table.rows.length,
            importableRows: rows.length,
            rejectedRows: rejections.length,
            rowErrors: rejections.slice(0, MAX_STORED_ROW_ERRORS),
            uniqueLists: Array.from(new Set(rows.map((r) => r.listName))),
            duplicates,
            sample: rows.slice(0, 5).map((r) => ({
                row: r.row,
                title: r.title,
                status: r.status,
                priority: r.priority,
                list: r.listName,
                dueDate: r.dueDate?.toISOString() ?? null,
                assignees: r.assignees,
                tags: r.tags,
            })),
        };
    }
    // ── job lifecycle ──────────────────────────────────────────────────────────
    async startSheetImport(workspaceId, userId, dto) {
        if (!dto.content?.trim())
            throw new common_1.BadRequestException('The uploaded file is empty.');
        const table = (0, spreadsheet_import_util_1.parseSheet)(dto.content, dto.delimiter);
        if (table.headers.length === 0)
            throw new common_1.BadRequestException('The file has no header row.');
        if (table.rows.length === 0)
            throw new common_1.BadRequestException('The file has a header but no data rows.');
        const mapping = this.resolveMapping(table.headers, dto.mapping, dto.preset);
        const problem = (0, spreadsheet_import_util_1.mappingError)(mapping);
        if (problem)
            throw new common_1.BadRequestException(problem);
        const source = (0, spreadsheet_import_util_1.sourceByKey)(dto.preset);
        const [job] = await this.db
            .insert(db_1.clickupImportJobs)
            .values({
            workspaceId,
            createdById: userId,
            status: 'pending',
            total: table.rows.length,
            source: exports.SHEET_SOURCE,
            sourcePreset: source.key,
        })
            .returning({ id: db_1.clickupImportJobs.id });
        void this.processSheetImport(job.id, workspaceId, userId, dto).catch(() => undefined);
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
     * The import history. THE READER OF `source`: without the filter this would
     * mix the ClickUp runs into the spreadsheet importer's history and the column
     * would be a stored value nobody honours.
     */
    async listJobs(workspaceId, opts = {}) {
        const where = opts.source
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.clickupImportJobs.source, opts.source))
            : (0, drizzle_orm_1.eq)(db_1.clickupImportJobs.workspaceId, workspaceId);
        return this.db
            .select({
            id: db_1.clickupImportJobs.id,
            source: db_1.clickupImportJobs.source,
            sourcePreset: db_1.clickupImportJobs.sourcePreset,
            status: db_1.clickupImportJobs.status,
            total: db_1.clickupImportJobs.total,
            processed: db_1.clickupImportJobs.processed,
            createdCount: db_1.clickupImportJobs.createdCount,
            updatedCount: db_1.clickupImportJobs.updatedCount,
            skippedCount: db_1.clickupImportJobs.skippedCount,
            rejectedCount: db_1.clickupImportJobs.rejectedCount,
            createdAt: db_1.clickupImportJobs.createdAt,
        })
            .from(db_1.clickupImportJobs)
            .where(where)
            .orderBy((0, drizzle_orm_1.desc)(db_1.clickupImportJobs.createdAt))
            .limit(Math.min(Math.max(opts.limit ?? 20, 1), 100));
    }
    // ── the worker ─────────────────────────────────────────────────────────────
    /**
     * Awaitable so tests and verification can run it directly and read the
     * summary rather than poll. Streams progress into the job row as it goes.
     */
    async processSheetImport(jobId, workspaceId, userId, dto) {
        const source = (0, spreadsheet_import_util_1.sourceByKey)(dto.preset);
        const strategy = dto.strategy ?? 'skip';
        const summary = this.emptySummary(source.key);
        try {
            const table = (0, spreadsheet_import_util_1.parseSheet)(dto.content, dto.delimiter);
            const mapping = this.resolveMapping(table.headers, dto.mapping, dto.preset);
            const problem = (0, spreadsheet_import_util_1.mappingError)(mapping);
            if (problem)
                throw new common_1.BadRequestException(problem);
            const { rows, rejections } = (0, spreadsheet_import_util_1.mapSheet)(table, mapping, {
                priorityScale: source.priorityScale,
                defaultListName: dto.defaultListName,
            });
            summary.tasksRejected = rejections.length;
            summary.rowErrors = rejections.slice(0, MAX_STORED_ROW_ERRORS);
            summary.rowErrorsTruncated = rejections.length > MAX_STORED_ROW_ERRORS;
            await this.db
                .update(db_1.clickupImportJobs)
                .set({
                status: 'processing',
                total: table.rows.length,
                rejectedCount: summary.tasksRejected,
                rowErrors: summary.rowErrors,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId));
            // ── target tree ────────────────────────────────────────────────────────
            let spaceId = dto.targetSpaceId;
            if (!spaceId) {
                const [space] = await this.db
                    .insert(db_1.spaces)
                    .values({
                    workspaceId,
                    name: dto.targetProjectName?.trim() || `Imported from ${source.label}`,
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
                name: dto.targetProjectName?.trim() || `${source.label} import`,
                description: `Imported from a ${source.label} export on ${new Date().toISOString()}`,
            })
                .returning();
            summary.projectsCreated++;
            const memberByKey = await this.loadMemberIndex(workspaceId);
            const existing = await this.loadExistingTaskIndex(workspaceId, dto.targetSpaceId);
            const labelCache = new Map();
            const byList = new Map();
            for (const r of rows) {
                const name = r.listName || spreadsheet_import_util_1.DEFAULT_LIST_NAME;
                const arr = byList.get(name) ?? [];
                arr.push(r);
                byList.set(name, arr);
            }
            const seenByKey = new Map();
            const updateEvery = Math.max(1, Math.ceil(Math.max(rows.length, 1) / 100));
            // Rejected rows are already accounted for; progress starts past them so
            // the bar reaches 100% on a file where some rows were refused.
            let processed = rejections.length;
            let position = 0;
            for (const [listName, listRows] of byList) {
                let listId;
                try {
                    listId = await this.createList(project.id, spaceId, listName, position++, userId);
                    summary.listsCreated++;
                }
                catch (e) {
                    summary.errors.push(`List "${listName}": ${e?.message ?? 'unknown error'}`);
                    processed += listRows.length;
                    await this.updateProgress(jobId, processed, summary);
                    continue;
                }
                for (const r of listRows) {
                    try {
                        const key = (0, clickup_csv_util_1.dupKey)(listName, r.title);
                        const targetId = existing.get(key) ?? seenByKey.get(key);
                        if (targetId)
                            summary.duplicatesDetected++;
                        if (targetId && strategy === 'skip') {
                            summary.tasksSkipped++;
                        }
                        else if (targetId && strategy === 'merge') {
                            await this.db
                                .update(db_1.tasks)
                                .set({
                                description: r.description ?? undefined,
                                status: r.status,
                                statusCategory: r.statusCategory,
                                priority: r.priority,
                                dueDate: r.dueDate,
                                startDate: r.startDate,
                                updatedAt: new Date(),
                            })
                                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, targetId));
                            summary.tasksUpdated++;
                            await this.applyPeopleAndTags(workspaceId, targetId, r, memberByKey, labelCache, summary);
                        }
                        else {
                            const [task] = await this.db
                                .insert(db_1.tasks)
                                .values({
                                listId,
                                createdById: userId,
                                title: r.title,
                                description: r.description ?? null,
                                status: r.status,
                                // The column every rollup reads. See the header note.
                                statusCategory: r.statusCategory,
                                priority: r.priority,
                                dueDate: r.dueDate,
                                startDate: r.startDate,
                            })
                                .returning();
                            summary.tasksCreated++;
                            if (!seenByKey.has(key))
                                seenByKey.set(key, task.id);
                            await this.applyPeopleAndTags(workspaceId, task.id, r, memberByKey, labelCache, summary);
                        }
                    }
                    catch (e) {
                        summary.errors.push(`Row ${r.row} ("${r.title}"): ${e?.message ?? 'unknown error'}`);
                    }
                    finally {
                        processed++;
                        if (processed % updateEvery === 0)
                            await this.updateProgress(jobId, processed, summary);
                    }
                }
            }
            await this.db
                .update(db_1.clickupImportJobs)
                .set({
                status: 'completed',
                processed: table.rows.length,
                createdCount: summary.tasksCreated,
                updatedCount: summary.tasksUpdated,
                skippedCount: summary.tasksSkipped,
                rejectedCount: summary.tasksRejected,
                rowErrors: summary.rowErrors,
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
    // ── helpers ────────────────────────────────────────────────────────────────
    /** An explicit mapping wins; otherwise the preset's auto-mapping. */
    resolveMapping(headers, supplied, preset) {
        if (!supplied || Object.keys(supplied).length === 0)
            return (0, spreadsheet_import_util_1.autoMap)(headers, preset);
        // Only headers the file actually has; an unknown key would silently do
        // nothing and make the mapping look richer than it is.
        const mapping = {};
        for (const h of headers)
            mapping[h] = supplied[h] ?? 'ignore';
        return mapping;
    }
    /**
     * Create a list AND its default status pipeline, the way `ListsService` does
     * — `db.insert(lists)` alone leaves a list with no statuses to group by.
     * `space_id` is set here too; the ClickUp path leaves it null.
     */
    async createList(projectId, spaceId, name, position, userId) {
        const [list] = await this.db
            .insert(db_1.lists)
            .values({ projectId, spaceId, name: name.slice(0, 200), position, createdById: userId })
            .returning({ id: db_1.lists.id });
        await this.db
            .insert(db_1.listStatuses)
            .values(spreadsheet_import_util_1.DEFAULT_STATUSES.map((s) => ({ listId: list.id, ...s })))
            .onConflictDoNothing();
        return list.id;
    }
    async applyPeopleAndTags(workspaceId, taskId, row, memberByKey, labelCache, summary) {
        for (const who of row.assignees) {
            const userId = memberByKey.get(who.toLowerCase());
            if (!userId) {
                summary.assigneesUnmatched++;
                continue;
            }
            await this.db.insert(db_1.taskAssignees).values({ taskId, userId }).onConflictDoNothing();
            summary.assigneesLinked++;
        }
        for (const tag of row.tags) {
            const labelId = await this.ensureLabel(workspaceId, tag, labelCache, summary);
            if (labelId) {
                await this.db.insert(db_1.taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing();
            }
        }
    }
    async ensureLabel(workspaceId, name, cache, summary) {
        const trimmed = name.trim().slice(0, 60);
        const key = trimmed.toLowerCase();
        if (!key)
            return null;
        if (cache.has(key))
            return cache.get(key);
        const [found] = await this.db
            .select({ id: db_1.labels.id })
            .from(db_1.labels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.labels.name, trimmed)))
            .limit(1);
        if (found) {
            cache.set(key, found.id);
            return found.id;
        }
        const [row] = await this.db
            .insert(db_1.labels)
            .values({ workspaceId, name: trimmed, color: '#8b5cf6' })
            .onConflictDoNothing()
            .returning({ id: db_1.labels.id });
        const id = row?.id ??
            (await this.db
                .select({ id: db_1.labels.id })
                .from(db_1.labels)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.labels.name, trimmed)))
                .limit(1))[0]?.id;
        if (!id)
            return null;
        if (row)
            summary.labelsCreated++;
        cache.set(key, id);
        return id;
    }
    async loadMemberIndex(workspaceId) {
        const rows = await this.db
            .select({ userId: db_1.users.id, displayName: db_1.users.displayName, email: db_1.users.email })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
        const byKey = new Map();
        for (const m of rows) {
            if (m.displayName)
                byKey.set(m.displayName.trim().toLowerCase(), m.userId);
            if (m.email)
                byKey.set(m.email.trim().toLowerCase(), m.userId);
        }
        return byKey;
    }
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
    async updateProgress(jobId, processed, summary) {
        await this.db
            .update(db_1.clickupImportJobs)
            .set({
            processed,
            createdCount: summary.tasksCreated,
            updatedCount: summary.tasksUpdated,
            skippedCount: summary.tasksSkipped,
            rejectedCount: summary.tasksRejected,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.clickupImportJobs.id, jobId))
            .catch(() => undefined);
    }
    emptySummary(preset) {
        return {
            source: exports.SHEET_SOURCE,
            sourcePreset: preset,
            spacesCreated: 0,
            projectsCreated: 0,
            listsCreated: 0,
            tasksCreated: 0,
            tasksUpdated: 0,
            tasksSkipped: 0,
            tasksRejected: 0,
            labelsCreated: 0,
            assigneesLinked: 0,
            assigneesUnmatched: 0,
            duplicatesDetected: 0,
            rowErrors: [],
            rowErrorsTruncated: false,
            errors: [],
        };
    }
};
exports.SpreadsheetImportService = SpreadsheetImportService;
exports.SpreadsheetImportService = SpreadsheetImportService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], SpreadsheetImportService);
//# sourceMappingURL=spreadsheet-import.service.js.map