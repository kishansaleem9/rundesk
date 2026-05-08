import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import { workspaceCanvases } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'

@Injectable()
export class CanvasesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(workspaceId: string, type?: string) {
    if (type && !this.isSupportedType(type)) throw new BadRequestException('Unsupported canvas type')
    const base = this.db.select().from(workspaceCanvases)
    const rows = type
      ? await base.where(and(eq(workspaceCanvases.workspaceId, workspaceId), eq(workspaceCanvases.type, type))).orderBy(desc(workspaceCanvases.updatedAt))
      : await base.where(eq(workspaceCanvases.workspaceId, workspaceId)).orderBy(desc(workspaceCanvases.updatedAt))
    return rows
  }

  async create(workspaceId: string, userId: string, body: { type: string; title: string; data?: unknown }) {
    if (!this.isSupportedType(body.type)) throw new BadRequestException('Unsupported canvas type')
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

  async get(workspaceId: string, canvasId: string) {
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
