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
exports.FormsService = exports.MAX_FORM_UPLOAD_BYTES = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const origin_1 = require("../../common/task-types/origin");
const r2_service_1 = require("../../common/storage/r2.service");
const webhooks_service_1 = require("../webhooks/webhooks.service");
/** Hard cap on a single form-upload file (public intake). */
exports.MAX_FORM_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .slice(0, 50) || 'form';
}
async function uniqueSlug(db, base) {
    let candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    let tries = 0;
    while (tries < 10) {
        const [hit] = await db.select({ id: db_1.forms.id }).from(db_1.forms).where((0, drizzle_orm_1.eq)(db_1.forms.slug, candidate)).limit(1);
        if (!hit)
            return candidate;
        candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
        tries++;
    }
    throw new common_1.BadRequestException('Could not generate a unique form slug');
}
let FormsService = class FormsService {
    constructor(db, r2, webhooks) {
        this.db = db;
        this.r2 = r2;
        this.webhooks = webhooks;
        this.routingMetaKey = '__routingMeta';
        this.maxRoutingHistory = 10;
        this.legacyRoutingMetaKey = '__routingMetaLegacy';
    }
    /**
     * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
     * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
     * a downed webhook can never break a (public) form submission.
     */
    async fireWebhook(workspaceId, event, payload) {
        try {
            await this.webhooks.fire(workspaceId, event, payload);
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[webhooks.fire] ${event} failed:`, e);
        }
    }
    toSubmissionDataRecord(raw) {
        if (!raw || typeof raw !== 'object')
            return {};
        return raw;
    }
    extractRetryMeta(raw) {
        const data = this.toSubmissionDataRecord(raw);
        const meta = data[this.routingMetaKey];
        if (meta && typeof meta === 'object') {
            const envelope = meta;
            if (envelope.latest && typeof envelope.latest === 'object') {
                const candidate = envelope.latest;
                if ((candidate.status === 'ok' || candidate.status === 'error') && typeof candidate.message === 'string' && typeof candidate.at === 'string') {
                    return { status: candidate.status, message: candidate.message, at: candidate.at };
                }
            }
        }
        const legacy = data[this.legacyRoutingMetaKey];
        if (legacy && typeof legacy === 'object') {
            const candidate = legacy;
            if ((candidate.status === 'ok' || candidate.status === 'error') && typeof candidate.message === 'string' && typeof candidate.at === 'string') {
                return { status: candidate.status, message: candidate.message, at: candidate.at };
            }
        }
        return undefined;
    }
    extractRetryHistory(raw) {
        const data = this.toSubmissionDataRecord(raw);
        const meta = data[this.routingMetaKey];
        if (!meta || typeof meta !== 'object')
            return [];
        const envelope = meta;
        if (!Array.isArray(envelope.history))
            return [];
        return envelope.history
            .map((item) => {
            if (!item || typeof item !== 'object')
                return undefined;
            const entry = item;
            if ((entry.status !== 'ok' && entry.status !== 'error') || typeof entry.message !== 'string' || typeof entry.at !== 'string')
                return undefined;
            return { status: entry.status, message: entry.message, at: entry.at };
        })
            .filter((item) => Boolean(item));
    }
    withRetryMeta(data, meta) {
        const next = { ...data };
        const current = this.extractRetryHistory(next);
        const history = [meta, ...current].slice(0, this.maxRoutingHistory);
        next[this.routingMetaKey] = { latest: meta, history };
        return next;
    }
    stripInternalDataKeys(data) {
        const next = { ...data };
        delete next[this.routingMetaKey];
        delete next[this.legacyRoutingMetaKey];
        return next;
    }
    async createTaskForSubmission(formWithFields, data, submitterEmail, submitterName) {
        // Task routing can be configured two ways: a form-level default target list,
        // or a field mapped to `targetListId` (the routing dropdown). Only bail early
        // when NEITHER exists — otherwise a field-routed form (the common case, since
        // the builder exposes routing via the field mapping) would never create a task.
        const hasRoutingField = formWithFields.fields.some((field) => field.taskField === 'targetListId');
        if (!formWithFields.targetListId && !hasRoutingField)
            return undefined;
        let taskTitle = `Form submission: ${formWithFields.title}`;
        let taskDescription = '';
        let targetListId = formWithFields.targetListId;
        let mappedPriority;
        let mappedDueDate;
        let mappedAssigneeEmail;
        const lines = [];
        for (const field of formWithFields.fields) {
            const visible = this.isFieldVisible(field, data);
            if (!visible)
                continue;
            const value = data[field.id];
            if (value === undefined)
                continue;
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            if (field.taskField === 'title' && typeof value === 'string') {
                taskTitle = value;
            }
            else if (field.taskField === 'description' && typeof value === 'string') {
                taskDescription = value;
            }
            else if (field.taskField === 'priority' && typeof value === 'string') {
                mappedPriority = this.toTaskPriority(value) ?? mappedPriority;
            }
            else if (field.taskField === 'dueDate' && typeof value === 'string') {
                if (!Number.isNaN(Date.parse(value)))
                    mappedDueDate = new Date(value);
            }
            else if (field.taskField === 'assigneeEmail' && typeof value === 'string') {
                const normalized = value.trim().toLowerCase();
                if (normalized)
                    mappedAssigneeEmail = normalized;
            }
            else if (field.taskField === 'targetListId') {
                const candidates = Array.isArray(value) ? value : [value];
                const selectedTarget = candidates
                    .filter((entry) => typeof entry === 'string')
                    .map((entry) => this.extractTargetListId(entry))
                    .find((entry) => Boolean(entry));
                if (!selectedTarget) {
                    throw new common_1.BadRequestException(`Field "${field.label}" must route to a valid list target`);
                }
                targetListId = this.normalizeTargetListValue(selectedTarget);
            }
            else {
                lines.push(`**${field.label}:** ${displayValue}`);
            }
        }
        if (lines.length > 0) {
            taskDescription += (taskDescription ? '\n\n---\n' : '') + lines.join('\n');
        }
        if (submitterEmail) {
            taskDescription += `\n\n---\n**Submitted by:** ${submitterName || 'Unknown'} (${submitterEmail})`;
        }
        if (!targetListId) {
            // A routing field was present but the submitter picked no target and the
            // form has no default list — store the submission without a task rather
            // than recording a spurious routing error.
            return undefined;
        }
        const [targetList] = await this.db
            .select({ id: db_1.lists.id, workspaceId: db_1.spaces.workspaceId })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, targetListId))
            .limit(1);
        if (!targetList || targetList.workspaceId !== formWithFields.workspaceId) {
            throw new common_1.BadRequestException('Selected routing list is invalid for this workspace');
        }
        const [newTask] = await this.db
            .insert(db_1.tasks)
            .values({
            listId: targetList.id,
            title: taskTitle,
            description: taskDescription || null,
            priority: mappedPriority ?? 'normal',
            dueDate: mappedDueDate ?? null,
            /*
             * §V2-04 — say on the task that a form made it.
             *
             * `[03:26]` names FORM RESPONSE as one of the task types. Rundesk has
             * created tasks from submissions since forms shipped, and the only
             * trace was the title reading "Form submission: …" — invisible to the
             * type filter and to anyone scanning a list.
             *
             * Null when the workspace has deleted the type: a submission must never
             * fail over a missing label.
             */
            taskTypeId: await (0, origin_1.taskTypeIdForOrigin)(this.db, targetList.workspaceId, 'form'),
        })
            .returning();
        if (mappedAssigneeEmail) {
            const [candidate] = await this.db
                .select({ userId: db_1.users.id })
                .from(db_1.users)
                .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, db_1.users.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.users.email, mappedAssigneeEmail), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, formWithFields.workspaceId)))
                .limit(1);
            if (candidate) {
                await this.db.insert(db_1.taskAssignees).values({ taskId: newTask.id, userId: candidate.userId }).onConflictDoNothing();
            }
        }
        return newTask.id;
    }
    toTaskPriority(value) {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'urgent' || normalized === 'high' || normalized === 'normal' || normalized === 'low') {
            return normalized;
        }
        return undefined;
    }
    normalizeTargetListValue(value) {
        return value.startsWith('list:') ? value.slice('list:'.length) : value;
    }
    extractTargetListId(value) {
        const normalized = value.trim();
        if (!normalized)
            return undefined;
        if (normalized.startsWith('list:')) {
            const listId = normalized.slice('list:'.length).trim();
            return listId || undefined;
        }
        return normalized;
    }
    unpackFieldOptions(options) {
        if (!options)
            return { choices: [], visibilityMode: 'all', visibilityRules: [] };
        if (Array.isArray(options)) {
            return { choices: options, visibilityMode: 'all', visibilityRules: [] };
        }
        const payload = options;
        return {
            choices: payload.choices ?? [],
            visibilityMode: payload.visibilityMode === 'any' ? 'any' : 'all',
            visibilityRules: payload.visibilityRules ?? [],
        };
    }
    packFieldOptions(choices, visibilityMode, visibilityRules) {
        const cleanChoices = (choices ?? []).filter((c) => c?.value);
        const cleanRules = (visibilityRules ?? [])
            .filter((r) => r?.fieldId &&
            r?.value &&
            (r.operator === 'equals' || r.operator === 'not_equals' || r.operator === 'contains' || r.operator === 'not_contains'));
        if (cleanRules.length === 0)
            return cleanChoices.length > 0 ? cleanChoices : null;
        return { choices: cleanChoices, visibilityMode: visibilityMode === 'any' ? 'any' : 'all', visibilityRules: cleanRules };
    }
    isFieldVisible(field, data) {
        const unpacked = this.unpackFieldOptions(field.options);
        const visibilityRules = field.visibilityRules ?? unpacked.visibilityRules;
        const visibilityMode = field.visibilityMode ?? unpacked.visibilityMode;
        if (visibilityRules.length === 0)
            return true;
        const matcher = visibilityMode === 'any' ? 'some' : 'every';
        return visibilityRules[matcher]((rule) => {
            const source = data[rule.fieldId];
            const asText = Array.isArray(source) ? source.join(',') : source ?? '';
            const asArray = Array.isArray(source) ? source : typeof source === 'string' && source ? source.split(',') : [];
            if (rule.operator === 'equals')
                return asText === rule.value;
            if (rule.operator === 'not_equals')
                return asText !== rule.value;
            if (rule.operator === 'contains')
                return asArray.includes(rule.value) || asText.includes(rule.value);
            return !asArray.includes(rule.value) && !asText.includes(rule.value);
        });
    }
    // ─── List forms in a workspace ────────────────────────────────────────────
    /**
     * A1.10 / A5.4 — every row carries where its submissions land. A form that
     * feeds a list was invisible from both ends: the card didn't name the list,
     * and the list had no idea a form was filling it. `targetListId` narrows to
     * the forms feeding one list, which is what the list header asks for.
     *
     * A5.2 — the hub also needs the owner, so "My forms" is a filter rather than
     * a guess and the index can name who to ask about a form.
     */
    async listForms(workspaceId, includeArchived = false, targetListId) {
        const rows = await this.db
            .select({
            id: db_1.forms.id,
            title: db_1.forms.title,
            description: db_1.forms.description,
            slug: db_1.forms.slug,
            isPublic: db_1.forms.isPublic,
            isEnabled: db_1.forms.isEnabled,
            isArchived: db_1.forms.isArchived,
            createdAt: db_1.forms.createdAt,
            updatedAt: db_1.forms.updatedAt,
            createdById: db_1.forms.createdById,
            createdByName: db_1.users.displayName,
            createdByEmail: db_1.users.email,
            targetListId: db_1.forms.targetListId,
            targetListName: db_1.lists.name,
            targetProjectId: db_1.projects.id,
            targetSpaceId: db_1.spaces.id,
            // Correlate on outer `forms.id` in SQL text — `${forms.id}` here binds as a single
            // parameter and breaks per-row counts in PostgreSQL.
            submissionCount: (0, drizzle_orm_1.sql) `(
          select count(*)::int from form_submissions fs where fs.form_id = forms.id
        )`,
        })
            .from(db_1.forms)
            // Left joins: a form without a destination list is legal and still lists.
            .leftJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.forms.targetListId))
            .leftJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .leftJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            // Also left: the creator may have been removed (createdById is set null).
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.forms.createdById))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.forms.workspaceId, workspaceId), includeArchived ? undefined : (0, drizzle_orm_1.eq)(db_1.forms.isArchived, false), targetListId ? (0, drizzle_orm_1.eq)(db_1.forms.targetListId, targetListId) : undefined))
            .orderBy((0, drizzle_orm_1.desc)(db_1.forms.createdAt));
        return rows;
    }
    // ─── Get a single form with all fields ────────────────────────────────────
    async getForm(formId) {
        const [form] = await this.db.select().from(db_1.forms).where((0, drizzle_orm_1.eq)(db_1.forms.id, formId));
        if (!form)
            throw new common_1.NotFoundException('Form not found');
        const fields = await this.db
            .select()
            .from(db_1.formFields)
            .where((0, drizzle_orm_1.eq)(db_1.formFields.formId, formId))
            .orderBy(db_1.formFields.position);
        return {
            ...form,
            fields: fields.map((field) => {
                const unpacked = this.unpackFieldOptions(field.options);
                return {
                    ...field,
                    options: unpacked.choices,
                    visibilityMode: unpacked.visibilityMode,
                    visibilityRules: unpacked.visibilityRules,
                };
            }),
        };
    }
    // ─── Get form by slug (for public submission page) ─────────────────────────
    async getFormBySlug(slug) {
        const [form] = await this.db.select().from(db_1.forms).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.forms.slug, slug), (0, drizzle_orm_1.eq)(db_1.forms.isArchived, false)));
        if (!form)
            throw new common_1.NotFoundException('Form not found');
        if (!form.isEnabled)
            throw new common_1.ForbiddenException('This form is currently disabled');
        // The "Public form (no login required)" toggle must actually gate anonymous
        // access — this slug route is the only (unauthenticated) way to view/submit,
        // so a non-public form has to be refused here.
        if (!form.isPublic)
            throw new common_1.ForbiddenException('This form is not publicly accessible');
        return this.attachFields(form);
    }
    /**
     * Load a form's fields (options unpacked). No enabled/public gating — used by
     * getFormBySlug after its public checks, and by authenticated callers (routing
     * retry) that already hold an authorized form row.
     */
    async attachFields(form) {
        const fields = await this.db
            .select()
            .from(db_1.formFields)
            .where((0, drizzle_orm_1.eq)(db_1.formFields.formId, form.id))
            .orderBy(db_1.formFields.position);
        return {
            ...form,
            fields: fields.map((field) => {
                const unpacked = this.unpackFieldOptions(field.options);
                return {
                    ...field,
                    options: unpacked.choices,
                    visibilityMode: unpacked.visibilityMode,
                    visibilityRules: unpacked.visibilityRules,
                };
            }),
        };
    }
    // ─── Public file uploads (form intake) ─────────────────────────────────────
    sanitizeFileName(input) {
        return (input || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
    }
    /** Object-key prefix owning a form's uploaded files. */
    formUploadPrefix(formId) {
        return `forms/${formId}/uploads/`;
    }
    /**
     * Presign a direct-to-R2 upload for a public form file field. Scoped to the
     * form (which must be live + have a file field) and size-capped. No auth —
     * public intake forms accept anonymous submissions by design.
     */
    async createUploadUrl(slug, body) {
        const form = await this.getFormBySlug(slug); // throws if missing / archived / disabled
        if (!form.fields.some((f) => f.type === 'file')) {
            throw new common_1.BadRequestException('This form does not accept file uploads');
        }
        if (!this.r2.configured)
            throw new common_1.BadRequestException('File storage is not configured');
        if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > exports.MAX_FORM_UPLOAD_BYTES) {
            throw new common_1.BadRequestException(`File exceeds the ${Math.round(exports.MAX_FORM_UPLOAD_BYTES / (1024 * 1024))} MB limit`);
        }
        const fileName = this.sanitizeFileName(body.fileName);
        const key = `${this.formUploadPrefix(form.id)}${Date.now()}-${fileName}`;
        const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'application/octet-stream', {
            formid: form.id,
        });
        return { uploadUrl, storageKey: key, fileName };
    }
    /**
     * A short-lived signed download URL for a file a submitter uploaded. Only a
     * member of the form's workspace may resolve it; the stored value must be a
     * key owned by this form (guards against tampered/foreign keys).
     */
    async getSubmissionFileUrl(formId, submissionId, fieldId, actorId) {
        const [form] = await this.db.select().from(db_1.forms).where((0, drizzle_orm_1.eq)(db_1.forms.id, formId)).limit(1);
        if (!form)
            throw new common_1.NotFoundException('Form not found');
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, form.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actorId)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace membership required');
        const [submission] = await this.db
            .select()
            .from(db_1.formSubmissions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submissionId), (0, drizzle_orm_1.eq)(db_1.formSubmissions.formId, formId)))
            .limit(1);
        if (!submission)
            throw new common_1.NotFoundException('Submission not found');
        const data = this.toSubmissionDataRecord(submission.data);
        const value = data[fieldId];
        const key = typeof value === 'string' ? value : null;
        if (!key || !key.startsWith(this.formUploadPrefix(formId))) {
            throw new common_1.NotFoundException('No file for that field');
        }
        if (!this.r2.configured)
            throw new common_1.BadRequestException('File storage is not configured');
        const url = await this.r2.getObjectUrl(key);
        return { url, fileName: key.split('/').pop() ?? 'file' };
    }
    // ─── Create form ──────────────────────────────────────────────────────────
    async createForm(workspaceId, userId, dto) {
        const slug = await uniqueSlug(this.db, slugify(dto.title));
        const [form] = await this.db
            .insert(db_1.forms)
            .values({
            workspaceId,
            createdById: userId,
            title: dto.title,
            description: dto.description,
            targetListId: dto.targetListId,
            isPublic: dto.isPublic ?? true,
            confirmationMsg: dto.confirmationMsg,
            slug,
        })
            .returning();
        return form;
    }
    // ─── Update form ──────────────────────────────────────────────────────────
    async updateForm(formId, patch) {
        // Whitelist updatable columns (never spread the untyped body): keeps stray/
        // wrong-typed fields off the row — targetListId: true 500'd the UUID column.
        // targetListId is a UUID column — a non-string/non-null value (e.g. true)
        // would 500 the DB, so reject it up front.
        if (patch.targetListId !== undefined && patch.targetListId !== null && typeof patch.targetListId !== 'string') {
            throw new common_1.BadRequestException('targetListId must be a string or null');
        }
        const set = { updatedAt: new Date() };
        for (const key of ['title', 'description', 'targetListId', 'isPublic', 'isEnabled', 'confirmationMsg', 'coverImageUrl']) {
            if (patch[key] !== undefined)
                set[key] = patch[key];
        }
        const [form] = await this.db
            .update(db_1.forms)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.forms.id, formId))
            .returning();
        if (!form)
            throw new common_1.NotFoundException('Form not found');
        return form;
    }
    // ─── Archive / delete form ────────────────────────────────────────────────
    async archiveForm(formId) {
        await this.db.update(db_1.forms).set({ isArchived: true, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.forms.id, formId));
        return { ok: true };
    }
    async deleteForm(formId) {
        await this.db.delete(db_1.forms).where((0, drizzle_orm_1.eq)(db_1.forms.id, formId));
        return { ok: true };
    }
    // ─── Duplicate form ───────────────────────────────────────────────────────
    async duplicateForm(formId, userId) {
        const { fields: origFields, ...orig } = await this.getForm(formId);
        const slug = await uniqueSlug(this.db, slugify(orig.title + '-copy'));
        const [newForm] = await this.db
            .insert(db_1.forms)
            .values({
            workspaceId: orig.workspaceId,
            createdById: userId,
            title: orig.title + ' (copy)',
            description: orig.description ?? undefined,
            targetListId: orig.targetListId ?? undefined,
            isPublic: orig.isPublic,
            confirmationMsg: orig.confirmationMsg ?? undefined,
            slug,
        })
            .returning();
        if (origFields.length) {
            await this.db.insert(db_1.formFields).values(origFields.map((f) => ({
                formId: newForm.id,
                type: f.type,
                label: f.label,
                placeholder: f.placeholder ?? undefined,
                helpText: f.helpText ?? undefined,
                isRequired: f.isRequired,
                position: f.position,
                options: this.packFieldOptions(f.options, f.visibilityMode, f.visibilityRules) ?? undefined,
                taskField: f.taskField ?? undefined,
            })));
        }
        return this.getForm(newForm.id);
    }
    // ─── Fields CRUD ──────────────────────────────────────────────────────────
    async addField(formId, dto) {
        const [maxPos] = await this.db
            .select({ max: (0, drizzle_orm_1.sql) `coalesce(max(position), -1)` })
            .from(db_1.formFields)
            .where((0, drizzle_orm_1.eq)(db_1.formFields.formId, formId));
        const position = dto.position ?? (maxPos.max + 1);
        const [field] = await this.db
            .insert(db_1.formFields)
            .values({
            formId,
            type: dto.type,
            label: dto.label,
            placeholder: dto.placeholder,
            helpText: dto.helpText,
            isRequired: dto.isRequired,
            position,
            taskField: dto.taskField,
            options: this.packFieldOptions(dto.options, dto.visibilityMode, dto.visibilityRules),
        })
            .returning();
        const unpacked = this.unpackFieldOptions(field.options);
        return { ...field, options: unpacked.choices, visibilityMode: unpacked.visibilityMode, visibilityRules: unpacked.visibilityRules };
    }
    async updateField(fieldId, patch) {
        const next = { ...patch };
        if ('options' in patch || 'visibilityRules' in patch || 'visibilityMode' in patch) {
            const [existing] = await this.db.select().from(db_1.formFields).where((0, drizzle_orm_1.eq)(db_1.formFields.id, fieldId)).limit(1);
            if (!existing)
                throw new common_1.NotFoundException('Field not found');
            const current = this.unpackFieldOptions(existing.options);
            next.options = this.packFieldOptions('options' in patch ? patch.options : current.choices, 'visibilityMode' in patch ? patch.visibilityMode : current.visibilityMode, 'visibilityRules' in patch ? patch.visibilityRules : current.visibilityRules);
            delete next.visibilityRules;
            delete next.visibilityMode;
        }
        const [field] = await this.db.update(db_1.formFields).set(next).where((0, drizzle_orm_1.eq)(db_1.formFields.id, fieldId)).returning();
        if (!field)
            throw new common_1.NotFoundException('Field not found');
        const unpacked = this.unpackFieldOptions(field.options);
        return { ...field, options: unpacked.choices, visibilityMode: unpacked.visibilityMode, visibilityRules: unpacked.visibilityRules };
    }
    async deleteField(fieldId) {
        await this.db.delete(db_1.formFields).where((0, drizzle_orm_1.eq)(db_1.formFields.id, fieldId));
        return { ok: true };
    }
    async reorderFields(formId, orderedIds) {
        await Promise.all(orderedIds.map((id, index) => this.db.update(db_1.formFields).set({ position: index }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.formFields.id, id), (0, drizzle_orm_1.eq)(db_1.formFields.formId, formId)))));
        return { ok: true };
    }
    // ─── Submit a form ────────────────────────────────────────────────────────
    /**
     * A5.5 — `honeypot` is a field no human ever sees (the public renderer hides
     * it and never focuses it); a bot that fills every input trips it. The reply
     * is the ordinary confirmation so the scraper learns nothing, but nothing is
     * written and no task is routed. Volume abuse is handled separately by the
     * per-IP rate limit on the public controller.
     */
    async submitForm(slug, data, submitterEmail, submitterName, honeypot) {
        const formWithFields = await this.getFormBySlug(slug);
        if (typeof honeypot === 'string' && honeypot.trim() !== '') {
            return {
                ok: true,
                submissionId: null,
                createdTaskId: null,
                confirmationMsg: formWithFields.confirmationMsg,
            };
        }
        // Guard the (public, unauthenticated) payload so malformed input yields a
        // clean 400 from the validation below rather than a 500 on `data[...]`.
        if (data !== undefined && data !== null && (typeof data !== 'object' || Array.isArray(data))) {
            throw new common_1.BadRequestException('data must be an object mapping field id -> value');
        }
        data = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
        // Validate required fields and basic field-shape constraints.
        for (const field of formWithFields.fields) {
            const value = data[field.id];
            const visible = this.isFieldVisible(field, data);
            if (!visible)
                continue;
            if (field.isRequired && (value === undefined || value === '')) {
                throw new common_1.BadRequestException(`Field "${field.label}" is required`);
            }
            if (value === undefined || value === '')
                continue;
            if (field.type === 'email' && typeof value === 'string') {
                const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                if (!emailLike)
                    throw new common_1.BadRequestException(`Field "${field.label}" must be a valid email`);
            }
            if (field.type === 'number' && typeof value === 'string') {
                if (Number.isNaN(Number(value)))
                    throw new common_1.BadRequestException(`Field "${field.label}" must be numeric`);
            }
            if (field.type === 'date' && typeof value === 'string') {
                if (Number.isNaN(Date.parse(value)))
                    throw new common_1.BadRequestException(`Field "${field.label}" must be a valid date`);
            }
            // A file field stores the R2 object key produced by createUploadUrl. Only
            // accept a key owned by this form so a submitter can't point the answer at
            // an arbitrary/foreign object.
            if (field.type === 'file') {
                if (typeof value !== 'string' || !value.startsWith(this.formUploadPrefix(formWithFields.id))) {
                    throw new common_1.BadRequestException(`Field "${field.label}" must be an uploaded file`);
                }
            }
            const unpacked = this.unpackFieldOptions(field.options);
            if ((field.type === 'dropdown' || field.type === 'multi_select') && unpacked.choices.length) {
                const allowed = new Set(unpacked.choices.map((option) => option.value));
                if (Array.isArray(value)) {
                    for (const v of value) {
                        if (!allowed.has(v)) {
                            throw new common_1.BadRequestException(`Field "${field.label}" has an invalid option`);
                        }
                    }
                }
                else if (!allowed.has(value)) {
                    throw new common_1.BadRequestException(`Field "${field.label}" has an invalid option`);
                }
            }
        }
        const payload = { ...data };
        const [submission] = await this.db
            .insert(db_1.formSubmissions)
            .values({
            formId: formWithFields.id,
            createdTaskId: null,
            submitterEmail,
            submitterName,
            data: payload,
        })
            .returning();
        let createdTaskId = null;
        try {
            const taskId = await this.createTaskForSubmission(formWithFields, payload, submitterEmail, submitterName);
            if (taskId) {
                createdTaskId = taskId;
                await this.db
                    .update(db_1.formSubmissions)
                    .set({ createdTaskId })
                    .where((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submission.id));
            }
        }
        catch (err) {
            const message = err instanceof common_1.BadRequestException
                ? err.message
                : err instanceof Error
                    ? err.message
                    : 'Could not create task from this submission';
            const patched = this.withRetryMeta(payload, {
                status: 'error',
                message,
                at: new Date().toISOString(),
            });
            await this.db
                .update(db_1.formSubmissions)
                .set({ data: patched })
                .where((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submission.id));
        }
        // Advertise the submission to webhooks (Plan §12.4). Best effort, and
        // fired after the row + any routed task are durable.
        void this.fireWebhook(formWithFields.workspaceId, 'form.submitted', {
            workspaceId: formWithFields.workspaceId,
            formId: formWithFields.id,
            submissionId: submission.id,
            createdTaskId,
        });
        return {
            ok: true,
            submissionId: submission.id,
            createdTaskId,
            confirmationMsg: formWithFields.confirmationMsg,
        };
    }
    // ─── List submissions ──────────────────────────────────────────────────────
    async listSubmissions(formId) {
        const rows = await this.db
            .select()
            .from(db_1.formSubmissions)
            .where((0, drizzle_orm_1.eq)(db_1.formSubmissions.formId, formId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.formSubmissions.submittedAt));
        return rows.map((row) => ({
            ...row,
            retryMeta: this.extractRetryMeta(row.data),
            retryHistory: this.extractRetryHistory(row.data),
            data: this.stripInternalDataKeys(this.toSubmissionDataRecord(row.data)),
        }));
    }
    async retrySubmissionRouting(formId, submissionId) {
        const [form] = await this.db.select().from(db_1.forms).where((0, drizzle_orm_1.eq)(db_1.forms.id, formId)).limit(1);
        if (!form)
            throw new common_1.NotFoundException('Form not found');
        const [submission] = await this.db
            .select()
            .from(db_1.formSubmissions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submissionId), (0, drizzle_orm_1.eq)(db_1.formSubmissions.formId, formId)))
            .limit(1);
        if (!submission)
            throw new common_1.NotFoundException('Submission not found');
        const formWithFields = await this.attachFields(form);
        const cleanData = this.stripInternalDataKeys(this.toSubmissionDataRecord(submission.data));
        try {
            const createdTaskId = await this.createTaskForSubmission(formWithFields, cleanData, submission.submitterEmail, submission.submitterName);
            if (!createdTaskId) {
                throw new common_1.BadRequestException('This form does not have task routing enabled');
            }
            await this.db
                .update(db_1.formSubmissions)
                .set({
                createdTaskId,
                data: this.withRetryMeta(cleanData, {
                    status: 'ok',
                    message: 'Routing retry succeeded',
                    at: new Date().toISOString(),
                }),
            })
                .where((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submission.id));
            return { ok: true, submissionId: submission.id, createdTaskId };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Routing retry failed';
            await this.db
                .update(db_1.formSubmissions)
                .set({
                data: this.withRetryMeta(cleanData, {
                    status: 'error',
                    message,
                    at: new Date().toISOString(),
                }),
            })
                .where((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submission.id));
            throw error;
        }
    }
    async clearSubmissionRetryHistory(formId, submissionId) {
        const [submission] = await this.db
            .select()
            .from(db_1.formSubmissions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submissionId), (0, drizzle_orm_1.eq)(db_1.formSubmissions.formId, formId)))
            .limit(1);
        if (!submission)
            throw new common_1.NotFoundException('Submission not found');
        const cleanData = this.stripInternalDataKeys(this.toSubmissionDataRecord(submission.data));
        await this.db
            .update(db_1.formSubmissions)
            .set({ data: cleanData })
            .where((0, drizzle_orm_1.eq)(db_1.formSubmissions.id, submission.id));
        return { ok: true, submissionId: submission.id };
    }
};
exports.FormsService = FormsService;
exports.FormsService = FormsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, r2_service_1.R2Service,
        webhooks_service_1.WebhooksService])
], FormsService);
//# sourceMappingURL=forms.service.js.map