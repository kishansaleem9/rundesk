import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger, Inject } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, lists, projects, spaces, tasks, docs, workspaceCanvases } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { PresenceService } from '../presence/presence.service'
import { ACCESS_TOKEN_COOKIE } from '../auth/auth-cookies'

/**
 * Extract the access_token from a raw Cookie header. Browser sessions no longer
 * keep the JWT in JS (it lives in an httpOnly cookie), so the socket handshake
 * can't pass it via `auth.token`; the cookie rides along automatically instead.
 */
function accessTokenFromCookieHeader(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === ACCESS_TOKEN_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return undefined
}

/**
 * Room taxonomy:
 *   workspace:{workspaceId}         - workspace-wide events (notifications, members)
 *   list:{listId}                   - list-level events (task.created, task.updated, task.deleted)
 *   task:{taskId}                   - task-detail events (comments, activity, checklist, watchers)
 *   doc:{docId}                     - per-doc updates (presence, content patches)
 *   canvas:{canvasId}               - per-canvas presence + collaborator cursors
 *   user:{userId}                   - private user channel (notifications, cross-tab sync)
 */
export type RoomKey =
  | `workspace:${string}`
  | `list:${string}`
  | `task:${string}`
  | `doc:${string}`
  | `canvas:${string}`
  | `user:${string}`

export type RealtimeEvent =
  // Task events
  | { type: 'task.created';  listId: string; task: unknown }
  | { type: 'task.updated';  listId: string; taskId: string; patch: Record<string, unknown> }
  | { type: 'task.deleted';  listId: string; taskId: string }
  | { type: 'task.moved';    listId: string; taskId: string; toListId: string }
  // Task detail sub-events
  | { type: 'comment.created'; taskId: string; comment: unknown }
  | { type: 'comment.updated'; taskId: string; commentId: string; patch: Record<string, unknown> }
  | { type: 'comment.deleted'; taskId: string; commentId: string }
  | { type: 'activity.created'; taskId: string; activity: unknown }
  | { type: 'checklist.updated'; taskId: string }
  | { type: 'watchers.updated'; taskId: string }
  // Doc events
  | { type: 'doc.updated'; docId: string; patch: Record<string, unknown> }
  | { type: 'doc.comment.created'; docId: string; commentId: string; parentCommentId: string | null }
  | { type: 'doc.comment.updated'; docId: string; commentId: string }
  | { type: 'doc.comment.resolution_changed'; docId: string; commentId: string; isResolved: boolean }
  | { type: 'doc.comment.removed'; docId: string; commentId: string }
  // Presence
  | { type: 'presence.join'; room: RoomKey; user: { id: string; displayName: string } }
  | { type: 'presence.leave'; room: RoomKey; userId: string }
  // Notifications
  | { type: 'notification.created'; userId: string; notification: unknown }
  // Chat events
  | { type: 'chat.channel.created'; workspaceId: string; channel: unknown }
  | { type: 'chat.channel.members.added'; workspaceId: string; channelId: string }
  | { type: 'chat.channel.members.updated'; workspaceId: string; channelId: string }
  | { type: 'chat.message.created'; workspaceId: string; channelId: string; message: unknown }
  | { type: 'chat.message.updated'; workspaceId: string; channelId: string; messageId: string; patch: Record<string, unknown> }
  | { type: 'chat.message.deleted'; workspaceId: string; channelId: string; messageId: string }
  | { type: 'chat.reaction.toggled'; workspaceId: string; channelId: string; messageId: string }
  // Canvas collaboration events
  | { type: 'canvas.created'; workspaceId: string; canvas: unknown; actorId?: string }
  | { type: 'canvas.updated'; workspaceId: string; canvasId: string; patch: Record<string, unknown>; actorId?: string }
  | { type: 'canvas.deleted'; workspaceId: string; canvasId: string; actorId?: string }
  | {
      type: 'canvas.cursor'
      canvasId: string
      userId: string
      displayName: string
      x: number
      y: number
      color?: string
    }
  | { type: 'canvas.cursor.leave'; canvasId: string; userId: string }

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('RealtimeGateway')

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly presence: PresenceService,
  ) {}

  /** Resolve the owning workspace for a room key, or null if it can't be resolved. */
  private async resolveWorkspaceForRoom(kind: string, id: string): Promise<string | null> {
    if (kind === 'workspace') return id
    if (kind === 'doc') {
      const [d] = await this.db.select({ w: docs.workspaceId }).from(docs).where(eq(docs.id, id)).limit(1)
      return d?.w ?? null
    }
    if (kind === 'canvas') {
      const [c] = await this.db.select({ w: workspaceCanvases.workspaceId }).from(workspaceCanvases).where(eq(workspaceCanvases.id, id)).limit(1)
      return c?.w ?? null
    }
    if (kind === 'list') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(lists.id, id))
        .limit(1)
      return r?.w ?? null
    }
    if (kind === 'task') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(tasks.id, id))
        .limit(1)
      return r?.w ?? null
    }
    return null
  }

  /** A socket may only join a room it is authorized for (own user channel, or a
   *  workspace it belongs to — resolved transitively for list/task/doc/canvas). */
  private async canJoinRoom(client: Socket, room: string): Promise<boolean> {
    const userId = (client.data as { userId?: string })?.userId
    if (!userId) return false
    const idx = room.indexOf(':')
    if (idx < 0) return false
    const kind = room.slice(0, idx)
    const id = room.slice(idx + 1)
    if (!id) return false
    if (kind === 'user') return id === userId
    const workspaceId = await this.resolveWorkspaceForRoom(kind, id)
    if (!workspaceId) return false
    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return !!membership
  }

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string | undefined)
      ?? (client.handshake.query?.token as string | undefined)
      ?? accessTokenFromCookieHeader(client.handshake.headers?.cookie)
    if (!token) {
      client.emit('error', { message: 'Missing auth token' })
      client.disconnect(true)
      return
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      })
      ;(client.data as { userId: string; email: string; role: string }).userId = payload.sub
      ;(client.data as { userId: string; email: string; role: string }).email = payload.email
      ;(client.data as { userId: string; email: string; role: string }).role  = payload.role
      // Auto-join the user's private channel.
      client.join(`user:${payload.sub}`)
      // Presence heartbeat: mark online as soon as the socket authenticates.
      void this.presence.recordHeartbeat(payload.sub).catch(() => undefined)
      this.logger.debug(`connected ${client.id} -> user:${payload.sub}`)
    } catch {
      client.emit('error', { message: 'Invalid token' })
      client.disconnect(true)
    }
  }

  handleDisconnect(client: Socket) {
    // Broadcast a cursor-leave to every canvas room the socket was in so
    // remote clients can drop the avatar immediately instead of waiting for
    // a stale-cursor sweep.
    const data = client.data as { userId?: string }
    if (data?.userId) {
      for (const room of client.rooms) {
        if (typeof room === 'string' && room.startsWith('canvas:')) {
          const canvasId = room.slice('canvas:'.length)
          this.server?.to(room).emit('event', {
            type: 'canvas.cursor.leave',
            canvasId,
            userId: data.userId,
          } satisfies RealtimeEvent)
        }
      }
    }
    this.logger.debug(`disconnected ${client.id}`)
  }

  /** Keep-alive heartbeat from the client (~every 60s) so presence stays fresh. */
  @SubscribeMessage('presence.ping')
  handlePresencePing(@ConnectedSocket() client: Socket) {
    const userId = (client.data as { userId?: string })?.userId
    if (userId) void this.presence.recordHeartbeat(userId).catch(() => undefined)
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rooms: RoomKey[] },
  ) {
    if (!Array.isArray(body?.rooms)) return { ok: false, error: 'rooms must be an array' }
    const joined: string[] = []
    const denied: string[] = []
    for (const room of body.rooms) {
      if (await this.canJoinRoom(client, room)) {
        client.join(room)
        joined.push(room)
      } else {
        denied.push(room)
      }
    }
    return { ok: true, joined, denied }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rooms: RoomKey[] },
  ) {
    if (!Array.isArray(body?.rooms)) return { ok: false, error: 'rooms must be an array' }
    for (const room of body.rooms) client.leave(room)
    return { ok: true, left: body.rooms }
  }

  /**
   * Collaborator cursor broadcast for whiteboards / mind maps. Receives a
   * raw {canvasId, x, y} payload from the client, stamps it with the
   * connection's authenticated identity, and fans out to all other sockets
   * in the canvas room. Sender is excluded so a client never sees its own
   * cursor reflected back.
   */
  @SubscribeMessage('canvas.cursor')
  handleCanvasCursor(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { canvasId?: string; x?: number; y?: number; color?: string; displayName?: string },
  ) {
    const data = client.data as { userId?: string; email?: string }
    if (!data?.userId || !body?.canvasId || typeof body.x !== 'number' || typeof body.y !== 'number') {
      return { ok: false }
    }
    const event: RealtimeEvent = {
      type: 'canvas.cursor',
      canvasId: body.canvasId,
      userId: data.userId,
      displayName: body.displayName ?? data.email ?? data.userId,
      x: body.x,
      y: body.y,
      color: body.color,
    }
    client.to(`canvas:${body.canvasId}`).emit('event', event)
    return { ok: true }
  }

  @SubscribeMessage('canvas.cursor.leave')
  handleCanvasCursorLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { canvasId?: string },
  ) {
    const data = client.data as { userId?: string }
    if (!data?.userId || !body?.canvasId) return { ok: false }
    const event: RealtimeEvent = {
      type: 'canvas.cursor.leave',
      canvasId: body.canvasId,
      userId: data.userId,
    }
    client.to(`canvas:${body.canvasId}`).emit('event', event)
    return { ok: true }
  }

  /**
   * §2.8 SyncUp — WebRTC signalling relay.
   *
   * Offers, answers and ICE candidates go peer-to-peer once the handshake is
   * done; until then they need a courier, and this is it. The server reads
   * nothing but the address: `to` is the peer, and the payload is opaque.
   *
   * The SENDER's identity comes from the socket, never from the body. A client
   * that could name its own `from` could impersonate a colleague in a call —
   * offering a stream that appears to come from someone else — and nothing
   * downstream would question it.
   */
  @SubscribeMessage('call.signal')
  handleCallSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId?: string; to?: string; signal?: unknown },
  ) {
    const data = client.data as { userId?: string }
    if (!data?.userId || !body?.callId || !body?.to || !body?.signal) return { ok: false }
    // Relayed to the named user only, not broadcast: an offer is for one peer,
    // and fanning it out would have everyone answer the same handshake.
    this.emitToUser(body.to, {
      type: 'call.signal',
      callId: body.callId,
      from: data.userId,
      signal: body.signal,
    } as never)
    return { ok: true }
  }

  /**
   * §2.8 — an in-call reaction, `[20:47]`: "Agar main koi reaction doongi to
   * woh yahan pe show ho jaata hai."
   *
   * Not persisted anywhere. A reaction is a thing that happens and then is
   * over; writing it down would leave a channel full of thumbs-ups nobody
   * meant to keep.
   */
  @SubscribeMessage('call.reaction')
  handleCallReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId?: string; workspaceId?: string; emoji?: string },
  ) {
    const data = client.data as { userId?: string }
    if (!data?.userId || !body?.callId || !body?.workspaceId || !body?.emoji) return { ok: false }
    // Bounded: an emoji is one or two code points, and a "reaction" carrying a
    // paragraph is not a reaction.
    const emoji = String(body.emoji).slice(0, 8)
    this.emitToWorkspace(body.workspaceId, {
      type: 'call.reaction',
      workspaceId: body.workspaceId,
      callId: body.callId,
      userId: data.userId,
      emoji,
    } as never)
    return { ok: true }
  }

  // --- Broadcast helpers ----------------------------------------------------
  emitToRoom(room: RoomKey, event: RealtimeEvent) {
    this.server?.to(room).emit('event', event)
  }

  emitToUser(userId: string, event: RealtimeEvent) {
    this.server?.to(`user:${userId}`).emit('event', event)
  }

  emitToList(listId: string, event: RealtimeEvent) {
    this.server?.to(`list:${listId}`).emit('event', event)
  }

  emitToTask(taskId: string, event: RealtimeEvent) {
    this.server?.to(`task:${taskId}`).emit('event', event)
  }

  emitToWorkspace(workspaceId: string, event: RealtimeEvent) {
    this.server?.to(`workspace:${workspaceId}`).emit('event', event)
  }

  emitToDoc(docId: string, event: RealtimeEvent) {
    this.server?.to(`doc:${docId}`).emit('event', event)
  }
}
