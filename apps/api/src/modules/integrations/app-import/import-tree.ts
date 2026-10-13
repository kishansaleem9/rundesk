import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  clickupImportJobs,
  customFieldDefinitions,
  customFieldValues,
  labels,
  listStatuses,
  lists,
  projects,
  spaces,
  taskAssignees,
  taskAttachments,
  taskChecklistItems,
  taskChecklists,
  taskComments,
  taskDependencies,
  taskLabelAssignments,
  tasks,
  users,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { R2Service } from '../../../common/storage/r2.service'
import { safeFileName } from '../../../common/storage/file-name'
import { IMPORT_ACCESS, MAY_NOT_BE_ASSIGNED, type Importer } from '../clickup-import/import-access'
import { DEFAULT_STATUSES, storable } from '../clickup-import/spreadsheet-import.util'
import { AppError, type AppFile } from './app-http'

/**
 * WHAT ANOTHER TOOL HOLDS, AS RUNDESK WILL HOLD IT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * Each importer reads its tool into this one shape — Spaces, Folders, Lists
 * with their statuses, tasks with their subtasks, people, tags, checklists,
 * fields, comments and files — as ClickUp maps each tool onto its own
 * hierarchy; and one writer makes it here. A task's comments and files are
 * read only when the task is written (`details`), so a run holds one project
 * at a time, never the whole account.
 */

export type ImPerson = { key: string; name: string | null; email: string | null }
export type ImComment = { author: ImPerson | null; text: string; at: Date | null }
export type ImFileRef = { name: string; size: number | null; fetch: () => Promise<AppFile | null> }
export type ImChecklist = { name: string; items: Array<{ name: string; done: boolean }> }
export type ImFieldType = 'text' | 'number' | 'date' | 'checkbox' | 'url' | 'dropdown'
export type ImFieldValue = { name: string; type: ImFieldType; value: string | number | boolean; options?: string[] }
export type ImStatus = { name: string; category: 'open' | 'in_progress' | 'closed' }
export type ImPriority = 'urgent' | 'high' | 'normal' | 'low'

export type ImTask = {
  /** The tool's own id, for a link from another task. */
  ref: string
  title: string
  description: string | null
  /** A status of its List, by name; none for the List's first open one. */
  status: string | null
  done: boolean
  doneAt: Date | null
  start: Date | null
  due: Date | null
  dueHasTime: boolean
  created: Date | null
  priority: ImPriority | null
  assignees: ImPerson[]
  tags: string[]
  checklists: ImChecklist[]
  fields: ImFieldValue[]
  subtasks: ImTask[]
  /** The refs of the tasks this one is related to. */
  links: string[]
  details?: () => Promise<{ comments: ImComment[]; files: ImFileRef[] }>
}
export type ImList = { name: string; description?: string | null; statuses: ImStatus[] | null; tasks: ImTask[] }
export type ImFolder = { name: string; description?: string | null; lists: ImList[] }
/** What one chosen project becomes: a Folder, a List, or (Wrike's spaces) a whole Space. */
export type ImNode =
  | { kind: 'folder'; folder: ImFolder }
  | { kind: 'list'; list: ImList }
  | { kind: 'space'; name: string; folders: ImFolder[]; lists: ImList[] }

/** A task with nothing but its title, the rest filled in by the caller. */
export function imTask(ref: string, title: string, rest: Partial<ImTask> = {}): ImTask {
  return {
    ref,
    title,
    description: null,
    status: null,
    done: false,
    doneAt: null,
    start: null,
    due: null,
    dueHasTime: false,
    created: null,
    priority: null,
    assignees: [],
    tags: [],
    checklists: [],
    fields: [],
    subtasks: [],
    links: [],
    ...rest,
  }
}

export type AppImportSummary = {
  source: string
  spacesCreated: number
  foldersCreated: number
  listsCreated: number
  tasksCreated: number
  subtasksCreated: number
  subtasksFlattened: number
  tasksDone: number
  statusesCreated: number
  assigneesLinked: number
  assigneesUnmatched: number
  tagsApplied: number
  labelsCreated: number
  checklistsImported: number
  fieldsCreated: number
  fieldValuesSet: number
  commentsImported: number
  attachmentsImported: number
  attachmentsSkipped: number
  linksMade: number
  projects: Array<{ name: string; lists: number; tasks: number }>
  made: { spaces: Array<{ id: string; name: string }>; folders: Array<{ id: string; name: string }>; lists: Array<{ id: string; name: string }> }
  /** What the tool holds that comes in no other way, in words — as ClickUp's import of it leaves it. */
  notImported: string[]
  errors: string[]
  /** Notion's pages, made Docs. */
  docs?: Array<{ id: string; title: string }>
  pagesImported?: number
}

export const emptySummary = (source: string, notImported: string[] = []): AppImportSummary => ({
  source,
  spacesCreated: 0,
  foldersCreated: 0,
  listsCreated: 0,
  tasksCreated: 0,
  subtasksCreated: 0,
  subtasksFlattened: 0,
  tasksDone: 0,
  statusesCreated: 0,
  assigneesLinked: 0,
  assigneesUnmatched: 0,
  tagsApplied: 0,
  labelsCreated: 0,
  checklistsImported: 0,
  fieldsCreated: 0,
  fieldValuesSet: 0,
  commentsImported: 0,
  attachmentsImported: 0,
  attachmentsSkipped: 0,
  linksMade: 0,
  projects: [],
  made: { spaces: [], folders: [], lists: [] },
  notImported,
  errors: [],
})

export type WriteTarget = {
  jobId: string
  workspaceId: string
  importer: Importer
  /** The Space everything goes into; null makes new ones. */
  spaceId: string | null
  /** The new Space's name, for what is not a Space itself, when none was chosen. */
  newSpaceName: string
  source: string
  label: string
  icon: string
}

const PALETTE = ['#64748b', '#0ea5e9', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899']
const CLOSED_COLOR = '#10b981'
const MAX_REPORTED = 50

/** A status key from a name, distinct from the list's others. */
export function uniqueKey(name: string, used: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'status'
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`
}

type StatusRow = { key: string; name: string; color: string; category: 'open' | 'in_progress' | 'closed'; position: number }

/**
 * A List's statuses: the tool's own, in its order, when it has them — with a
 * closed one added when none of them closes, so a done task has somewhere to
 * be — and Rundesk's defaults when it has none.
 */
export function statusRows(statuses: ImStatus[] | null): StatusRow[] {
  if (!statuses || statuses.length === 0) return DEFAULT_STATUSES.map((s) => ({ key: s.key, name: s.name, color: s.color, category: s.category, position: s.position }))
  const used = new Set<string>()
  const seen = new Set<string>()
  const rows: StatusRow[] = []
  for (const s of statuses) {
    const name = s.name.trim().slice(0, 60) || 'Status'
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const key = uniqueKey(name, used)
    used.add(key)
    rows.push({ key, name, color: s.category === 'closed' ? CLOSED_COLOR : PALETTE[rows.length % PALETTE.length], category: s.category, position: rows.length })
  }
  if (!rows.some((r) => r.category === 'closed')) {
    const key = uniqueKey('done', used)
    rows.push({ key, name: 'Done', color: CLOSED_COLOR, category: 'closed', position: rows.length })
  }
  if (!rows.some((r) => r.category !== 'closed')) {
    const key = uniqueKey('to do', used)
    rows.unshift({ key, name: 'To do', color: PALETTE[0], category: 'open', position: 0 })
    rows.forEach((r, n) => (r.position = n))
  }
  return rows
}

/** Where a task stands among its List's statuses: its own by name, the first closed when done, else the first open. */
export function placeStatus(rows: StatusRow[], status: string | null, done: boolean): StatusRow {
  const named = status ? rows.find((r) => r.name.toLowerCase() === status.trim().toLowerCase().slice(0, 60)) : undefined
  if (done) return named && named.category === 'closed' ? named : rows.find((r) => r.category === 'closed')!
  if (named) return named
  return rows.find((r) => r.key === 'todo') ?? rows.find((r) => r.category === 'open') ?? rows[0]!
}

/**
 * ONE RUN'S WRITES, AND ONE RUN'S UNDO. A run that fails takes away what it
 * made — the Spaces, Folders and Lists, their tasks with them by the foreign
 * keys' cascade, and the tags it made that label nothing once those are gone —
 * as the spreadsheet and Basecamp imports do (`run-undo.ts`).
 */
export class TreeWriter {
  readonly summary: AppImportSummary
  private readonly madeSpaces: string[] = []
  private readonly madeProjects: string[] = []
  private readonly madeLists: string[] = []
  private readonly madeLabels: string[] = []
  private shared: { spaceId: string; containerId: string } | null = null
  private readonly containers = new Map<string, string>()
  private readonly labelCache = new Map<string, string>()
  private readonly fieldDefs = new Map<string, { id: string; type: ImFieldType; options: string[] }>()
  private readonly refToTask = new Map<string, string>()
  private readonly links: Array<{ from: string; to: string }> = []
  private byEmail = new Map<string, string>()
  private noStoreSaid = false

  constructor(
    private readonly db: Db,
    private readonly r2: R2Service | null,
    private readonly target: WriteTarget,
    /** Whom the importer mapped each of the tool's people to; a person not in it is matched by email. */
    private readonly people: Map<string, string | null>,
    notImported: string[] = [],
  ) {
    this.summary = emptySummary(target.source, notImported)
  }

  async begin(total: number) {
    await this.db
      .update(clickupImportJobs)
      .set({ status: 'processing', total, updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, this.target.jobId))
    const rows = await this.db
      .select({ userId: users.id, email: users.email, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, this.target.workspaceId))
    for (const r of rows) if (r.email && r.role !== 'guest') this.byEmail.set(r.email.trim().toLowerCase(), r.userId)
  }

  /** One chosen project, written; the job says how far the run is. */
  async node(n: ImNode, done: number) {
    let lists = 0
    let made = 0
    if (n.kind === 'space') {
      const place = this.target.spaceId ? await this.existing() : await this.newSpace(n.name)
      for (const f of n.folders) {
        const r = await this.folder(place.spaceId, f)
        lists += r.lists
        made += r.tasks
      }
      for (const [i, l] of n.lists.entries()) {
        made += await this.list(place.spaceId, place.containerId, l, i)
        lists++
      }
      this.summary.projects.push({ name: n.name, lists, tasks: made })
    } else {
      const place = this.target.spaceId ? await this.existing() : await this.sharedSpace()
      if (n.kind === 'folder') {
        const r = await this.folder(place.spaceId, n.folder)
        this.summary.projects.push({ name: n.folder.name, lists: r.lists, tasks: r.tasks })
      } else {
        const t = await this.list(place.spaceId, place.containerId, n.list, done)
        this.summary.projects.push({ name: n.list.name, lists: 1, tasks: t })
      }
    }
    await this.db
      .update(clickupImportJobs)
      .set({ processed: done + 1, createdCount: this.summary.tasksCreated, updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, this.target.jobId))
      .catch(() => undefined)
  }

  /** The links between tasks, once every task they name is here; and the job, done. */
  async finish() {
    for (const l of this.links) {
      const from = this.refToTask.get(l.from)
      const to = this.refToTask.get(l.to)
      if (!from || !to || from === to) continue
      await this.db
        .insert(taskDependencies)
        .values({ taskId: from, relatedTaskId: to, type: 'related_to', createdById: this.target.importer.id })
        .onConflictDoNothing()
      this.summary.linksMade++
    }
    await this.db
      .update(clickupImportJobs)
      .set({
        status: 'completed',
        processed: this.summary.projects.length,
        createdCount: this.summary.tasksCreated,
        result: storable(this.summary) as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(clickupImportJobs.id, this.target.jobId))
    return this.summary
  }

  /** What the run made, taken away; and the job, failed in the tool's words. */
  async fail(e: unknown) {
    try {
      if (this.madeLists.length) await this.db.delete(lists).where(inArray(lists.id, this.madeLists))
      if (this.madeProjects.length) await this.db.delete(projects).where(inArray(projects.id, this.madeProjects))
      if (this.madeSpaces.length) await this.db.delete(spaces).where(inArray(spaces.id, this.madeSpaces))
      if (this.madeLabels.length) {
        await this.db
          .delete(labels)
          .where(and(inArray(labels.id, this.madeLabels), sql`not exists (select 1 from ${taskLabelAssignments} where ${taskLabelAssignments.labelId} = ${labels.id})`))
      }
    } catch {
      // The job's error below still says why the run failed.
    }
    const message = e instanceof AppError ? e.message : e instanceof Error ? e.message : 'Import failed'
    await this.db
      .update(clickupImportJobs)
      .set({ status: 'failed', error: storable(message), createdCount: 0, updatedAt: new Date() })
      .where(eq(clickupImportJobs.id, this.target.jobId))
      .catch(() => undefined)
  }

  // ── where things go ──────────────────────────────────────────────────────────

  private async newSpace(name: string) {
    const [space] = await this.db
      .insert(spaces)
      .values({ workspaceId: this.target.workspaceId, name: name.slice(0, 200) || this.target.label, icon: this.target.icon, color: PALETTE[this.summary.spacesCreated % PALETTE.length] })
      .returning({ id: spaces.id })
    this.madeSpaces.push(space.id)
    this.summary.spacesCreated++
    if (this.summary.made.spaces.length < MAX_REPORTED) this.summary.made.spaces.push({ id: space.id, name })
    const [container] = await this.db
      .insert(projects)
      .values({ spaceId: space.id, name: 'Lists', isDefaultContainer: true, createdById: this.target.importer.id })
      .returning({ id: projects.id })
    this.containers.set(space.id, container.id)
    return { spaceId: space.id, containerId: container.id }
  }

  private async sharedSpace() {
    this.shared ??= await this.newSpace(this.target.newSpaceName)
    return this.shared
  }

  /** The Space chosen, and the container its Lists outside any Folder live in. */
  private async existing() {
    const spaceId = this.target.spaceId!
    let containerId = this.containers.get(spaceId)
    if (!containerId) {
      const [found] = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.spaceId, spaceId), eq(projects.isDefaultContainer, true)))
        .limit(1)
      if (found) containerId = found.id
      else {
        const [made] = await this.db
          .insert(projects)
          .values({ spaceId, name: 'Lists', isDefaultContainer: true, createdById: this.target.importer.id })
          .returning({ id: projects.id })
        this.madeProjects.push(made.id)
        containerId = made.id
      }
      this.containers.set(spaceId, containerId)
    }
    return { spaceId, containerId }
  }

  private async folder(spaceId: string, f: ImFolder) {
    const [row] = await this.db
      .insert(projects)
      .values({ spaceId, name: f.name.slice(0, 200) || 'Folder', description: f.description?.slice(0, 2000) || null, createdById: this.target.importer.id })
      .returning({ id: projects.id })
    this.madeProjects.push(row.id)
    this.summary.foldersCreated++
    if (this.summary.made.folders.length < MAX_REPORTED) this.summary.made.folders.push({ id: row.id, name: f.name })
    let made = 0
    for (const [i, l] of f.lists.entries()) made += await this.list(spaceId, row.id, l, i)
    return { lists: f.lists.length, tasks: made }
  }

  // ── a List and its tasks ─────────────────────────────────────────────────────

  private async list(spaceId: string, containerId: string, l: ImList, position: number): Promise<number> {
    const name = l.name.trim().slice(0, 200) || 'Imported'
    const [row] = await this.db
      .insert(lists)
      .values({ projectId: containerId, spaceId, name, description: l.description?.slice(0, 2000) || null, position, createdById: this.target.importer.id })
      .returning({ id: lists.id })
    this.madeLists.push(row.id)
    this.summary.listsCreated++
    if (this.summary.made.lists.length < MAX_REPORTED) this.summary.made.lists.push({ id: row.id, name })
    const rows = statusRows(l.statuses)
    await this.db.insert(listStatuses).values(rows.map((r) => ({ listId: row.id, ...r }))).onConflictDoNothing()
    if (l.statuses?.length) this.summary.statusesCreated += rows.length
    let made = 0
    for (const [n, t] of l.tasks.entries()) {
      made += await this.task(row.id, containerId, rows, t, n, null, 0)
    }
    return made
  }

  /** A task and its subtasks; how many tasks it made. Subtasks nest one level here, so a deeper one comes in one level up. */
  private async task(listId: string, containerId: string, rows: StatusRow[], t: ImTask, position: number, parentId: string | null, depth: number): Promise<number> {
    let taskId: string
    const title = t.title.trim().slice(0, 500) || 'Untitled'
    try {
      const place = placeStatus(rows, t.status, t.done)
      const closed = place.category === 'closed'
      const [row] = await this.db
        .insert(tasks)
        .values({
          listId,
          parentTaskId: parentId,
          createdById: this.target.importer.id,
          title,
          description: t.description ? storable(t.description) : null,
          status: place.key,
          statusCategory: place.category,
          completedAt: closed ? (t.doneAt ?? new Date()) : null,
          position,
          dueDate: t.due,
          dueDateHasTime: !!t.due && t.dueHasTime,
          startDate: t.start,
          ...(t.priority ? { priority: t.priority } : {}),
          ...(t.created ? { createdAt: t.created } : {}),
        })
        .returning({ id: tasks.id })
      taskId = row.id
      this.refToTask.set(t.ref, taskId)
      this.summary.tasksCreated++
      if (parentId) this.summary.subtasksCreated++
      if (closed) this.summary.tasksDone++
      for (const to of t.links) this.links.push({ from: t.ref, to })
      await this.assign(taskId, title, t.assignees)
      await this.tags(taskId, t.tags)
      await this.checklists(taskId, t.checklists)
      await this.fields(taskId, containerId, listId, title, t.fields)
      if (t.details) {
        const { comments, files } = await t.details()
        for (const c of comments) await this.comment(taskId, c)
        for (const f of files) await this.file(taskId, title, f)
      }
    } catch (e: any) {
      // The grant refused mid-run is the run's end; anything else is this task's, said, and the run goes on.
      if (e instanceof AppError && e.status === 401) throw e
      this.summary.errors.push(`"${title}": ${e?.message ?? 'unknown error'}`)
      return 0
    }
    let made = 1
    for (const [n, s] of t.subtasks.entries()) {
      if (depth >= 1) this.summary.subtasksFlattened++
      made += await this.task(listId, containerId, rows, s, n, depth >= 1 ? parentId! : taskId, depth + 1)
    }
    return made
  }

  /** Whom a person of the tool is here: the one the importer mapped them to, else the member with their email. */
  private whom(p: ImPerson | null): string | null {
    if (!p) return null
    if (this.people.has(p.key)) return this.people.get(p.key) ?? null
    return p.email ? this.byEmail.get(p.email.trim().toLowerCase()) ?? null : null
  }

  private async assign(taskId: string, title: string, assignees: ImPerson[]) {
    for (const p of assignees) {
      const userId = this.whom(p)
      if (!userId) {
        this.summary.assigneesUnmatched++
        continue
      }
      // Whom the assignee route would put on it, and the report says who was not.
      if (!(await IMPORT_ACCESS.mayBeAssigned(this.db, { workspaceId: this.target.workspaceId, taskId, userId }))) {
        this.summary.assigneesUnmatched++
        this.summary.errors.push(`"${title}": ${p.name ?? p.email ?? 'someone'} ${MAY_NOT_BE_ASSIGNED}`)
        continue
      }
      await this.db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing()
      this.summary.assigneesLinked++
    }
  }

  /** A tag found whatever its case, made when the workspace has none by that name (as `ensureLabel`). */
  private async label(name: string): Promise<string | null> {
    const full = name.trim()
    const key = full.toLowerCase()
    if (!key) return null
    const cached = this.labelCache.get(key)
    if (cached) return cached
    const stored = full.slice(0, 60)
    const named = and(eq(labels.workspaceId, this.target.workspaceId), sql`lower(${labels.name}) in (lower(${full}), lower(${stored}))`)
    const [existing] = await this.db.select({ id: labels.id }).from(labels).where(named).limit(1)
    if (existing) {
      this.labelCache.set(key, existing.id)
      return existing.id
    }
    const [row] = await this.db.insert(labels).values({ workspaceId: this.target.workspaceId, name: stored, color: '#8b5cf6' }).onConflictDoNothing().returning({ id: labels.id })
    const id = row?.id ?? (await this.db.select({ id: labels.id }).from(labels).where(named).limit(1))[0]?.id ?? null
    if (row) {
      this.madeLabels.push(row.id)
      this.summary.labelsCreated++
    }
    if (id) this.labelCache.set(key, id)
    return id
  }

  private async tags(taskId: string, names: string[]) {
    for (const name of new Set(names.map((n) => n.trim()).filter(Boolean))) {
      const labelId = await this.label(name)
      if (!labelId) continue
      await this.db.insert(taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing()
      this.summary.tagsApplied++
    }
  }

  private async checklists(taskId: string, all: ImChecklist[]) {
    for (const [n, c] of all.entries()) {
      const [row] = await this.db
        .insert(taskChecklists)
        .values({ taskId, title: c.name.slice(0, 500) || 'Checklist', position: n })
        .returning({ id: taskChecklists.id })
      if (c.items.length) {
        await this.db.insert(taskChecklistItems).values(
          c.items.map((it, i) => ({ checklistId: row.id, content: it.name.slice(0, 2000) || '—', isDone: it.done, position: i, completedAt: it.done ? new Date() : null })),
        )
      }
      this.summary.checklistsImported++
    }
  }

  /** A field of the List, made the first time a task of it has a value; the task's value on it. */
  private async fields(taskId: string, containerId: string, listId: string, title: string, values: ImFieldValue[]) {
    for (const f of values) {
      const name = f.name.trim().slice(0, 200)
      if (!name) continue
      const key = `${listId}\u0000${name.toLowerCase()}`
      let def = this.fieldDefs.get(key)
      try {
        if (!def) {
          const options = f.type === 'dropdown' ? [...new Set((f.options ?? [String(f.value)]).map((o) => o.trim()).filter(Boolean))] : []
          const [row] = await this.db
            .insert(customFieldDefinitions)
            .values({
              projectId: containerId,
              listId,
              name,
              type: f.type,
              options: f.type === 'dropdown' ? options.map((o) => ({ label: o, value: o })) : null,
              position: this.summary.fieldsCreated,
            })
            .returning({ id: customFieldDefinitions.id })
          def = { id: row.id, type: f.type, options }
          this.fieldDefs.set(key, def)
          this.summary.fieldsCreated++
        }
        const v = valueFor(def.type, f.value)
        if (v === null) continue
        await this.db
          .insert(customFieldValues)
          .values({ taskId, fieldId: def.id, value: { v } })
          .onConflictDoUpdate({ target: [customFieldValues.taskId, customFieldValues.fieldId], set: { value: { v }, updatedAt: new Date() } })
        this.summary.fieldValuesSet++
      } catch (e: any) {
        this.summary.errors.push(`Field "${name}" on "${title}": ${e?.message ?? 'unknown error'}`)
      }
    }
  }

  /**
   * A comment under its author when the importer mapped them, or they are a
   * member here by email; else under the importer, with the author's name and
   * moment at its head, as the other importers file one they cannot place.
   */
  private async comment(taskId: string, c: ImComment) {
    const text = c.text.trim()
    const author = this.whom(c.author)
    const when = c.at && !Number.isNaN(c.at.getTime()) ? c.at : null
    const who = c.author?.name ?? c.author?.email ?? 'Someone'
    const body = author ? text : `**${who}** _(${this.target.label} comment · ${when ? when.toISOString() : 'unknown date'})_\n\n${text}`.trim()
    await this.db.insert(taskComments).values({
      taskId,
      authorId: author ?? this.target.importer.id,
      body: storable(body || `(empty ${this.target.label} comment)`),
      ...(when ? { createdAt: when } : {}),
    })
    this.summary.commentsImported++
  }

  /** A file into the store, beside the task's own, when the store is set up; said when it is not. */
  private async file(taskId: string, title: string, f: ImFileRef) {
    if (!this.r2?.configured) {
      this.summary.attachmentsSkipped++
      if (!this.noStoreSaid) {
        this.noStoreSaid = true
        this.summary.errors.push(`Files were not imported: file storage is not configured on this server`)
      }
      return
    }
    const got = await f.fetch().catch(() => null)
    if (!got) {
      this.summary.attachmentsSkipped++
      this.summary.errors.push(`"${title}": the file "${f.name}" could not be read from ${this.target.label}, or is larger than an import takes`)
      return
    }
    const fileName = f.name.trim().slice(0, 255) || 'file'
    const key = `workspaces/${this.target.workspaceId}/tasks/${taskId}/attachments/${Date.now()}-${safeFileName(fileName, 'file')}`
    await this.r2.putObject(key, got.buffer, got.contentType, { source: `${this.target.source}-import` })
    await this.db.insert(taskAttachments).values({
      taskId,
      uploadedById: this.target.importer.id,
      fileName,
      contentType: got.contentType,
      sizeBytes: got.buffer.length,
      storageKey: key,
    })
    this.summary.attachmentsImported++
  }
}

/** A value as its field keeps it (`{ v }`), or null when it is none of that type. */
export function valueFor(type: ImFieldType, raw: string | number | boolean): string | number | boolean | null {
  switch (type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      return String(raw).trim() !== '' && Number.isFinite(n) ? n : null
    }
    case 'checkbox':
      return typeof raw === 'boolean' ? raw : /^(true|yes|1|checked|v)$/i.test(String(raw).trim())
    case 'date': {
      const d = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? new Date(`${raw.trim()}T00:00:00Z`) : new Date(String(raw))
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    default: {
      const s = String(raw).trim()
      return s ? s.slice(0, 5000) : null
    }
  }
}
