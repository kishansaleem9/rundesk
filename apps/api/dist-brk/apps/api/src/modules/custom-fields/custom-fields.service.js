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
exports.CustomFieldsService = exports.TSHIRT_SIZES = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const progress_1 = require("./progress");
/**
 * §V2-01c — T-shirt Size is a FIXED set, not a per-field one.
 *
 * `dropdown` already covers "pick one of the options this field defines". The
 * whole point of a separate type is that everybody's sizes are the same, so
 * they are defined here rather than typed in again on every field.
 */
exports.TSHIRT_SIZES = ['xs', 's', 'm', 'l', 'xl'];
/** The types that hold a list rather than one value. */
const MULTI_TYPES = new Set(['labels', 'people', 'files', 'voting']);
let CustomFieldsService = class CustomFieldsService {
    constructor(db) {
        this.db = db;
    }
    // ── Definition ownership guard ──────────────────────────────────────────────
    async assertProjectInWorkspace(workspaceId, projectId) {
        const [row] = await this.db
            .select({ id: db_1.projects.id })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.id, projectId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Project not found in this workspace');
    }
    async assertTaskInWorkspace(workspaceId, taskId) {
        const [row] = await this.db
            .select({ taskId: db_1.tasks.id, projectId: db_1.lists.projectId, listId: db_1.tasks.listId })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Task not found in this workspace');
        return row;
    }
    // ── Definitions ─────────────────────────────────────────────────────────────
    async listForProject(workspaceId, projectId) {
        await this.assertProjectInWorkspace(workspaceId, projectId);
        return this.db
            .select()
            .from(db_1.customFieldDefinitions)
            .where((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.projectId, projectId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.customFieldDefinitions.position), (0, drizzle_orm_1.asc)(db_1.customFieldDefinitions.createdAt));
    }
    async createDefinition(workspaceId, projectId, dto) {
        await this.assertProjectInWorkspace(workspaceId, projectId);
        // `options` must be an array when present — a non-array (e.g. {} or a bare
        // string) passes the length check below (undefined === 0 is false) and gets
        // stored, then crashes every reader that does `options.map(...)`.
        if (dto.options != null && !Array.isArray(dto.options)) {
            throw new common_1.BadRequestException('Custom field "options" must be an array');
        }
        // `labels` is a dropdown you can pick several of, so it needs options for
        // the same reason and the message names the type rather than assuming one.
        if ((dto.type === 'dropdown' || dto.type === 'labels') && (!dto.options || dto.options.length === 0)) {
            throw new common_1.BadRequestException(`${dto.type === 'labels' ? 'Labels' : 'Dropdown'} fields require at least one option`);
        }
        // Position = current max + 1
        const existing = await this.db
            .select({ position: db_1.customFieldDefinitions.position })
            .from(db_1.customFieldDefinitions)
            .where((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.projectId, projectId));
        const nextPos = existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.position)) + 1;
        const [row] = await this.db
            .insert(db_1.customFieldDefinitions)
            .values({
            projectId,
            listId: dto.listId,
            name: dto.name,
            type: dto.type,
            isRequired: dto.isRequired ?? false,
            options: dto.options ?? null,
            // Normalised on the way in, so a half-written config cannot make the
            // percentage depend on which fields somebody happened to send.
            config: dto.type === 'progress_auto' ? (0, progress_1.toProgressConfig)(dto.config) : null,
            position: nextPos,
        })
            .returning();
        return row;
    }
    async updateDefinition(workspaceId, fieldId, patch) {
        const def = await this.getDefOwnedBy(workspaceId, fieldId);
        if (patch.options != null && !Array.isArray(patch.options)) {
            throw new common_1.BadRequestException('Custom field "options" must be an array');
        }
        const set = { updatedAt: new Date() };
        for (const key of ['name', 'isRequired', 'options', 'position']) {
            if (patch[key] !== undefined)
                set[key] = patch[key];
        }
        /*
         * §V2-01b — reconfiguring which sources a Progress field tracks. Normalised
         * through the same reader the computation uses, so turning a source off in
         * the UI and turning it off in the database cannot mean different things.
         */
        if (patch.config !== undefined && def.type === 'progress_auto') {
            set.config = (0, progress_1.toProgressConfig)(patch.config);
        }
        const [row] = await this.db
            .update(db_1.customFieldDefinitions)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.id, def.id))
            .returning();
        return row;
    }
    async deleteDefinition(workspaceId, fieldId) {
        const def = await this.getDefOwnedBy(workspaceId, fieldId);
        // Cascade deletes the values automatically via FK.
        await this.db.delete(db_1.customFieldDefinitions).where((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.id, def.id));
        return { ok: true };
    }
    async getDefOwnedBy(workspaceId, fieldId) {
        const [row] = await this.db
            .select({
            id: db_1.customFieldDefinitions.id,
            projectId: db_1.customFieldDefinitions.projectId,
            type: db_1.customFieldDefinitions.type,
            options: db_1.customFieldDefinitions.options,
        })
            .from(db_1.customFieldDefinitions)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.customFieldDefinitions.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.id, fieldId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Custom field not found');
        return row;
    }
    // ── Values ──────────────────────────────────────────────────────────────────
    async getValuesForTask(workspaceId, taskId) {
        const task = await this.assertTaskInWorkspace(workspaceId, taskId);
        /*
         * §V2-S01c — `listId` NARROWS THE FIELD, and until now it did not.
         *
         * `createDefinition` has accepted and STORED `listId` since custom fields
         * shipped — the column means "this field applies to one list, not the whole
         * project". Every reader filtered on `projectId` alone, so a field scoped to
         * a single list appeared on every task in the project anyway. A setting the
         * server records and no reader honours is the same defect as a switch that
         * changes nothing, seen from the other side; this codebase has now found it
         * in both directions.
         *
         * NULL means project-wide, which is what every existing row is.
         */
        const defs = await this.db
            .select()
            .from(db_1.customFieldDefinitions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.projectId, task.projectId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(db_1.customFieldDefinitions.listId), (0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.listId, task.listId))))
            .orderBy((0, drizzle_orm_1.asc)(db_1.customFieldDefinitions.position));
        const values = await this.db
            .select()
            .from(db_1.customFieldValues)
            .where((0, drizzle_orm_1.eq)(db_1.customFieldValues.taskId, taskId));
        const byField = new Map(values.map((v) => [v.fieldId, v]));
        /*
         * §V2-01b — Progress (Auto) is COMPUTED HERE, not read.
         *
         * The tallies are gathered once, and only when some field on this project
         * actually asks for them: most projects have no Progress field and should
         * not pay three extra queries per task read for one that does not exist.
         */
        const wantsProgress = defs.some((d) => d.type === 'progress_auto');
        const progress = wantsProgress ? await this.progressFor(taskId) : null;
        return defs.map((d) => {
            if (d.type === 'progress_auto') {
                return {
                    definition: d,
                    value: (0, progress_1.computeProgress)((0, progress_1.toProgressConfig)(d.config), progress.inputs, progress.taskIsDone),
                };
            }
            const stored = byField.get(d.id)?.value.v ?? null;
            /*
             * §V2-01c — an unset list comes back as [], not null.
             *
             * Otherwise every renderer and every caller has to treat "no labels yet"
             * and "labels cleared" as two states that mean the same thing, and one of
             * them eventually gets forgotten. One shape, decided here.
             */
            return {
                definition: d,
                value: MULTI_TYPES.has(d.type) ? (Array.isArray(stored) ? stored : []) : stored,
            };
        });
    }
    /**
     * What there is to count on this task, for §V2-01b.
     *
     * The three sources are exactly the three the frame names, and each one's
     * notion of "done" is that source's own: a subtask is done when its status is
     * in the closed category, a checklist item when it is ticked, an assigned
     * comment when it has been resolved. Only comments that were ASSIGNED to
     * somebody count — an ordinary comment is not a piece of work.
     */
    async progressFor(taskId) {
        const [subs, checks, comments, self] = await Promise.all([
            this.db
                .select({ done: db_1.tasks.statusCategory })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.parentTaskId, taskId)),
            this.db
                .select({ done: db_1.taskChecklistItems.isDone })
                .from(db_1.taskChecklistItems)
                .innerJoin(db_1.taskChecklists, (0, drizzle_orm_1.eq)(db_1.taskChecklists.id, db_1.taskChecklistItems.checklistId))
                .where((0, drizzle_orm_1.eq)(db_1.taskChecklists.taskId, taskId)),
            this.db
                .select({ resolvedAt: db_1.taskComments.resolvedAt })
                .from(db_1.taskComments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskComments.taskId, taskId), (0, drizzle_orm_1.isNotNull)(db_1.taskComments.assignedToUserId))),
            this.db
                .select({ statusCategory: db_1.tasks.statusCategory })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
                .limit(1),
        ]);
        return {
            inputs: {
                subtasks: { total: subs.length, done: subs.filter((r) => r.done === 'closed').length },
                checklists: { total: checks.length, done: checks.filter((r) => r.done).length },
                assignedComments: {
                    total: comments.length,
                    done: comments.filter((r) => r.resolvedAt != null).length,
                },
            },
            taskIsDone: self[0]?.statusCategory === 'closed',
        };
    }
    /**
     * @param actorId who is writing. Only `voting` uses it, and that is the whole
     *   reason it exists: a vote you can cast on somebody else's behalf is not a
     *   vote. Every other type's value is the same whoever sets it.
     */
    async setValue(workspaceId, taskId, fieldId, value, actorId) {
        await this.assertTaskInWorkspace(workspaceId, taskId);
        const def = await this.getDefOwnedBy(workspaceId, fieldId);
        /*
         * §V2-01b — a Progress (Auto) value cannot be written, and refusing is the
         * point rather than a limitation. The whole meaning of Auto is that the
         * number follows the work; a stored one would be right until the next
         * checklist item was ticked and silently wrong afterwards. Accepting the
         * write and ignoring it would be worse still — the caller would believe it.
         */
        if (def.type === 'progress_auto') {
            throw new common_1.BadRequestException('Progress (Auto) is calculated from subtasks, checklists and assigned comments — it cannot be set directly');
        }
        /*
         * VOTING IGNORES THE SUBMITTED VALUE, on purpose.
         *
         * The obvious design — accept a list of voter ids — lets anyone rewrite the
         * tally, adding colleagues who never voted or removing ones who did. So the
         * body is not read at all: this toggles the CALLER's own vote and nothing
         * else. The endpoint is therefore "vote" rather than "set the votes", which
         * is what the control on screen actually means.
         */
        if (def.type === 'voting') {
            if (!actorId) {
                throw new common_1.BadRequestException('Voting needs to know who is voting');
            }
            const [row] = await this.db
                .select()
                .from(db_1.customFieldValues)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customFieldValues.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.customFieldValues.fieldId, fieldId)))
                .limit(1);
            const current = Array.isArray(row?.value?.v) ? row.value.v : [];
            const next = current.includes(actorId)
                ? current.filter((id) => id !== actorId)
                : [...current, actorId];
            if (row) {
                const [updated] = await this.db
                    .update(db_1.customFieldValues)
                    .set({ value: { v: next }, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(db_1.customFieldValues.id, row.id))
                    .returning();
                return updated;
            }
            const [inserted] = await this.db
                .insert(db_1.customFieldValues)
                .values({ taskId, fieldId, value: { v: next } })
                .returning();
            return inserted;
        }
        // Type validation
        if (value !== null) {
            switch (def.type) {
                case 'text':
                case 'url':
                case 'date':
                case 'email':
                case 'phone':
                    if (typeof value !== 'string') {
                        throw new common_1.BadRequestException(`Field expects a string value`);
                    }
                    if (def.type === 'url' && !/^https?:\/\//.test(value)) {
                        throw new common_1.BadRequestException('URL must start with http:// or https://');
                    }
                    if (def.type === 'date' && Number.isNaN(Date.parse(value))) {
                        throw new common_1.BadRequestException('Invalid date value');
                    }
                    if (def.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                        throw new common_1.BadRequestException('Invalid email address');
                    }
                    if (def.type === 'phone' && !/^[+]?[0-9().\-\s]{5,}$/.test(value)) {
                        throw new common_1.BadRequestException('Invalid phone number');
                    }
                    break;
                case 'number':
                case 'money':
                    if (typeof value !== 'number' || !Number.isFinite(value)) {
                        throw new common_1.BadRequestException('Field expects a number value');
                    }
                    break;
                case 'rating':
                    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
                        throw new common_1.BadRequestException('Rating must be an integer from 0 to 5');
                    }
                    break;
                case 'checkbox':
                    if (typeof value !== 'boolean') {
                        throw new common_1.BadRequestException('Field expects a boolean value');
                    }
                    break;
                case 'dropdown': {
                    const opts = def.options ?? [];
                    if (typeof value !== 'string' || !opts.some((o) => o.value === value)) {
                        throw new common_1.BadRequestException('Value must match a defined option');
                    }
                    break;
                }
                // ── §V2-01c ────────────────────────────────────────────────────────
                case 'long_text':
                case 'location':
                    if (typeof value !== 'string') {
                        throw new common_1.BadRequestException('Field expects a string value');
                    }
                    break;
                case 'tshirt_size':
                    // A FIXED set, which is the only thing separating this from a
                    // dropdown. Accepting anything else would make every field's sizes
                    // different and the type pointless.
                    if (typeof value !== 'string' || !exports.TSHIRT_SIZES.includes(value)) {
                        throw new common_1.BadRequestException(`Size must be one of ${exports.TSHIRT_SIZES.join(', ')}`);
                    }
                    break;
                case 'progress_manual':
                    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
                        throw new common_1.BadRequestException('Progress must be a number from 0 to 100');
                    }
                    break;
                case 'labels': {
                    const opts = def.options ?? [];
                    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
                        throw new common_1.BadRequestException('Labels expects a list of option values');
                    }
                    const unknown = value.filter((v) => !opts.some((o) => o.value === v));
                    if (unknown.length) {
                        throw new common_1.BadRequestException(`Not a defined option: ${unknown.join(', ')}`);
                    }
                    // Duplicates are a caller bug, and storing them would draw the same
                    // chip twice; de-duplicating silently would hide it. Refuse.
                    if (new Set(value).size !== value.length) {
                        throw new common_1.BadRequestException('The same label was given twice');
                    }
                    break;
                }
                case 'files': {
                    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
                        throw new common_1.BadRequestException('Files expects a list of attachment ids');
                    }
                    if (new Set(value).size !== value.length) {
                        throw new common_1.BadRequestException('The same file was given twice');
                    }
                    /*
                     * THE IDS MUST BE FILES ON THIS TASK. Without this the field stores
                     * any attachment id at all — including one on a task the reader
                     * cannot open — and the renderer would then link to somebody else's
                     * document. The same shape of rule as `people`, for the same reason.
                     */
                    if (value.length) {
                        const rows = await this.db
                            .select({ id: db_1.taskAttachments.id })
                            .from(db_1.taskAttachments)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId), (0, drizzle_orm_1.inArray)(db_1.taskAttachments.id, value)));
                        const known = new Set(rows.map((r) => r.id));
                        if (value.some((v) => !known.has(v))) {
                            throw new common_1.BadRequestException('Those files are not attached to this task');
                        }
                    }
                    break;
                }
                case 'people': {
                    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
                        throw new common_1.BadRequestException('People expects a list of user ids');
                    }
                    if (new Set(value).size !== value.length) {
                        throw new common_1.BadRequestException('The same person was given twice');
                    }
                    /*
                     * THE IDS MUST BE PEOPLE IN THIS WORKSPACE. Without this the field
                     * would happily store any uuid — including a member of a workspace
                     * this one cannot see — and the renderer would then either draw a
                     * stranger or a blank. A field that can name somebody who is not
                     * here is a small information leak wearing a text box.
                     */
                    if (value.length) {
                        const members = await this.db
                            .select({ userId: db_1.workspaceMembers.userId })
                            .from(db_1.workspaceMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.userId, value)));
                        const known = new Set(members.map((m) => m.userId));
                        const strangers = value.filter((v) => !known.has(v));
                        if (strangers.length) {
                            throw new common_1.BadRequestException('Those people are not members of this workspace');
                        }
                    }
                    break;
                }
            }
        }
        // Upsert (taskId, fieldId) is unique
        const existing = await this.db
            .select()
            .from(db_1.customFieldValues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customFieldValues.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.customFieldValues.fieldId, fieldId)))
            .limit(1);
        if (existing[0]) {
            const [row] = await this.db
                .update(db_1.customFieldValues)
                .set({ value: { v: value }, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.customFieldValues.id, existing[0].id))
                .returning();
            return row;
        }
        const [row] = await this.db
            .insert(db_1.customFieldValues)
            .values({ taskId, fieldId, value: { v: value } })
            .returning();
        return row;
    }
};
exports.CustomFieldsService = CustomFieldsService;
exports.CustomFieldsService = CustomFieldsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], CustomFieldsService);
//# sourceMappingURL=custom-fields.service.js.map