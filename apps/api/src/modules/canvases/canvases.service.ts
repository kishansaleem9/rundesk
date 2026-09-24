import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import { workspaceCanvases, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'

@Injectable()
export class CanvasesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly realtime: RealtimeGateway,
  ) {}

  /*
   * A GUEST HAS NO WHITEBOARD OR MIND MAP. A guest reads only what is shared
   * with them, and a canvas cannot be shared here (a share names a space,
   * folder, project, list, task, doc, channel, dashboard or view), so, as with
   * goals, a guest lists none, opens none and makes none. Every one was theirs
   * by membership alone (`found-24-sep/guests-list-every-whiteboard`).
   */
  private async isGuest(workspaceId: string, userId: string): Promise<boolean> {
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return m?.role === 'guest'
  }

  private async assertNotGuest(workspaceId: string, userId: string) {
    if (await this.isGuest(workspaceId, userId)) throw new ForbiddenException('Guests have no whiteboards or mind maps')
  }

  async list(workspaceId: string, type?: string, actorId?: string) {
    if (type && !this.isSupportedType(type)) throw new BadRequestException('Unsupported canvas type')
    if (actorId && (await this.isGuest(workspaceId, actorId))) return []
    const base = this.db.select().from(workspaceCanvases)
    const rows = type
      ? await base.where(and(eq(workspaceCanvases.workspaceId, workspaceId), eq(workspaceCanvases.type, type))).orderBy(desc(workspaceCanvases.updatedAt))
      : await base.where(eq(workspaceCanvases.workspaceId, workspaceId)).orderBy(desc(workspaceCanvases.updatedAt))
    return rows
  }

  async create(workspaceId: string, userId: string, body: { type: string; title: string; data?: unknown }) {
    if (!this.isSupportedType(body.type)) throw new BadRequestException('Unsupported canvas type')
    await this.assertNotGuest(workspaceId, userId)
    const [row] = await this.db
      .insert(workspaceCanvases)
      .values({
        workspaceId,
        type: body.type,
        title: body.title,
        data: (body.data ?? {}) as Record<string, unknown>,
        createdById: userId,
      })
      .returning()
    this.realtime.emitToWorkspace(workspaceId, {
      type: 'canvas.created',
      workspaceId,
      canvas: row,
      actorId: userId,
    })
    return row
  }

  async get(workspaceId: string, canvasId: string, actorId?: string) {
    if (actorId && (await this.isGuest(workspaceId, actorId))) throw new NotFoundException('Canvas not found')
    const [row] = await this.db
      .select()
      .from(workspaceCanvases)
      .where(and(eq(workspaceCanvases.id, canvasId), eq(workspaceCanvases.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Canvas not found')
    return row
  }

  async update(
    workspaceId: string,
    canvasId: string,
    actorId: string,
    body: { title?: string; data?: unknown; type?: string; expectedUpdatedAt?: string },
  ) {
    if (body.type && !this.isSupportedType(body.type)) throw new BadRequestException('Unsupported canvas type')
    await this.assertNotGuest(workspaceId, actorId)
    if (body.expectedUpdatedAt) {
      const [current] = await this.db
        .select({ updatedAt: workspaceCanvases.updatedAt })
        .from(workspaceCanvases)
        .where(and(eq(workspaceCanvases.id, canvasId), eq(workspaceCanvases.workspaceId, workspaceId)))
        .limit(1)
      if (!current) throw new NotFoundException('Canvas not found')
      const expected = new Date(body.expectedUpdatedAt).getTime()
      const actual = current.updatedAt ? new Date(current.updatedAt).getTime() : NaN
      if (!Number.isFinite(expected) || expected !== actual) {
        throw new ConflictException('Canvas was updated by someone else. Please refresh and try again.')
      }
    }
    const [row] = await this.db
      .update(workspaceCanvases)
      .set({
        title: body.title,
        data: body.data as Record<string, unknown> | undefined,
        type: body.type,
        updatedAt: new Date(),
      })
      .where(and(eq(workspaceCanvases.id, canvasId), eq(workspaceCanvases.workspaceId, workspaceId)))
      .returning()
    if (!row) throw new NotFoundException('Canvas not found')
    this.realtime.emitToWorkspace(workspaceId, {
      type: 'canvas.updated',
      workspaceId,
      canvasId,
      patch: {
        title: row.title,
        type: row.type,
        data: row.data as Record<string, unknown>,
        updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
      },
      actorId,
    })
    return row
  }

  async remove(workspaceId: string, canvasId: string, actorId: string) {
    await this.assertNotGuest(workspaceId, actorId)
    await this.db
      .delete(workspaceCanvases)
      .where(and(eq(workspaceCanvases.id, canvasId), eq(workspaceCanvases.workspaceId, workspaceId)))
    this.realtime.emitToWorkspace(workspaceId, {
      type: 'canvas.deleted',
      workspaceId,
      canvasId,
      actorId,
    })
    return { ok: true }
  }

  private isSupportedType(type: string) {
    return type === 'whiteboard' || type === 'mindmap'
  }
}
