import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, desc, isNull, gte, sql } from 'drizzle-orm'
import { timeEntries, tasks, lists, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

@Injectable()
export class TimeEntriesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async listForWorkspace(workspaceId: string, opts: { userId?: string; since?: Date } = {}) {
    const where = and(
      eq(spaces.workspaceId, workspaceId),
      opts.userId ? eq(timeEntries.userId, opts.userId) : undefined,
      opts.since ? gte(timeEntries.startedAt, opts.since) : undefined,
    )
    const rows = await this.db
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        userId: timeEntries.userId,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSec: timeEntries.durationSec,
        description: timeEntries.description,
        isBillable: timeEntries.isBillable,
        createdAt: timeEntries.createdAt,
        taskTitle: tasks.title,
      })
      .from(timeEntries)
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(lists, eq(lists.id, tasks.listId))
      .leftJoin(projects, eq(projects.id, lists.projectId))
      .leftJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(where)
      .orderBy(desc(timeEntries.startedAt))
      .limit(500)
    return rows.map((r) => ({
      ...r,
      // Frontend expected field name compatibility
      durationSeconds: r.durationSec ?? 0,
      billable: r.isBillable,
      loggedAt: r.startedAt,
    }))
  }

  async getRunning(userId: string) {
    const [row] = await this.db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
      .orderBy(desc(timeEntries.startedAt))
      .limit(1)
    return row ?? null
  }

  async start(userId: string, taskId: string, description?: string, isBillable?: boolean) {
    // Stop any existing running timer for this user
    const running = await this.getRunning(userId)
    if (running) await this.stop(running.id, userId)
    const [row] = await this.db
      .insert(timeEntries)
      .values({
        userId,
        taskId,
        startedAt: new Date(),
        description,
        isBillable: isBillable ?? false,
      })
      .returning()
    return row
  }

  async stop(entryId: string, userId: string) {
    const [existing] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, entryId))
    if (!existing) throw new NotFoundException('Entry not found')
    if (existing.userId !== userId) throw new ForbiddenException('Not your timer')
    if (existing.endedAt) return existing
    const endedAt = new Date()
    const durationSec = Math.floor((endedAt.getTime() - new Date(existing.startedAt).getTime()) / 1000)
    const [row] = await this.db
      .update(timeEntries)
      .set({ endedAt, durationSec, updatedAt: new Date() })
      .where(eq(timeEntries.id, entryId))
      .returning()
    return row
  }

  async createManual(data: {
    userId: string
    taskId: string
    durationSec: number
    startedAt?: Date
    description?: string
    isBillable?: boolean
  }) {
    const startedAt = data.startedAt ?? new Date()
    const endedAt = new Date(startedAt.getTime() + data.durationSec * 1000)
    const [row] = await this.db
      .insert(timeEntries)
      .values({
        userId: data.userId,
        taskId: data.taskId,
        startedAt,
        endedAt,
        durationSec: data.durationSec,
        description: data.description,
        isBillable: data.isBillable ?? false,
      })
      .returning()
    return row
  }

  async update(
    entryId: string,
    userId: string,
    patch: { durationSec?: number; description?: string | null; isBillable?: boolean; startedAt?: Date },
  ) {
    const [existing] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, entryId))
    if (!existing) throw new NotFoundException('Entry not found')
    if (existing.userId !== userId) throw new ForbiddenException('Not your entry')
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (typeof patch.durationSec === 'number' && patch.startedAt) {
      set.endedAt = new Date(patch.startedAt.getTime() + patch.durationSec * 1000)
    }
    const [row] = await this.db.update(timeEntries).set(set).where(eq(timeEntries.id, entryId)).returning()
    return row
  }

  async remove(entryId: string, userId: string) {
    const [existing] = await this.db.select().from(timeEntries).where(eq(timeEntries.id, entryId))
    if (!existing) throw new NotFoundException('Entry not found')
    if (existing.userId !== userId) throw new ForbiddenException('Not your entry')
    await this.db.delete(timeEntries).where(eq(timeEntries.id, entryId))
    return { ok: true }
  }
}
