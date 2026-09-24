import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, eq, desc, sql } from 'drizzle-orm'
import { forms, formFields, formSubmissions, tasks, lists, projects, spaces, users, workspaceMembers, taskAssignees } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { taskTypeIdForOrigin } from '../../common/task-types/origin'
import { R2Service } from '../../common/storage/r2.service'
import { safeFileName } from '../../common/storage/file-name'
import { WebhooksService } from '../webhooks/webhooks.service'
import { readableList } from '../../common/permissions/read-access'
import { assertCanCreateInSpace } from '../../common/permissions/container-access'
import { isUuid } from '../../common/validation/uuid'

/** Hard cap on a single form-upload file (public intake). */
export const MAX_FORM_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 50) || 'form'
}

async function uniqueSlug(db: Db, base: string): Promise<string> {
  let candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`
  let tries = 0
  while (tries < 10) {
    const [hit] = await db.select({ id: forms.id }).from(forms).where(eq(forms.slug, candidate)).limit(1)
    if (!hit) return candidate
    candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`
    tries++
  }
  throw new BadRequestException('Could not generate a unique form slug')
}

@Injectable()
export class FormsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private r2: R2Service,
    private webhooks: WebhooksService,
  ) {}

  /**
   * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
   * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
   * a downed webhook can never break a (public) form submission.
   */
  private async fireWebhook(workspaceId: string, event: string, payload: Record<string, unknown>) {
    try {
      await this.webhooks.fire(workspaceId, event, payload)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[webhooks.fire] ${event} failed:`, e)
    }
  }

  private readonly routingMetaKey = '__routingMeta'
  private readonly maxRoutingHistory = 10
  private readonly legacyRoutingMetaKey = '__routingMetaLegacy'

  private toSubmissionDataRecord(raw: unknown): Record<string, string | string[]> {
    if (!raw || typeof raw !== 'object') return {}
    return raw as Record<string, string | string[]>
  }

  private extractRetryMeta(raw: unknown): { status: 'ok' | 'error'; message: string; at: string } | undefined {
    const data = this.toSubmissionDataRecord(raw) as Record<string, unknown>
    const meta = data[this.routingMetaKey]
    if (meta && typeof meta === 'object') {
      const envelope = meta as { latest?: unknown }
      if (envelope.latest && typeof envelope.latest === 'object') {
        const candidate = envelope.latest as { status?: unknown; message?: unknown; at?: unknown }
        if ((candidate.status === 'ok' || candidate.status === 'error') && typeof candidate.message === 'string' && typeof candidate.at === 'string') {
          return { status: candidate.status, message: candidate.message, at: candidate.at }
        }
      }
    }
    const legacy = data[this.legacyRoutingMetaKey]
    if (legacy && typeof legacy === 'object') {
      const candidate = legacy as { status?: unknown; message?: unknown; at?: unknown }
      if ((candidate.status === 'ok' || candidate.status === 'error') && typeof candidate.message === 'string' && typeof candidate.at === 'string') {
        return { status: candidate.status, message: candidate.message, at: candidate.at }
      }
    }
    return undefined
  }

  private extractRetryHistory(raw: unknown): Array<{ status: 'ok' | 'error'; message: string; at: string }> {
    const data = this.toSubmissionDataRecord(raw) as Record<string, unknown>
    const meta = data[this.routingMetaKey]
    if (!meta || typeof meta !== 'object') return []
    const envelope = meta as { history?: unknown[] }
    if (!Array.isArray(envelope.history)) return []
    return envelope.history
      .map((item) => {
        if (!item || typeof item !== 'object') return undefined
        const entry = item as { status?: unknown; message?: unknown; at?: unknown }
        if ((entry.status !== 'ok' && entry.status !== 'error') || typeof entry.message !== 'string' || typeof entry.at !== 'string') return undefined
        return { status: entry.status, message: entry.message, at: entry.at }
      })
      .filter((item): item is { status: 'ok' | 'error'; message: string; at: string } => Boolean(item))
  }

  private withRetryMeta(
    data: Record<string, string | string[]>,
    meta: { status: 'ok' | 'error'; message: string; at: string },
  ): Record<string, string | string[]> {
    const next = { ...data } as Record<string, unknown>
    const current = this.extractRetryHistory(next)
    const history = [meta, ...current].slice(0, this.maxRoutingHistory)
    next[this.routingMetaKey] = { latest: meta, history }
    return next as Record<string, string | string[]>
  }

  private stripInternalDataKeys(data: Record<string, string | string[]>): Record<string, string | string[]> {
    const next = { ...data }
    delete (next as Record<string, unknown>)[this.routingMetaKey]
    delete (next as Record<string, unknown>)[this.legacyRoutingMetaKey]
    return next
  }

  private async createTaskForSubmission(
    formWithFields: Awaited<ReturnType<FormsService['getFormBySlug']>>,
    data: Record<string, string | string[]>,
    submitterEmail?: string | null,
    submitterName?: string | null,
  ): Promise<string | undefined> {
    // Task routing can be configured two ways: a form-level default target list,
    // or a field mapped to `targetListId` (the routing dropdown). Only bail early
    // when NEITHER exists — otherwise a field-routed form (the common case, since
    // the builder exposes routing via the field mapping) would never create a task.
    const hasRoutingField = formWithFields.fields.some((field) => field.taskField === 'targetListId')
    if (!formWithFields.targetListId && !hasRoutingField) return undefined

    let taskTitle = `Form submission: ${formWithFields.title}`
    let taskDescription = ''
    let targetListId = formWithFields.targetListId
    let mappedPriority: 'urgent' | 'high' | 'normal' | 'low' | undefined
    let mappedDueDate: Date | undefined
    let mappedAssigneeEmail: string | undefined
    const lines: string[] = []

    for (const field of formWithFields.fields) {
      const visible = this.isFieldVisible(field, data)
      if (!visible) continue
      const value = data[field.id]
      if (value === undefined) continue
      const displayValue = Array.isArray(value) ? value.join(', ') : value

      if (field.taskField === 'title' && typeof value === 'string') {
        taskTitle = value
      } else if (field.taskField === 'description' && typeof value === 'string') {
        taskDescription = value
      } else if (field.taskField === 'priority' && typeof value === 'string') {
        mappedPriority = this.toTaskPriority(value) ?? mappedPriority
      } else if (field.taskField === 'dueDate' && typeof value === 'string') {
        if (!Number.isNaN(Date.parse(value))) mappedDueDate = new Date(value)
      } else if (field.taskField === 'assigneeEmail' && typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized) mappedAssigneeEmail = normalized
      } else if (field.taskField === 'targetListId') {
        const candidates = Array.isArray(value) ? value : [value]
        const selectedTarget = candidates
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => this.extractTargetListId(entry))
          .find((entry): entry is string => Boolean(entry))
        if (!selectedTarget) {
          throw new BadRequestException(`Field "${field.label}" must route to a valid list target`)
        }
        targetListId = this.normalizeTargetListValue(selectedTarget)
      } else {
        lines.push(`**${field.label}:** ${displayValue}`)
      }
    }

    if (lines.length > 0) {
      taskDescription += (taskDescription ? '\n\n---\n' : '') + lines.join('\n')
    }

    if (submitterEmail) {
      taskDescription += `\n\n---\n**Submitted by:** ${submitterName || 'Unknown'} (${submitterEmail})`
    }

    if (!targetListId) {
      // A routing field was present but the submitter picked no target and the
      // form has no default list — store the submission without a task rather
      // than recording a spurious routing error.
      return undefined
    }
    const [targetList] = await this.db
      .select({ id: lists.id, workspaceId: spaces.workspaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, targetListId))
      .limit(1)
    if (!targetList || targetList.workspaceId !== formWithFields.workspaceId) {
      throw new BadRequestException('Selected routing list is invalid for this workspace')
    }
    const [newTask] = await this.db
      .insert(tasks)
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
        taskTypeId: await taskTypeIdForOrigin(this.db, targetList.workspaceId, 'form'),
      })
      .returning()
    if (mappedAssigneeEmail) {
      const [candidate] = await this.db
        .select({ userId: users.id })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(
          and(
            eq(users.email, mappedAssigneeEmail),
            eq(workspaceMembers.workspaceId, formWithFields.workspaceId),
          ),
        )
        .limit(1)
      if (candidate) {
        await this.db.insert(taskAssignees).values({ taskId: newTask.id, userId: candidate.userId }).onConflictDoNothing()
      }
    }
    return newTask.id
  }

  private toTaskPriority(value: string): 'urgent' | 'high' | 'normal' | 'low' | undefined {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'urgent' || normalized === 'high' || normalized === 'normal' || normalized === 'low') {
      return normalized
    }
    return undefined
  }

  private normalizeTargetListValue(value: string): string {
    return value.startsWith('list:') ? value.slice('list:'.length) : value
  }

  private extractTargetListId(value: string): string | undefined {
    const normalized = value.trim()
    if (!normalized) return undefined
    if (normalized.startsWith('list:')) {
      const listId = normalized.slice('list:'.length).trim()
      return listId || undefined
    }
    return normalized
  }

  private unpackFieldOptions(
    options: unknown,
  ): {
    choices: { label: string; value: string }[]
    visibilityMode: 'all' | 'any'
    visibilityRules: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>
  } {
    if (!options) return { choices: [], visibilityMode: 'all', visibilityRules: [] }
    if (Array.isArray(options)) {
      return { choices: options as { label: string; value: string }[], visibilityMode: 'all', visibilityRules: [] }
    }
    const payload = options as {
      choices?: { label: string; value: string }[]
      visibilityMode?: 'all' | 'any'
      visibilityRules?: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>
    }
    return {
      choices: payload.choices ?? [],
      visibilityMode: payload.visibilityMode === 'any' ? 'any' : 'all',
      visibilityRules: payload.visibilityRules ?? [],
    }
  }

  private packFieldOptions(
    choices?: { label: string; value: string }[] | null,
    visibilityMode?: 'all' | 'any' | null,
    visibilityRules?: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }> | null,
  ): { label: string; value: string }[] | { choices: { label: string; value: string }[]; visibilityMode: 'all' | 'any'; visibilityRules: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }> } | null {
    const cleanChoices = (choices ?? []).filter((c) => c?.value)
    const cleanRules = (visibilityRules ?? [])
      .filter((r) =>
        r?.fieldId &&
        r?.value &&
        (r.operator === 'equals' || r.operator === 'not_equals' || r.operator === 'contains' || r.operator === 'not_contains'),
      )
    if (cleanRules.length === 0) return cleanChoices.length > 0 ? cleanChoices : null
    return { choices: cleanChoices, visibilityMode: visibilityMode === 'any' ? 'any' : 'all', visibilityRules: cleanRules }
  }

  private isFieldVisible(
    field: {
      options?: unknown
      visibilityMode?: 'all' | 'any'
      visibilityRules?: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>
    },
    data: Record<string, string | string[]>,
  ): boolean {
    const unpacked = this.unpackFieldOptions(field.options)
    const visibilityRules = field.visibilityRules ?? unpacked.visibilityRules
    const visibilityMode = field.visibilityMode ?? unpacked.visibilityMode
    if (visibilityRules.length === 0) return true
    const matcher = visibilityMode === 'any' ? 'some' : 'every'
    return visibilityRules[matcher]((rule) => {
      const source = data[rule.fieldId]
      const asText = Array.isArray(source) ? source.join(',') : source ?? ''
      const asArray = Array.isArray(source) ? source : typeof source === 'string' && source ? source.split(',') : []
      if (rule.operator === 'equals') return asText === rule.value
      if (rule.operator === 'not_equals') return asText !== rule.value
      if (rule.operator === 'contains') return asArray.includes(rule.value) || asText.includes(rule.value)
      return !asArray.includes(rule.value) && !asText.includes(rule.value)
    })
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
  async listForms(workspaceId: string, includeArchived = false, targetListId?: string) {
    const rows = await this.db
      .select({
        id: forms.id,
        title: forms.title,
        description: forms.description,
        slug: forms.slug,
        isPublic: forms.isPublic,
        isEnabled: forms.isEnabled,
        isArchived: forms.isArchived,
        createdAt: forms.createdAt,
        updatedAt: forms.updatedAt,
        createdById: forms.createdById,
        createdByName: users.displayName,
        createdByEmail: users.email,
        targetListId: forms.targetListId,
        targetListName: lists.name,
        targetProjectId: projects.id,
        targetSpaceId: spaces.id,
        // Correlate on outer `forms.id` in SQL text — `${forms.id}` here binds as a single
        // parameter and breaks per-row counts in PostgreSQL.
        submissionCount: sql<number>`(
          select count(*)::int from form_submissions fs where fs.form_id = forms.id
        )`,
      })
      .from(forms)
      // Left joins: a form without a destination list is legal and still lists.
      .leftJoin(lists, eq(lists.id, forms.targetListId))
      .leftJoin(projects, eq(projects.id, lists.projectId))
      .leftJoin(spaces, eq(spaces.id, projects.spaceId))
      // Also left: the creator may have been removed (createdById is set null).
      .leftJoin(users, eq(users.id, forms.createdById))
      .where(
        and(
          eq(forms.workspaceId, workspaceId),
          includeArchived ? undefined : eq(forms.isArchived, false),
          targetListId ? eq(forms.targetListId, targetListId) : undefined,
        ),
      )
      .orderBy(desc(forms.createdAt))
    return rows
  }

  // ─── Get a single form with all fields ────────────────────────────────────
  async getForm(formId: string) {
    const [form] = await this.db.select().from(forms).where(eq(forms.id, formId))
    if (!form) throw new NotFoundException('Form not found')
    const fields = await this.db
      .select()
      .from(formFields)
      .where(eq(formFields.formId, formId))
      .orderBy(formFields.position)
    return {
      ...form,
      fields: fields.map((field) => {
        const unpacked = this.unpackFieldOptions(field.options)
        return {
          ...field,
          options: unpacked.choices,
          visibilityMode: unpacked.visibilityMode,
          visibilityRules: unpacked.visibilityRules,
        }
      }),
    }
  }

  // ─── Get form by slug (for public submission page) ─────────────────────────
  async getFormBySlug(slug: string) {
    const [form] = await this.db.select().from(forms).where(and(eq(forms.slug, slug), eq(forms.isArchived, false)))
    if (!form) throw new NotFoundException('Form not found')
    if (!form.isEnabled) throw new ForbiddenException('This form is currently disabled')
    // The "Public form (no login required)" toggle must actually gate anonymous
    // access — this slug route is the only (unauthenticated) way to view/submit,
    // so a non-public form has to be refused here.
    if (!form.isPublic) throw new ForbiddenException('This form is not publicly accessible')
    return this.attachFields(form)
  }

  /**
   * Load a form's fields (options unpacked). No enabled/public gating — used by
   * getFormBySlug after its public checks, and by authenticated callers (routing
   * retry) that already hold an authorized form row.
   */
  private async attachFields(form: typeof forms.$inferSelect) {
    const fields = await this.db
      .select()
      .from(formFields)
      .where(eq(formFields.formId, form.id))
      .orderBy(formFields.position)
    return {
      ...form,
      fields: fields.map((field) => {
        const unpacked = this.unpackFieldOptions(field.options)
        return {
          ...field,
          options: unpacked.choices,
          visibilityMode: unpacked.visibilityMode,
          visibilityRules: unpacked.visibilityRules,
        }
      }),
    }
  }

  // ─── Public file uploads (form intake) ─────────────────────────────────────

  /** Object-key prefix owning a form's uploaded files. */
  private formUploadPrefix(formId: string): string {
    return `forms/${formId}/uploads/`
  }

  /**
   * Presign a direct-to-R2 upload for a public form file field. Scoped to the
   * form (which must be live + have a file field) and size-capped. No auth —
   * public intake forms accept anonymous submissions by design.
   */
  async createUploadUrl(slug: string, body: { fileName: string; contentType: string; sizeBytes?: number }) {
    const form = await this.getFormBySlug(slug) // throws if missing / archived / disabled
    if (!form.fields.some((f) => f.type === 'file')) {
      throw new BadRequestException('This form does not accept file uploads')
    }
    if (!this.r2.configured) throw new BadRequestException('File storage is not configured')
    if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > MAX_FORM_UPLOAD_BYTES) {
      throw new BadRequestException(`File exceeds the ${Math.round(MAX_FORM_UPLOAD_BYTES / (1024 * 1024))} MB limit`)
    }
    const fileName = safeFileName(body.fileName)
    const key = `${this.formUploadPrefix(form.id)}${Date.now()}-${fileName}`
    const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'application/octet-stream', {
      formid: form.id,
    })
    return { uploadUrl, storageKey: key, fileName }
  }

  /**
   * A short-lived signed download URL for a file a submitter uploaded. Only a
   * member of the form's workspace may resolve it; the stored value must be a
   * key owned by this form (guards against tampered/foreign keys).
   */
  async getSubmissionFileUrl(formId: string, submissionId: string, fieldId: string, actorId: string) {
    const [form] = await this.db.select().from(forms).where(eq(forms.id, formId)).limit(1)
    if (!form) throw new NotFoundException('Form not found')
    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, form.workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    if (!membership) throw new ForbiddenException('Workspace membership required')

    const [submission] = await this.db
      .select()
      .from(formSubmissions)
      .where(and(eq(formSubmissions.id, submissionId), eq(formSubmissions.formId, formId)))
      .limit(1)
    if (!submission) throw new NotFoundException('Submission not found')

    const data = this.toSubmissionDataRecord(submission.data)
    const value = data[fieldId]
    const key = typeof value === 'string' ? value : null
    if (!key || !key.startsWith(this.formUploadPrefix(formId))) {
      throw new NotFoundException('No file for that field')
    }
    if (!this.r2.configured) throw new BadRequestException('File storage is not configured')
    const url = await this.r2.getObjectUrl(key)
    return { url, fileName: key.split('/').pop() ?? 'file' }
  }

  // ─── Create form ──────────────────────────────────────────────────────────
  /**
   * A FORM FILES TASKS WHERE ITS MAKER COULD MAKE ONE: a list of the form's
   * workspace they may open and add to (the list rule and the space's create
   * gate). The target list and every list a routing field offers were taken as
   * sent, so a member refused a private list routed a public form's
   * submissions into it (`found-24-sep/forms-open-across-workspaces`).
   */
  private async assertMayFileInto(workspaceId: string, listId: string, actorId: string) {
    const list = isUuid(listId) ? await readableList(this.db, workspaceId, listId, { id: actorId }) : null
    if (!list) throw new NotFoundException('List not found')
    await assertCanCreateInSpace(this.db, { spaceId: list.spaceId, actorId, kind: 'task', within: [{ type: 'list', id: listId }] })
  }

  /**
   * A ROUTING FIELD offers lists, each one its maker may file into, and is a
   * dropdown or a multi-select — as the builder offers it — so the answer a
   * submitter gives is always one of them (the submission checks a choice
   * against its options).
   */
  private async assertRoutingField(
    workspaceId: string,
    field: { type?: string | null; taskField?: string | null; options?: { label: string; value: string }[] | null },
    actorId: string,
  ) {
    if (field.taskField !== 'targetListId') return
    if (field.type !== 'dropdown' && field.type !== 'multi_select') {
      throw new BadRequestException('A routing field is a dropdown or a multi-select of lists')
    }
    for (const option of field.options ?? []) {
      const listId = this.extractTargetListId(option.value)
      if (!listId) continue
      await this.assertMayFileInto(workspaceId, listId, actorId)
    }
  }

  async createForm(
    workspaceId: string,
    userId: string,
    dto: {
      title: string
      description?: string
      targetListId?: string
      isPublic?: boolean
      confirmationMsg?: string
    },
  ) {
    if (dto.targetListId) await this.assertMayFileInto(workspaceId, dto.targetListId, userId)
    const slug = await uniqueSlug(this.db, slugify(dto.title))
    const [form] = await this.db
      .insert(forms)
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
      .returning()
    return form
  }

  // ─── Update form ──────────────────────────────────────────────────────────
  async updateForm(
    formId: string,
    actor: { workspaceId: string; id: string },
    patch: {
      title?: string
      description?: string
      targetListId?: string | null
      isPublic?: boolean
      isEnabled?: boolean
      confirmationMsg?: string
      coverImageUrl?: string | null
    },
  ) {
    // Whitelist updatable columns (never spread the untyped body): keeps stray/
    // wrong-typed fields off the row — targetListId: true 500'd the UUID column.
    // targetListId is a UUID column — a non-string/non-null value (e.g. true)
    // would 500 the DB, so reject it up front.
    if (patch.targetListId !== undefined && patch.targetListId !== null && typeof patch.targetListId !== 'string') {
      throw new BadRequestException('targetListId must be a string or null')
    }
    if (typeof patch.targetListId === 'string') await this.assertMayFileInto(actor.workspaceId, patch.targetListId, actor.id)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['title', 'description', 'targetListId', 'isPublic', 'isEnabled', 'confirmationMsg', 'coverImageUrl'] as const) {
      if (patch[key] !== undefined) set[key] = patch[key]
    }
    const [form] = await this.db
      .update(forms)
      .set(set)
      .where(eq(forms.id, formId))
      .returning()
    if (!form) throw new NotFoundException('Form not found')
    return form
  }

  // ─── Archive / delete form ────────────────────────────────────────────────
  async archiveForm(formId: string) {
    await this.db.update(forms).set({ isArchived: true, updatedAt: new Date() }).where(eq(forms.id, formId))
    return { ok: true }
  }

  async deleteForm(formId: string) {
    await this.db.delete(forms).where(eq(forms.id, formId))
    return { ok: true }
  }

  // ─── Duplicate form ───────────────────────────────────────────────────────
  async duplicateForm(formId: string, userId: string) {
    const { fields: origFields, ...orig } = await this.getForm(formId)
    // The copy is the duplicator's: it files where they could, as a form of their own would.
    if (orig.targetListId) await this.assertMayFileInto(orig.workspaceId, orig.targetListId, userId)
    for (const f of origFields) {
      await this.assertRoutingField(orig.workspaceId, f as unknown as { type: string; taskField: string | null; options?: { label: string; value: string }[] }, userId)
    }
    const slug = await uniqueSlug(this.db, slugify(orig.title + '-copy'))
    const [newForm] = await this.db
      .insert(forms)
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
      .returning()
    if (origFields.length) {
      await this.db.insert(formFields).values(
        origFields.map((f) => ({
          formId: newForm.id,
          type: f.type,
          label: f.label,
          placeholder: f.placeholder ?? undefined,
          helpText: f.helpText ?? undefined,
          isRequired: f.isRequired,
          position: f.position,
          options: this.packFieldOptions(
            (f as unknown as { options?: { label: string; value: string }[] }).options,
            (f as unknown as { visibilityMode?: 'all' | 'any' }).visibilityMode,
            (f as unknown as { visibilityRules?: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }> }).visibilityRules,
          ) ?? undefined,
          taskField: f.taskField ?? undefined,
        })),
      )
    }
    return this.getForm(newForm.id)
  }

  // ─── Fields CRUD ──────────────────────────────────────────────────────────
  async addField(
    formId: string,
    actorId: string,
    dto: {
      type: string
      label: string
      placeholder?: string
      helpText?: string
      isRequired?: boolean
      position?: number
      options?: { label: string; value: string }[]
      visibilityMode?: 'all' | 'any'
      visibilityRules?: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>
      taskField?: string
    },
  ) {
    const [form] = await this.db.select({ workspaceId: forms.workspaceId }).from(forms).where(eq(forms.id, formId)).limit(1)
    if (!form) throw new NotFoundException('Form not found')
    await this.assertRoutingField(form.workspaceId, dto, actorId)
    const [maxPos] = await this.db
      .select({ max: sql<number>`coalesce(max(position), -1)` })
      .from(formFields)
      .where(eq(formFields.formId, formId))
    const position = dto.position ?? (maxPos.max + 1)
    const [field] = await this.db
      .insert(formFields)
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
      .returning()
    const unpacked = this.unpackFieldOptions(field.options)
    return { ...field, options: unpacked.choices, visibilityMode: unpacked.visibilityMode, visibilityRules: unpacked.visibilityRules }
  }

  async updateField(
    fieldId: string,
    actorId: string,
    patch: Partial<{
      type: string
      label: string
      placeholder: string | null
      helpText: string | null
      isRequired: boolean
      position: number
      options: { label: string; value: string }[]
      visibilityMode: 'all' | 'any'
      visibilityRules: Array<{ fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }>
      taskField: string | null
    }>,
  ) {
    /*
     * NAMED COLUMNS, NOT THE BODY. `{ ...patch }` set whatever a request sent —
     * a field's `formId` among it, moving the field onto any form.
     */
    const next: Record<string, unknown> = {}
    for (const key of ['type', 'label', 'placeholder', 'helpText', 'isRequired', 'position', 'taskField'] as const) {
      if (patch[key] !== undefined) next[key] = patch[key]
    }
    const [existing] = await this.db
      .select({ field: formFields, workspaceId: forms.workspaceId })
      .from(formFields)
      .innerJoin(forms, eq(forms.id, formFields.formId))
      .where(eq(formFields.id, fieldId))
      .limit(1)
    if (!existing) throw new NotFoundException('Field not found')
    const was = this.unpackFieldOptions(existing.field.options)
    await this.assertRoutingField(
      existing.workspaceId,
      {
        type: patch.type ?? existing.field.type,
        taskField: patch.taskField !== undefined ? patch.taskField : existing.field.taskField,
        options: patch.options ?? was.choices,
      },
      actorId,
    )
    if ('options' in patch || 'visibilityRules' in patch || 'visibilityMode' in patch) {
      const current = was
      next.options = this.packFieldOptions(
        'options' in patch ? patch.options : current.choices,
        'visibilityMode' in patch ? patch.visibilityMode : current.visibilityMode,
        'visibilityRules' in patch ? patch.visibilityRules : current.visibilityRules,
      )
    }
    const [field] = await this.db.update(formFields).set(next).where(eq(formFields.id, fieldId)).returning()
    if (!field) throw new NotFoundException('Field not found')
    const unpacked = this.unpackFieldOptions(field.options)
    return { ...field, options: unpacked.choices, visibilityMode: unpacked.visibilityMode, visibilityRules: unpacked.visibilityRules }
  }

  async deleteField(fieldId: string) {
    await this.db.delete(formFields).where(eq(formFields.id, fieldId))
    return { ok: true }
  }

  async reorderFields(formId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, index) =>
        this.db.update(formFields).set({ position: index }).where(and(eq(formFields.id, id), eq(formFields.formId, formId))),
      ),
    )
    return { ok: true }
  }

  // ─── Submit a form ────────────────────────────────────────────────────────
  /**
   * A5.5 — `honeypot` is a field no human ever sees (the public renderer hides
   * it and never focuses it); a bot that fills every input trips it. The reply
   * is the ordinary confirmation so the scraper learns nothing, but nothing is
   * written and no task is routed. Volume abuse is handled separately by the
   * per-IP rate limit on the public controller.
   */
  async submitForm(
    slug: string,
    data: Record<string, string | string[]>,
    submitterEmail?: string,
    submitterName?: string,
    honeypot?: string,
  ) {
    const formWithFields = await this.getFormBySlug(slug)

    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
      return {
        ok: true,
        submissionId: null as string | null,
        createdTaskId: null as string | null,
        confirmationMsg: formWithFields.confirmationMsg,
      }
    }

    // Guard the (public, unauthenticated) payload so malformed input yields a
    // clean 400 from the validation below rather than a 500 on `data[...]`.
    if (data !== undefined && data !== null && (typeof data !== 'object' || Array.isArray(data))) {
      throw new BadRequestException('data must be an object mapping field id -> value')
    }
    data = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {}

    // Validate required fields and basic field-shape constraints.
    for (const field of formWithFields.fields) {
      const value = data[field.id]
      const visible = this.isFieldVisible(field, data)
      if (!visible) continue
      if (field.isRequired && (value === undefined || value === '')) {
        throw new BadRequestException(`Field "${field.label}" is required`)
      }
      if (value === undefined || value === '') continue

      if (field.type === 'email' && typeof value === 'string') {
        const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        if (!emailLike) throw new BadRequestException(`Field "${field.label}" must be a valid email`)
      }
      if (field.type === 'number' && typeof value === 'string') {
        if (Number.isNaN(Number(value))) throw new BadRequestException(`Field "${field.label}" must be numeric`)
      }
      if (field.type === 'date' && typeof value === 'string') {
        if (Number.isNaN(Date.parse(value))) throw new BadRequestException(`Field "${field.label}" must be a valid date`)
      }
      // A file field stores the R2 object key produced by createUploadUrl. Only
      // accept a key owned by this form so a submitter can't point the answer at
      // an arbitrary/foreign object.
      if (field.type === 'file') {
        if (typeof value !== 'string' || !value.startsWith(this.formUploadPrefix(formWithFields.id))) {
          throw new BadRequestException(`Field "${field.label}" must be an uploaded file`)
        }
      }
      const unpacked = this.unpackFieldOptions(field.options)
      if ((field.type === 'dropdown' || field.type === 'multi_select') && unpacked.choices.length) {
        const allowed = new Set(unpacked.choices.map((option) => option.value))
        if (Array.isArray(value)) {
          for (const v of value) {
            if (!allowed.has(v)) {
              throw new BadRequestException(`Field "${field.label}" has an invalid option`)
            }
          }
        } else if (!allowed.has(value)) {
          throw new BadRequestException(`Field "${field.label}" has an invalid option`)
        }
      }
    }

    const payload = { ...data } as Record<string, string | string[]>

    const [submission] = await this.db
      .insert(formSubmissions)
      .values({
        formId: formWithFields.id,
        createdTaskId: null,
        submitterEmail,
        submitterName,
        data: payload,
      })
      .returning()

    let createdTaskId: string | null = null
    try {
      const taskId = await this.createTaskForSubmission(
        formWithFields,
        payload,
        submitterEmail,
        submitterName,
      )
      if (taskId) {
        createdTaskId = taskId
        await this.db
          .update(formSubmissions)
          .set({ createdTaskId })
          .where(eq(formSubmissions.id, submission.id))
      }
    } catch (err) {
      const message =
        err instanceof BadRequestException
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not create task from this submission'
      const patched = this.withRetryMeta(payload, {
        status: 'error',
        message,
        at: new Date().toISOString(),
      })
      await this.db
        .update(formSubmissions)
        .set({ data: patched })
        .where(eq(formSubmissions.id, submission.id))
    }

    // Advertise the submission to webhooks (Plan §12.4). Best effort, and
    // fired after the row + any routed task are durable.
    void this.fireWebhook(formWithFields.workspaceId, 'form.submitted', {
      workspaceId: formWithFields.workspaceId,
      formId: formWithFields.id,
      submissionId: submission.id,
      createdTaskId,
    })

    return {
      ok: true,
      submissionId: submission.id,
      createdTaskId,
      confirmationMsg: formWithFields.confirmationMsg,
    }
  }

  // ─── List submissions ──────────────────────────────────────────────────────
  async listSubmissions(formId: string) {
    const rows = await this.db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(desc(formSubmissions.submittedAt))
    return rows.map((row) => ({
      ...row,
      retryMeta: this.extractRetryMeta(row.data),
      retryHistory: this.extractRetryHistory(row.data),
      data: this.stripInternalDataKeys(this.toSubmissionDataRecord(row.data)),
    }))
  }

  async retrySubmissionRouting(formId: string, submissionId: string) {
    const [form] = await this.db.select().from(forms).where(eq(forms.id, formId)).limit(1)
    if (!form) throw new NotFoundException('Form not found')

    const [submission] = await this.db
      .select()
      .from(formSubmissions)
      .where(and(eq(formSubmissions.id, submissionId), eq(formSubmissions.formId, formId)))
      .limit(1)
    if (!submission) throw new NotFoundException('Submission not found')

    const formWithFields = await this.attachFields(form)
    const cleanData = this.stripInternalDataKeys(this.toSubmissionDataRecord(submission.data))
    try {
      const createdTaskId = await this.createTaskForSubmission(
        formWithFields,
        cleanData,
        submission.submitterEmail,
        submission.submitterName,
      )
      if (!createdTaskId) {
        throw new BadRequestException('This form does not have task routing enabled')
      }
      await this.db
        .update(formSubmissions)
        .set({
          createdTaskId,
          data: this.withRetryMeta(cleanData, {
            status: 'ok',
            message: 'Routing retry succeeded',
            at: new Date().toISOString(),
          }),
        })
        .where(eq(formSubmissions.id, submission.id))
      return { ok: true, submissionId: submission.id, createdTaskId }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Routing retry failed'
      await this.db
        .update(formSubmissions)
        .set({
          data: this.withRetryMeta(cleanData, {
            status: 'error',
            message,
            at: new Date().toISOString(),
          }),
        })
        .where(eq(formSubmissions.id, submission.id))
      throw error
    }
  }

  async clearSubmissionRetryHistory(formId: string, submissionId: string) {
    const [submission] = await this.db
      .select()
      .from(formSubmissions)
      .where(and(eq(formSubmissions.id, submissionId), eq(formSubmissions.formId, formId)))
      .limit(1)
    if (!submission) throw new NotFoundException('Submission not found')

    const cleanData = this.stripInternalDataKeys(this.toSubmissionDataRecord(submission.data))
    await this.db
      .update(formSubmissions)
      .set({ data: cleanData })
      .where(eq(formSubmissions.id, submission.id))
    return { ok: true, submissionId: submission.id }
  }
}
