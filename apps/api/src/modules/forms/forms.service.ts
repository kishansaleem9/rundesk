import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, eq, desc, sql } from 'drizzle-orm'
import { forms, formFields, formSubmissions, tasks, lists, projects, spaces, users, workspaceMembers, taskAssignees } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

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
  constructor(@Inject(DB_TOKEN) private db: Db) {}
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
    if (!formWithFields.targetListId) return undefined

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
      throw new BadRequestException('No target list configured for this form submission')
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
  async listForms(workspaceId: string, includeArchived = false) {
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
        submissionCount: sql<number>`(
          select count(*) from form_submissions fs where fs.form_id = ${forms.id}
        )::int`,
      })
      .from(forms)
      .where(
        and(
          eq(forms.workspaceId, workspaceId),
          includeArchived ? undefined : eq(forms.isArchived, false),
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

  // ─── Create form ──────────────────────────────────────────────────────────
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
    const [form] = await this.db
      .update(forms)
      .set({ ...patch, updatedAt: new Date() })
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
    const next: Record<string, unknown> = { ...patch }
    if ('options' in patch || 'visibilityRules' in patch || 'visibilityMode' in patch) {
      const [existing] = await this.db.select().from(formFields).where(eq(formFields.id, fieldId)).limit(1)
      if (!existing) throw new NotFoundException('Field not found')
      const current = this.unpackFieldOptions(existing.options)
      next.options = this.packFieldOptions(
        'options' in patch ? patch.options : current.choices,
        'visibilityMode' in patch ? patch.visibilityMode : current.visibilityMode,
        'visibilityRules' in patch ? patch.visibilityRules : current.visibilityRules,
      )
      delete next.visibilityRules
      delete next.visibilityMode
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
  async submitForm(
    slug: string,
    data: Record<string, string | string[]>,
    submitterEmail?: string,
    submitterName?: string,
  ) {
    const formWithFields = await this.getFormBySlug(slug)

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

    const createdTaskId = await this.createTaskForSubmission(formWithFields, data, submitterEmail, submitterName)

    const [submission] = await this.db
      .insert(formSubmissions)
      .values({
        formId: formWithFields.id,
        createdTaskId,
        submitterEmail,
        submitterName,
        data,
      })
      .returning()

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

    const formWithFields = await this.getFormBySlug(form.slug)
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
