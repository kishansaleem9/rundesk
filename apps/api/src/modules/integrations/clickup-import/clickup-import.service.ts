import { Injectable, Inject, BadRequestException } from '@nestjs/common'
import { spaces, projects, lists, tasks } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

type ImportSummary = {
  spacesCreated: number
  projectsCreated: number
  listsCreated: number
  tasksCreated: number
  errors: string[]
}

type ParsedTask = {
  title: string
  description?: string
  status?: string
  priority?: string
  dueDate?: string
  list?: string
  folder?: string
  assignees?: string
  tags?: string
}

@Injectable()
export class ClickUpImportService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * Parse a ClickUp CSV export and import everything into the workspace.
   * If `targetSpaceId` is given, all imported lists go under that space.
   * Otherwise we create a new space named after `targetProjectName`.
   */
  async importCsv(
    workspaceId: string,
    userId: string,
    dto: { csv: string; targetSpaceId?: string; targetProjectName?: string },
  ): Promise<ImportSummary> {
    const summary: ImportSummary = {
      spacesCreated: 0,
      projectsCreated: 0,
      listsCreated: 0,
      tasksCreated: 0,
      errors: [],
    }

    if (!dto.csv?.trim()) throw new BadRequestException('CSV body is empty')

    const rows = this.parseCsv(dto.csv)
    if (rows.length === 0) throw new BadRequestException('CSV contained no data rows')

    // Resolve / create space
    let spaceId = dto.targetSpaceId
    if (!spaceId) {
      const [space] = await this.db
        .insert(spaces)
        .values({
          workspaceId,
          name: dto.targetProjectName ?? 'Imported from ClickUp',
          icon: '📥',
          color: '#354fb0',
        })
        .returning()
      spaceId = space.id
      summary.spacesCreated++
    }

    // Single project per import (named after targetProjectName, defaults to "ClickUp Import")
    const [project] = await this.db
      .insert(projects)
      .values({
        spaceId,
        name: dto.targetProjectName ?? 'ClickUp Import',
        description: `Imported on ${new Date().toISOString()} by user ${userId}`,
      })
      .returning()
    summary.projectsCreated++

    // Group rows by their `List` column
    const byList = new Map<string, ParsedTask[]>()
    for (const r of rows) {
      const listName = r.list?.trim() || 'Imported Tasks'
      const arr = byList.get(listName) ?? []
      arr.push(r)
      byList.set(listName, arr)
    }

    // Create lists + tasks
    let listPosition = 0
    for (const [listName, listRows] of byList) {
      try {
        const [list] = await this.db
          .insert(lists)
          .values({
            projectId: project.id,
            name: listName,
            position: listPosition++,
          })
          .returning()
        summary.listsCreated++

        for (const t of listRows) {
          try {
            await this.db.insert(tasks).values({
              listId: list.id,
              createdById: userId,
              title: t.title.slice(0, 500),
              description: t.description ?? null,
              status: this.mapStatus(t.status),
              priority: this.mapPriority(t.priority),
              dueDate: t.dueDate ? this.safeDate(t.dueDate) : undefined,
            })
            summary.tasksCreated++
          } catch (e: any) {
            summary.errors.push(`Task "${t.title}": ${e?.message ?? 'unknown error'}`)
          }
        }
      } catch (e: any) {
        summary.errors.push(`List "${listName}": ${e?.message ?? 'unknown error'}`)
      }
    }

    return summary
  }

  // ── CSV parsing ─────────────────────────────────────────────────────────────
  private parseCsv(csv: string): ParsedTask[] {
    const lines = this.splitCsvLines(csv)
    if (lines.length < 2) return []

    const headers = this.splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase())
    const idx = (name: string) => headers.findIndex((h) => h === name.toLowerCase())

    const tIdx = idx('task name')
    const dIdx = idx('description') !== -1 ? idx('description') : idx('task content')
    const sIdx = idx('status')
    const pIdx = idx('priority')
    const duIdx = idx('due date')
    const lIdx = idx('list')
    const fIdx = idx('folder')
    const aIdx = idx('assignee') !== -1 ? idx('assignee') : idx('assignees')
    const tagIdx = idx('tags')

    const out: ParsedTask[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvRow(lines[i])
      if (!cols.length) continue
      const title = (tIdx !== -1 ? cols[tIdx] : '').trim()
      if (!title) continue
      out.push({
        title,
        description: dIdx !== -1 ? cols[dIdx]?.trim() : undefined,
        status: sIdx !== -1 ? cols[sIdx]?.trim() : undefined,
        priority: pIdx !== -1 ? cols[pIdx]?.trim() : undefined,
        dueDate: duIdx !== -1 ? cols[duIdx]?.trim() : undefined,
        list: lIdx !== -1 ? cols[lIdx]?.trim() : undefined,
        folder: fIdx !== -1 ? cols[fIdx]?.trim() : undefined,
        assignees: aIdx !== -1 ? cols[aIdx]?.trim() : undefined,
        tags: tagIdx !== -1 ? cols[tagIdx]?.trim() : undefined,
      })
    }
    return out
  }

  /** Split CSV text into logical rows, respecting quoted newlines. */
  private splitCsvLines(csv: string): string[] {
    const lines: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i]
      if (ch === '"') {
        // Handle escaped quote ""
        if (inQuote && csv[i + 1] === '"') {
          current += '""'
          i++
          continue
        }
        inQuote = !inQuote
        current += ch
        continue
      }
      if (ch === '\n' && !inQuote) {
        lines.push(current.replace(/\r$/, ''))
        current = ''
        continue
      }
      current += ch
    }
    if (current.length > 0) lines.push(current.replace(/\r$/, ''))
    return lines.filter((l) => l.trim().length > 0)
  }

  /** Split a single CSV row into fields, respecting quotes. */
  private splitCsvRow(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          current += '"'
          i++
          continue
        }
        inQuote = !inQuote
        continue
      }
      if (ch === ',' && !inQuote) {
        fields.push(current)
        current = ''
        continue
      }
      current += ch
    }
    fields.push(current)
    return fields
  }

  // ── ClickUp value mapping ───────────────────────────────────────────────────
  private mapStatus(value?: string): TaskStatus {
    if (!value) return 'todo'
    const v = value.toLowerCase().trim()
    if (v.includes('done') || v.includes('complete') || v.includes('closed')) return 'done'
    if (v.includes('progress') || v === 'doing') return 'in_progress'
    if (v.includes('review')) return 'in_review'
    if (v.includes('cancel')) return 'cancelled'
    if (v.includes('backlog') || v.includes('open')) return 'backlog'
    return 'todo'
  }

  private mapPriority(value?: string): TaskPriority {
    if (!value) return 'normal'
    const v = value.toLowerCase().trim()
    if (v.includes('urgent') || v === '1') return 'urgent'
    if (v.includes('high') || v === '2') return 'high'
    if (v.includes('low') || v === '4') return 'low'
    return 'normal'
  }

  private safeDate(value: string): Date | undefined {
    const ms = Date.parse(value)
    if (Number.isNaN(ms)) return undefined
    return new Date(ms)
  }

  /** Quick preview without writing — count rows, sample first 5. */
  async preview(csv: string) {
    const rows = this.parseCsv(csv)
    return {
      totalRows: rows.length,
      sample: rows.slice(0, 5),
      uniqueLists: Array.from(new Set(rows.map((r) => r.list?.trim()).filter(Boolean))) as string[],
    }
  }
}
