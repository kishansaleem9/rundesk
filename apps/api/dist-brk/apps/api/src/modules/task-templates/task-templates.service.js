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
exports.TaskTemplatesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const tasks_service_1 = require("../tasks/tasks.service");
const security_service_1 = require("../security/security.service");
const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;
const MAX_SUBTASKS = 100;
const MAX_CHECKLISTS = 20;
const MAX_CHECKLIST_ITEMS = 100;
const MAX_LABELS = 50;
const MAX_CUSTOM_FIELDS = 100;
/**
 * Empty payload returned when callers ask for a "blank" template
 * (e.g. building one manually via the UI). Kept here so the shape
 * stays in sync if `TaskTemplatePayload` grows new fields.
 */
const EMPTY_PAYLOAD = {
    title: '',
    description: null,
    priority: 'normal',
    timeEstimate: null,
    startDateOffsetDays: null,
    dueDateOffsetDays: null,
    labels: [],
    checklists: [],
    subtasks: [],
    customFieldValues: [],
};
let TaskTemplatesService = class TaskTemplatesService {
    constructor(db, tasksService, security) {
        this.db = db;
        this.tasksService = tasksService;
        this.security = security;
    }
    // -------------------------------------------------------------- CRUD
    async list(workspaceId) {
        const rows = await this.db
            .select()
            .from(db_1.taskTemplates)
            .where((0, drizzle_orm_1.eq)(db_1.taskTemplates.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskTemplates.usageCount), (0, drizzle_orm_1.desc)(db_1.taskTemplates.updatedAt));
        return rows.map((r) => this.toView(r));
    }
    async getById(workspaceId, id) {
        const row = await this.requireTemplate(workspaceId, id);
        return this.toView(row);
    }
    async create(workspaceId, actor, dto) {
        const name = this.normaliseName(dto.name);
        const description = this.normaliseDescription(dto.description ?? null);
        const payload = this.normalisePayload({ ...EMPTY_PAYLOAD, ...(dto.payload ?? {}) });
        const [row] = await this.db
            .insert(db_1.taskTemplates)
            .values({
            workspaceId,
            name,
            description,
            icon: dto.icon ?? null,
            payload,
            createdById: actor.id,
        })
            .returning();
        if (!row)
            throw new Error('Failed to create template');
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'task_template.created',
            resourceType: 'task_template',
            resourceId: row.id,
            description: `Task template "${name}" created`,
        });
        return this.toView(row);
    }
    async update(workspaceId, id, actor, patch) {
        const existing = await this.requireTemplate(workspaceId, id);
        const next = {};
        if (patch.name !== undefined)
            next.name = this.normaliseName(patch.name);
        if (patch.description !== undefined)
            next.description = this.normaliseDescription(patch.description);
        if (patch.icon !== undefined)
            next.icon = patch.icon;
        if (patch.payload !== undefined) {
            next.payload = this.normalisePayload({ ...existing.payload, ...patch.payload });
        }
        if (Object.keys(next).length === 0)
            return this.toView(existing);
        next.updatedAt = new Date();
        const [row] = await this.db
            .update(db_1.taskTemplates)
            .set(next)
            .where((0, drizzle_orm_1.eq)(db_1.taskTemplates.id, id))
            .returning();
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'task_template.updated',
            resourceType: 'task_template',
            resourceId: id,
            description: `Task template "${row?.name ?? existing.name}" updated`,
        });
        return this.toView(row ?? existing);
    }
    async remove(workspaceId, id, actor) {
        const existing = await this.requireTemplate(workspaceId, id);
        await this.db.delete(db_1.taskTemplates).where((0, drizzle_orm_1.eq)(db_1.taskTemplates.id, id));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'task_template.deleted',
            resourceType: 'task_template',
            resourceId: id,
            description: `Task template "${existing.name}" deleted`,
        });
    }
    // ------------------------------------------------- snapshot from task
    /**
     * Snapshot an existing task into a reusable template owned by this
     * workspace. Captures: title, description, priority, time estimate,
     * date offsets (computed relative to "today" at save time), labels,
     * checklists with items, one level of subtasks, and custom-field
     * values keyed by definition name.
     *
     * Status is intentionally NOT captured because each list has its
     * own custom-status pipeline — see TaskTemplatePayload docstring.
     */
    async saveFromTask(workspaceId, taskId, actor, dto) {
        const ctx = await this.resolveTaskContext(taskId);
        if (!ctx)
            throw new common_1.NotFoundException('Task not found');
        if (ctx.workspaceId !== workspaceId)
            throw new common_1.NotFoundException('Task not found in this workspace');
        const payload = await this.snapshotTask(taskId);
        return this.create(workspaceId, actor, {
            name: dto.name,
            description: dto.description ?? null,
            icon: dto.icon ?? null,
            payload,
        });
    }
    // ----------------------------------------------------- instantiation
    /**
     * Materialize a template into a real task under the target list.
     * Subtasks, checklists, labels (resolved by name within the
     * workspace — missing ones are auto-created with a neutral color),
     * and custom-field values (resolved by definition name within the
     * target project) are all reconstructed.
     *
     * Date offsets are interpreted as days from `now` so a template
     * with `dueDateOffsetDays: 7` always produces a task due in a week.
     */
    async instantiate(workspaceId, templateId, actor, dto) {
        const template = await this.requireTemplate(workspaceId, templateId);
        const listCtx = await this.resolveListContext(dto.listId);
        if (!listCtx)
            throw new common_1.NotFoundException('Target list not found');
        if (listCtx.workspaceId !== workspaceId) {
            throw new common_1.BadRequestException('Target list belongs to a different workspace');
        }
        const payload = template.payload;
        const now = new Date();
        const labelIds = await this.resolveLabelIds(workspaceId, payload.labels, actor.id);
        const startDate = offsetToDate(now, payload.startDateOffsetDays);
        const dueDate = offsetToDate(now, payload.dueDateOffsetDays);
        const task = await this.tasksService.createTask({
            listId: dto.listId,
            title: dto.titleOverride?.trim() || payload.title || template.name,
            description: payload.description ?? undefined,
            priority: payload.priority,
            timeEstimate: payload.timeEstimate ?? undefined,
            startDate: startDate ?? undefined,
            dueDate: dueDate ?? undefined,
            labelIds: labelIds.length ? labelIds : undefined,
            assigneeIds: dto.assigneeIds?.length ? dto.assigneeIds : undefined,
            createdById: actor.id,
        });
        if (!task)
            throw new Error('Task creation returned no row');
        await this.materialiseChecklists(task.id, payload.checklists);
        await this.materialiseCustomFieldValues(task.id, listCtx.projectId, payload.customFieldValues);
        await this.materialiseSubtasks(dto.listId, task.id, payload.subtasks, actor.id, now);
        // Bump usage count for ordering/discovery.
        await this.db
            .update(db_1.taskTemplates)
            .set({ usageCount: (0, drizzle_orm_1.sql) `${db_1.taskTemplates.usageCount} + 1`, updatedAt: now })
            .where((0, drizzle_orm_1.eq)(db_1.taskTemplates.id, templateId));
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'task_template.applied',
            resourceType: 'task',
            resourceId: task.id,
            description: `Task created from template "${template.name}"`,
            metadata: { templateId },
        });
        return { taskId: task.id, templateId, task };
    }
    /**
     * Duplicate an existing task: clone its core fields, assignees, labels,
     * checklists, custom-field values and one level of subtasks into the SAME
     * list, with "(copy)" appended to the title. Dates are copied verbatim from
     * the source (not shifted like template offsets). The copy starts open.
     */
    async duplicateTask(workspaceId, taskId, actor) {
        const ctx = await this.resolveTaskContext(taskId);
        if (!ctx)
            throw new common_1.NotFoundException('Task not found');
        if (ctx.workspaceId !== workspaceId)
            throw new common_1.NotFoundException('Task not found in this workspace');
        const [src] = await this.db
            .select({ startDate: db_1.tasks.startDate, dueDate: db_1.tasks.dueDate })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        const assignees = await this.db
            .select({ userId: db_1.taskAssignees.userId })
            .from(db_1.taskAssignees)
            .where((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, taskId));
        const assigneeIds = assignees.map((a) => a.userId);
        const payload = await this.snapshotTask(taskId);
        const now = new Date();
        const labelIds = await this.resolveLabelIds(workspaceId, payload.labels, actor.id);
        const task = await this.tasksService.createTask({
            listId: ctx.listId,
            title: `${payload.title || 'Task'} (copy)`,
            description: payload.description ?? undefined,
            priority: payload.priority,
            timeEstimate: payload.timeEstimate ?? undefined,
            startDate: src?.startDate ?? undefined,
            dueDate: src?.dueDate ?? undefined,
            labelIds: labelIds.length ? labelIds : undefined,
            assigneeIds: assigneeIds.length ? assigneeIds : undefined,
            createdById: actor.id,
        });
        if (!task)
            throw new Error('Task creation returned no row');
        await this.materialiseChecklists(task.id, payload.checklists);
        await this.materialiseCustomFieldValues(task.id, ctx.projectId, payload.customFieldValues);
        await this.materialiseSubtasks(ctx.listId, task.id, payload.subtasks, actor.id, now);
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'task.duplicated',
            resourceType: 'task',
            resourceId: task.id,
            description: 'Duplicated a task',
            metadata: { sourceTaskId: taskId },
        });
        return { taskId: task.id, task };
    }
    // ----------------------------------------------------------- helpers
    async requireTemplate(workspaceId, id) {
        const [row] = await this.db
            .select()
            .from(db_1.taskTemplates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTemplates.id, id), (0, drizzle_orm_1.eq)(db_1.taskTemplates.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Template not found');
        return row;
    }
    async snapshotTask(taskId) {
        const [task] = await this.db
            .select()
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        const now = new Date();
        const labelRows = await this.db
            .select({ name: db_1.labels.name })
            .from(db_1.taskLabelAssignments)
            .innerJoin(db_1.labels, (0, drizzle_orm_1.eq)(db_1.labels.id, db_1.taskLabelAssignments.labelId))
            .where((0, drizzle_orm_1.eq)(db_1.taskLabelAssignments.taskId, taskId));
        const checklistRows = await this.db
            .select()
            .from(db_1.taskChecklists)
            .where((0, drizzle_orm_1.eq)(db_1.taskChecklists.taskId, taskId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.taskChecklists.position));
        const checklistItems = checklistRows.length
            ? await this.db
                .select()
                .from(db_1.taskChecklistItems)
                .where((0, drizzle_orm_1.inArray)(db_1.taskChecklistItems.checklistId, checklistRows.map((c) => c.id)))
                .orderBy((0, drizzle_orm_1.asc)(db_1.taskChecklistItems.position))
            : [];
        const itemsByChecklist = new Map();
        for (const item of checklistItems) {
            const list = itemsByChecklist.get(item.checklistId) ?? [];
            list.push(item);
            itemsByChecklist.set(item.checklistId, list);
        }
        const subtaskRows = await this.db
            .select()
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.parentTaskId, taskId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.position));
        const valueRows = await this.db
            .select({
            name: db_1.customFieldDefinitions.name,
            type: db_1.customFieldDefinitions.type,
            value: db_1.customFieldValues.value,
        })
            .from(db_1.customFieldValues)
            .innerJoin(db_1.customFieldDefinitions, (0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.id, db_1.customFieldValues.fieldId))
            .where((0, drizzle_orm_1.eq)(db_1.customFieldValues.taskId, taskId));
        return {
            title: task.title,
            description: task.description,
            priority: task.priority,
            timeEstimate: task.timeEstimate ?? null,
            startDateOffsetDays: dateToOffsetDays(now, task.startDate),
            dueDateOffsetDays: dateToOffsetDays(now, task.dueDate),
            labels: labelRows.map((l) => l.name),
            checklists: checklistRows.map((c) => ({
                title: c.title,
                items: (itemsByChecklist.get(c.id) ?? []).map((i) => ({ content: i.content })),
            })),
            subtasks: subtaskRows.map((s) => ({
                title: s.title,
                description: s.description,
                priority: s.priority,
                timeEstimate: s.timeEstimate ?? null,
                dueDateOffsetDays: dateToOffsetDays(now, s.dueDate),
            })),
            customFieldValues: valueRows
                .filter((r) => r.value && r.value.v !== null && r.value.v !== undefined)
                .map((r) => ({ fieldName: r.name, value: r.value.v ?? null })),
        };
    }
    async resolveLabelIds(workspaceId, names, _creatorId) {
        if (!names?.length)
            return [];
        const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
        if (unique.length === 0)
            return [];
        const existing = await this.db
            .select({ id: db_1.labels.id, name: db_1.labels.name })
            .from(db_1.labels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.labels.name, unique)));
        const existingByName = new Map(existing.map((l) => [l.name, l.id]));
        const missing = unique.filter((n) => !existingByName.has(n));
        if (missing.length) {
            const created = await this.db
                .insert(db_1.labels)
                .values(missing.map((name) => ({ workspaceId, name, color: '#94a3b8' })))
                .returning({ id: db_1.labels.id, name: db_1.labels.name });
            for (const l of created)
                existingByName.set(l.name, l.id);
        }
        return unique
            .map((n) => existingByName.get(n))
            .filter((id) => !!id);
    }
    async materialiseChecklists(taskId, checklists) {
        if (!checklists?.length)
            return;
        for (let i = 0; i < checklists.length; i++) {
            const cl = checklists[i];
            const [row] = await this.db
                .insert(db_1.taskChecklists)
                .values({ taskId, title: cl.title || `Checklist ${i + 1}`, position: i })
                .returning();
            if (!row || !cl.items?.length)
                continue;
            await this.db.insert(db_1.taskChecklistItems).values(cl.items.map((it, idx) => ({
                checklistId: row.id,
                content: it.content,
                position: idx,
            })));
        }
    }
    async materialiseCustomFieldValues(taskId, projectId, values) {
        if (!values?.length)
            return;
        const defs = await this.db
            .select({ id: db_1.customFieldDefinitions.id, name: db_1.customFieldDefinitions.name })
            .from(db_1.customFieldDefinitions)
            .where((0, drizzle_orm_1.eq)(db_1.customFieldDefinitions.projectId, projectId));
        const byName = new Map(defs.map((d) => [d.name, d.id]));
        const rows = values
            .map((v) => {
            const fieldId = byName.get(v.fieldName);
            if (!fieldId)
                return null;
            return { taskId, fieldId, value: { v: v.value ?? null } };
        })
            .filter((r) => !!r);
        if (rows.length === 0)
            return;
        await this.db.insert(db_1.customFieldValues).values(rows);
    }
    async materialiseSubtasks(listId, parentTaskId, subtasks, actorId, now) {
        if (!subtasks?.length)
            return;
        for (const st of subtasks) {
            await this.tasksService.createTask({
                listId,
                parentTaskId,
                title: st.title,
                description: st.description ?? undefined,
                priority: st.priority,
                timeEstimate: st.timeEstimate ?? undefined,
                dueDate: offsetToDate(now, st.dueDateOffsetDays) ?? undefined,
                createdById: actorId,
            });
        }
    }
    async resolveTaskContext(taskId) {
        const [row] = await this.db
            .select({
            workspaceId: db_1.spaces.workspaceId,
            spaceId: db_1.spaces.id,
            projectId: db_1.lists.projectId,
            listId: db_1.tasks.listId,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        return row ?? null;
    }
    async resolveListContext(listId) {
        const [row] = await this.db
            .select({
            workspaceId: db_1.spaces.workspaceId,
            projectId: db_1.lists.projectId,
        })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        return row ?? null;
    }
    // -------------------------------------------------------- validation
    normaliseName(raw) {
        // Non-string names (number/object/array) threw on `.trim()` → 500; coerce to
        // '' so the "Name is required" 400 fires instead.
        const trimmed = (typeof raw === 'string' ? raw : '').trim();
        if (!trimmed)
            throw new common_1.BadRequestException('Name is required');
        if (trimmed.length > NAME_MAX) {
            throw new common_1.BadRequestException(`Name must be ${NAME_MAX} characters or fewer`);
        }
        return trimmed;
    }
    normaliseDescription(raw) {
        if (raw === null || raw === undefined)
            return null;
        const trimmed = String(raw).trim();
        if (!trimmed)
            return null;
        if (trimmed.length > DESCRIPTION_MAX) {
            throw new common_1.BadRequestException(`Description must be ${DESCRIPTION_MAX} characters or fewer`);
        }
        return trimmed;
    }
    /**
     * Defence-in-depth shaping for `payload`. We accept JSON from the
     * client so this drops unknown keys, clamps array lengths, coerces
     * priority/numbers, and forbids nested subtasks (the schema supports
     * only one level).
     */
    normalisePayload(raw) {
        const priority = clampPriority(raw.priority);
        return {
            title: String(raw.title ?? '').slice(0, 500),
            description: raw.description == null
                ? null
                : String(raw.description).slice(0, 10_000),
            priority,
            timeEstimate: clampNumber(raw.timeEstimate, 0),
            startDateOffsetDays: clampNumber(raw.startDateOffsetDays, -3650, 3650),
            dueDateOffsetDays: clampNumber(raw.dueDateOffsetDays, -3650, 3650),
            labels: (raw.labels ?? [])
                .filter((s) => typeof s === 'string')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, MAX_LABELS),
            checklists: (raw.checklists ?? [])
                .slice(0, MAX_CHECKLISTS)
                .map((c) => ({
                title: String(c?.title ?? '').slice(0, 200),
                items: (c?.items ?? [])
                    .filter((i) => i && typeof i.content === 'string')
                    .slice(0, MAX_CHECKLIST_ITEMS)
                    .map((i) => ({ content: String(i.content).slice(0, 500) })),
            })),
            subtasks: (raw.subtasks ?? [])
                .slice(0, MAX_SUBTASKS)
                .map((s) => ({
                title: String(s?.title ?? '').slice(0, 500),
                description: s?.description == null ? null : String(s.description).slice(0, 10_000),
                priority: clampPriority(s?.priority),
                timeEstimate: clampNumber(s?.timeEstimate, 0),
                dueDateOffsetDays: clampNumber(s?.dueDateOffsetDays, -3650, 3650),
            })),
            customFieldValues: (raw.customFieldValues ?? [])
                .filter((v) => v && typeof v.fieldName === 'string')
                .slice(0, MAX_CUSTOM_FIELDS)
                .map((v) => ({
                fieldName: String(v.fieldName).slice(0, 200),
                value: typeof v.value === 'string' ||
                    typeof v.value === 'number' ||
                    typeof v.value === 'boolean'
                    ? v.value
                    : null,
            })),
        };
    }
    toView(row) {
        return {
            id: row.id,
            workspaceId: row.workspaceId,
            name: row.name,
            description: row.description,
            icon: row.icon,
            payload: row.payload,
            usageCount: row.usageCount,
            createdById: row.createdById,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
};
exports.TaskTemplatesService = TaskTemplatesService;
exports.TaskTemplatesService = TaskTemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, tasks_service_1.TasksService,
        security_service_1.SecurityService])
], TaskTemplatesService);
function clampPriority(value) {
    return value === 'urgent' || value === 'high' || value === 'normal' || value === 'low'
        ? value
        : 'normal';
}
function clampNumber(value, min, max) {
    if (value === null || value === undefined)
        return null;
    const n = Number(value);
    if (!Number.isFinite(n))
        return null;
    if (n < min)
        return min;
    if (max !== undefined && n > max)
        return max;
    return Math.round(n);
}
function offsetToDate(base, offsetDays) {
    if (offsetDays === null || offsetDays === undefined)
        return null;
    const d = new Date(base);
    d.setDate(d.getDate() + offsetDays);
    return d;
}
function dateToOffsetDays(now, value) {
    if (!value)
        return null;
    const ms = value.getTime() - now.getTime();
    if (!Number.isFinite(ms))
        return null;
    return Math.round(ms / (24 * 60 * 60 * 1000));
}
//# sourceMappingURL=task-templates.service.js.map