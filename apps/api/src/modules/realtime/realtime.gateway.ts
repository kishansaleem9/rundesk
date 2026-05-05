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
 *   user:{userId}                   - private user channel (notifications, cross-tab sync)
 */
export type RoomKey =
  | `workspace:${string}`
  | `list:${string}`
  | `task:${string}`
  | `doc:${string}`
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
