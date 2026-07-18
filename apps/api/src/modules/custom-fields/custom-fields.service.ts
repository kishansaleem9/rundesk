import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq, asc } from 'drizzle-orm'
import {
  customFieldDefinitions,
  customFieldValues,
  projects,
  spaces,
  tasks,
  lists,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'
type FieldValue = string | number | boolean | null

@Injectable()
export class CustomFieldsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ── Definition ownership guard ──────────────────────────────────────────────
  private async assertProjectInWorkspace(workspaceId: string, projectId: string) {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(projects.id, projectId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Project not found in this workspace')
  }

  private async assertTaskInWorkspace(workspaceId: string, taskId: string) {
    const [row] = await this.db
      .select({ taskId: tasks.id, projectId: lists.projectId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Task not found in this workspace')
    return row
  }

  // ── Definitions ─────────────────────────────────────────────────────────────
  async listForProject(workspaceId: string, projectId: string) {
    await this.assertProjectInWorkspace(workspaceId, projectId)
    return this.db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, projectId))
      .orderBy(asc(customFieldDefinitions.position), asc(customFieldDefinitions.createdAt))
  }

  async createDefinition(
    workspaceId: string,
    projectId: string,
    dto: {
      name: string
      type: CustomFieldType
      isRequired?: boolean
      listId?: string
      options?: Array<{ label: string; value: string; color?: string }>
    },
  ) {
    await this.assertProjectInWorkspace(workspaceId, projectId)
    // `options` must be an array when present — a non-array (e.g. {} or a bare
    // string) passes the length check below (undefined === 0 is false) and gets
    // stored, then crashes every reader that does `options.map(...)`.
    if (dto.options != null && !Array.isArray(dto.options)) {
      throw new BadRequestException('Custom field "options" must be an array')
    }
    if (dto.type === 'dropdown' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('Dropdown fields require at least one option')
    }

    // Position = current max + 1
    const existing = await this.db
      .select({ position: customFieldDefinitions.position })
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, projectId))
    const nextPos = existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.position)) + 1

    const [row] = await this.db
      .insert(customFieldDefinitions)
      .values({
        projectId,
        listId: dto.listId,
        name: dto.name,
        type: dto.type,
        isRequired: dto.isRequired ?? false,
        options: dto.options ?? null,
        position: nextPos,
      })
      .returning()
    return row
  }

  async updateDefinition(
    workspaceId: string,
    fieldId: string,
    patch: {
      name?: string
      isRequired?: boolean
      options?: Array<{ label: string; value: string; color?: string }>
      position?: number
    },
  ) {
    const def = await this.getDefOwnedBy(workspaceId, fieldId)
    if (patch.options != null && !Array.isArray(patch.options)) {
      throw new BadRequestException('Custom field "options" must be an array')
    }
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'isRequired', 'options', 'position'] as const) {
      if (patch[key] !== undefined) set[key] = patch[key]
    }
    const [row] = await this.db
      .update(customFieldDefinitions)
      .set(set)
      .where(eq(customFieldDefinitions.id, def.id))
      .returning()
    return row
  }

  async deleteDefinition(workspaceId: string, fieldId: string) {
    const def = await this.getDefOwnedBy(workspaceId, fieldId)
    // Cascade deletes the values automatically via FK.
    await this.db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, def.id))
    return { ok: true }
  }

  private async getDefOwnedBy(workspaceId: string, fieldId: string) {
    const [row] = await this.db
      .select({
        id: customFieldDefinitions.id,
        projectId: customFieldDefinitions.projectId,
        type: customFieldDefinitions.type,
        options: customFieldDefinitions.options,
      })
      .from(customFieldDefinitions)
      .innerJoin(projects, eq(projects.id, customFieldDefinitions.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(customFieldDefinitions.id, fieldId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Custom field not found')
    return row
  }

  // ── Values ──────────────────────────────────────────────────────────────────
  async getValuesForTask(workspaceId: string, taskId: string) {
    const task = await this.assertTaskInWorkspace(workspaceId, taskId)
    const defs = await this.db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.projectId, task.projectId))
      .orderBy(asc(customFieldDefinitions.position))

    const values = await this.db
      .select()
      .from(customFieldValues)
      .where(eq(customFieldValues.taskId, taskId))

    const byField = new Map(values.map((v) => [v.fieldId, v]))

    return defs.map((d) => ({
      definition: d,
      value: byField.get(d.id)?.value.v ?? null,
    }))
  }

  async setValue(
    workspaceId: string,
    taskId: string,
    fieldId: string,
    value: FieldValue,
  ) {
    await this.assertTaskInWorkspace(workspaceId, taskId)
    const def = await this.getDefOwnedBy(workspaceId, fieldId)

    // Type validation
    if (value !== null) {
      switch (def.type) {
        case 'text':
        case 'url':
        case 'date':
        case 'email':
        case 'phone':
          if (typeof value !== 'string') {
            throw new BadRequestException(`Field expects a string value`)
          }
          if (def.type === 'url' && !/^https?:\/\//.test(value as string)) {
            throw new BadRequestException('URL must start with http:// or https://')
          }
          if (def.type === 'date' && Number.isNaN(Date.parse(value as string))) {
            throw new BadRequestException('Invalid date value')
          }
          if (def.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) {
            throw new BadRequestException('Invalid email address')
          }
          if (def.type === 'phone' && !/^[+]?[0-9().\-\s]{5,}$/.test(value as string)) {
            throw new BadRequestException('Invalid phone number')
          }
          break
        case 'number':
        case 'money':
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new BadRequestException('Field expects a number value')
          }
          break
        case 'rating':
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
            throw new BadRequestException('Rating must be an integer from 0 to 5')
          }
          break
        case 'checkbox':
          if (typeof value !== 'boolean') {
            throw new BadRequestException('Field expects a boolean value')
          }
          break
        case 'dropdown': {
          const opts = (def.options as Array<{ value: string }> | null) ?? []
          if (typeof value !== 'string' || !opts.some((o) => o.value === value)) {
            throw new BadRequestException('Value must match a defined option')
          }
          break
        }
      }
    }

    // Upsert (taskId, fieldId) is unique
    const existing = await this.db
      .select()
      .from(customFieldValues)
      .where(and(eq(customFieldValues.taskId, taskId), eq(customFieldValues.fieldId, fieldId)))
      .limit(1)

    if (existing[0]) {
      const [row] = await this.db
        .update(customFieldValues)
        .set({ value: { v: value }, updatedAt: new Date() })
        .where(eq(customFieldValues.id, existing[0].id))
        .returning()
      return row
    }
    const [row] = await this.db
      .insert(customFieldValues)
      .values({ taskId, fieldId, value: { v: value } })
      .returning()
    return row
  }
}
