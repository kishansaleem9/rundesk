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
import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

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
  ) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string | undefined)
      ?? (client.handshake.query?.token as string | undefined)
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

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rooms: RoomKey[] },
  ) {
    if (!Array.isArray(body?.rooms)) return { ok: false, error: 'rooms must be an array' }
    for (const room of body.rooms) client.join(room)
    return { ok: true, joined: body.rooms }
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
