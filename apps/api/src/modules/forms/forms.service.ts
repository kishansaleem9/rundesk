import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, eq, desc, sql } from 'drizzle-orm'
import { forms, formFields, formSubmissions, tasks } from '@rundesk/db'
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
    return { ...form, fields }
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
    return { ...form, fields }
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
          options: f.options ?? undefined,
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
      .values({ formId, ...dto, position })
      .returning()
    return field
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
      taskField: string | null
    }>,
  ) {
    const [field] = await this.db.update(formFields).set(patch).where(eq(formFields.id, fieldId)).returning()
    if (!field) throw new NotFoundException('Field not found')
    return field
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
      if ((field.type === 'dropdown' || field.type === 'multi_select') && field.options?.length) {
        const allowed = new Set((field.options as Array<{ value: string }>).map((option) => option.value))
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

    // Build task if targetListId is set
    let createdTaskId: string | undefined

    if (formWithFields.targetListId) {
      // Map form data to task fields
      let taskTitle = `Form submission: ${formWithFields.title}`
      let taskDescription = ''
      const lines: string[] = []

      for (const field of formWithFields.fields) {
        const value = data[field.id]
        if (value === undefined) continue
        const displayValue = Array.isArray(value) ? value.join(', ') : value

        if (field.taskField === 'title' && typeof value === 'string') {
          taskTitle = value
        } else if (field.taskField === 'description' && typeof value === 'string') {
          taskDescription = value
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

      const [newTask] = await this.db
        .insert(tasks)
        .values({
          listId: formWithFields.targetListId,
          title: taskTitle,
          description: taskDescription || null,
        })
        .returning()
      createdTaskId = newTask.id
    }

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
    return this.db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(desc(formSubmissions.submittedAt))
  }
}
