import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger, Inject, OnModuleDestroy } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, lists, projects, spaces, tasks, taskAssignees, docs, workspaceCanvases } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { checkContainerAccess } from '../../common/permissions/container-access.guard-helper'
import { canSeePrivateItem, isManagerRole } from '../../common/permissions/item-visibility'
import { canReadDoc } from '../../common/permissions/doc-access'
import { PresenceService } from '../presence/presence.service'
import { ACCESS_TOKEN_COOKIE } from '../auth/auth-cookies'
import { guestMayRead, guestReachesList } from '../../common/permissions/guest-reach'
import { sessionIsLive } from '../../common/security/live-session'

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
  // §G11 [15:36] — an assignment appeared on, or came off, a message. Carries
  // only ids: everyone in the channel refetches, and who a message is assigned
  // to is the same fact for all of them.
  | { type: 'chat.message.assigned'; workspaceId: string; channelId: string; messageId: string }
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
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger('RealtimeGateway')

  /**
   * HOW OFTEN A LIVE SOCKET'S SESSION IS RE-READ
   * (`found-30-sep/an-open-socket-outlives-its-session`). "Within seconds" of
   * a session ending its sockets go; the presence ping (every ~60s) re-reads
   * too, between sweeps. A read per distinct session per sweep, so the cost is
   * the live sessions holding a socket, not the sockets.
   */
  private static readonly REVOKED_SWEEP_MS = 5_000
  private revokedSweep?: ReturnType<typeof setInterval>

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Start the revoked-session sweep once the namespace is up. Not in the
   * constructor: the unit tests build the gateway directly and never init it,
   * so nothing starts a timer there.
   *
   * A SWEEP THAT FAILS IS SAID, AND THE NEXT ONE ASKS AGAIN. A rejection left
   * unheard in a timer ends the process (Node's default for an unhandled
   * rejection), and with it every socket and request it holds: measured on a
   * lane, the lane's database refused connections for eight seconds while one
   * socket was open, the sweep's read failed, and the API exited and stayed
   * down after the database came back — where a request in the same outage
   * answers 500 and the process goes on. So the tick catches what the sweep
   * throws (`disconnectRevokedSockets` already keeps a failed read from
   * throwing; this is for anything else).
   */
  afterInit() {
    if (this.revokedSweep) return
    this.revokedSweep = setInterval(() => {
      this.disconnectRevokedSockets().catch((err: unknown) =>
        this.logger.warn(`revoked-session sweep failed: ${err instanceof Error ? err.message : String(err)}`),
      )
    }, RealtimeGateway.REVOKED_SWEEP_MS)
    // Does not hold the process open on its own.
    this.revokedSweep.unref?.()
  }

  onModuleDestroy() {
    if (this.revokedSweep) {
      clearInterval(this.revokedSweep)
      this.revokedSweep = undefined
    }
  }

  /**
   * The sockets connected to THIS process's `/realtime` namespace. `this.server`
   * is that namespace (its `to(room)` reaches these sockets), and a namespace's
   * `sockets` is a Map of its local sockets; the fallback covers a binding that
   * hands the root server instead.
   */
  private localSockets(): Socket[] {
    const s = this.server as unknown as { sockets?: unknown }
    if (s?.sockets instanceof Map) return [...s.sockets.values()] as Socket[]
    const nested = (s?.sockets as { sockets?: unknown } | undefined)?.sockets
    if (nested instanceof Map) return [...nested.values()] as Socket[]
    return []
  }

  /**
   * A SOCKET STOPS HEARING ITS ROOMS WHEN ITS SESSION ENDS
   * (`found-30-sep/an-open-socket-outlives-its-session`).
   *
   * The handshake reads the token's session once (`admit`); nothing looked at
   * an open socket again, so a socket opened before its session was revoked (a
   * password change, a reset, "sign out other sessions", revoking one, signing
   * out, the session cap) stayed connected and heard every room event for as
   * long as its connection lasted — nothing ended it when its access token ran
   * out either. Measured on a lane, it heard a task.created after the revoke. A
   * revoked session's token is refused on every route at once (`sessionIsLive`,
   * `found-30-sep/revoked-sessions-keep-their-access-tokens`); this closes the
   * one door that read a token only at the handshake.
   *
   * Each live socket's session is re-read by the rule a route applies
   * (`sessionIsLive`) and a revoked one's sockets are disconnected with
   * "Session ended", as a new handshake with its token is. One read per distinct
   * session (deduped across a person's several sockets), no cache — as the
   * route's check is — so each process ends its own dead sockets wherever the
   * revoke was handled.
   *
   * A READ THAT FAILS ANSWERS NOTHING, so its sockets are neither ended nor
   * passed: they are asked about again at the next sweep, seconds later. The
   * reads are settled together — awaited one by one, a read that failed while
   * an earlier one was awaited had nobody listening, and that rejection alone
   * ended the process (`afterInit`).
   */
  private async disconnectRevokedSockets(): Promise<void> {
    const sockets = this.localSockets()
    if (sockets.length === 0) return
    const users = new Map<string, string>()
    for (const client of sockets) {
      const data = client.data as { userId?: string; sid?: string }
      if (!data?.userId || !data?.sid) continue
      if (!users.has(data.sid)) users.set(data.sid, data.userId)
    }
    const sids = [...users.keys()]
    const answers = await Promise.allSettled(sids.map((sid) => sessionIsLive(this.db, { sub: users.get(sid), sid })))
    const ended = new Set<string>()
    let unanswered = 0
    answers.forEach((answer, i) => {
      if (answer.status === 'rejected') unanswered += 1
      else if (!answer.value) ended.add(sids[i])
    })
    if (unanswered > 0) this.logger.warn(`revoked-session sweep: ${unanswered} of ${sids.length} session reads failed; their sockets are asked about again at the next sweep`)
    if (ended.size === 0) return
    for (const client of sockets) {
      const data = client.data as { sid?: string }
      if (data?.sid && ended.has(data.sid)) this.endSocket(client, 'Session ended')
    }
  }

  /** Tell a socket why it is being closed, then close it, as the handshake does. */
  private endSocket(client: Socket, message: string): void {
    client.emit('error', { message })
    client.disconnect(true)
  }

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
    // A subscribe can arrive before the handshake has found the session live (`handleConnection`).
    await (client.data as { handshake?: Promise<void> })?.handshake
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
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!membership) return false
    /*
     * THE WORKSPACE'S ROOM IS EVERY MEMBER'S, and a guest's is not: it carries
     * a public channel's messages whole as they are written, and a guest reads
     * only what is shared with them. What reaches a guest reaches them in their
     * own room (`channelReaders`) — `found-24-sep/guests-read-every-open-channel`.
     */
    if (kind === 'workspace' && membership.role === 'guest') return false
    // Nor a canvas's: a guest has no whiteboard or mind map (`CanvasesService`).
    if (kind === 'canvas' && membership.role === 'guest') return false
    /*
     * A LIST'S OR A TASK'S ROOM CARRIES WHAT THE LIST OR THE TASK SHOWS: the
     * new task whole, every change, every comment. Membership alone let
     * anyone in: measured on lane 1, a member refused a private space's list
     * and task (403 on each) joined both rooms and heard a task created there
     * and a comment posted on it. The rules the reads apply apply here.
     * A doc's room carries every edit whole, so it takes the doc's read rule
     * (`doc-access.ts`): measured, a member refused a private space joined its
     * doc's room and heard an edit. A canvas's room follows the canvas's own
     * read rule, which is membership today.
     */
    if (kind === 'list' || kind === 'task') return this.canReadListOrTask(kind, id, userId, membership.role as string)
    if (kind === 'doc') {
      const [doc] = await this.db
        .select({ id: docs.id, workspaceId: docs.workspaceId, spaceId: docs.spaceId, parentDocId: docs.parentDocId })
        .from(docs)
        .where(eq(docs.id, id))
        .limit(1)
      return !!doc && canReadDoc(this.db, doc, userId, isManagerRole(membership.role as string))
    }
    return true
  }

  /** The container rule, the private-list rule and, for a task, the private-task rule. */
  private async canReadListOrTask(kind: 'list' | 'task', id: string, userId: string, workspaceRole: string): Promise<boolean> {
    if (isManagerRole(workspaceRole)) return true
    let listId = id
    if (kind === 'task') {
      const [task] = await this.db
        .select({ listId: tasks.listId, visibility: tasks.visibility, createdById: tasks.createdById })
        .from(tasks)
        .where(eq(tasks.id, id))
        .limit(1)
      if (!task) return false
      if (task.visibility === 'private' && task.createdById !== userId) {
        const [assigned] = await this.db
          .select({ userId: taskAssignees.userId })
          .from(taskAssignees)
          .where(and(eq(taskAssignees.taskId, id), eq(taskAssignees.userId, userId)))
          .limit(1)
        if (!canSeePrivateItem(task, { userId, isManager: false, isAssignee: !!assigned })) return false
      }
      listId = task.listId
    }
    const [chain] = await this.db
      .select({
        listVisibility: lists.visibility,
        listCreatedById: lists.createdById,
        spaceId: spaces.id,
        spaceVisibility: spaces.visibility,
        projectId: projects.id,
        projectVisibility: projects.visibility,
      })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (!chain) return false
    if (!canSeePrivateItem({ visibility: chain.listVisibility, createdById: chain.listCreatedById }, { userId, isManager: false })) {
      return false
    }
    // A guest hears only what is theirs to read: a task in reach, or a list whose
    // every task is (`guest-reach.ts`) — not a list they only pass through.
    if (workspaceRole === 'guest') {
      const theirs = kind === 'task' ? await guestMayRead(this.db, userId, 'task', id) : await guestReachesList(this.db, userId, listId)
      if (!theirs) return false
    }
    return checkContainerAccess(
      this.db,
      { spaceId: chain.spaceId, spaceVisibility: chain.spaceVisibility, projectId: chain.projectId, projectVisibility: chain.projectVisibility },
      { userId, workspaceRole },
    )
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

    /*
     * THE HANDSHAKE ASKS FOR THE SESSION, WHICH IS A READ, so a message can
     * arrive before it is answered: the web subscribes the moment it connects.
     * Who the socket is was set at once, before; now it is set when the session
     * is found live. So the handshake's work is kept on the socket, and a
     * subscribe waits for it before it reads who the socket is (`canJoinRoom`).
     */
    const handshake = this.admit(client, token)
    ;(client.data as { handshake?: Promise<void> }).handshake = handshake
    await handshake
  }

  /** Who the socket is, when its token verifies and its session is live; otherwise it is told why and closed. */
  private async admit(client: Socket, token: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      })
      // A token whose session has ended opens no socket, as it reads no route
      // (`sessionIsLive`, `found-30-sep/revoked-sessions-keep-their-access-tokens`).
      if (!(await sessionIsLive(this.db, payload))) {
        client.emit('error', { message: 'Session ended' })
        client.disconnect(true)
        return
      }
      ;(client.data as { userId: string; email: string; role: string; sid?: string }).userId = payload.sub
      ;(client.data as { userId: string; email: string; role: string; sid?: string }).email = payload.email
      ;(client.data as { userId: string; email: string; role: string; sid?: string }).role  = payload.role
      // The session the socket was admitted on, re-read while it stays open so
      // a revoked session's sockets are disconnected (`disconnectRevokedSockets`).
      ;(client.data as { sid?: string }).sid = typeof payload.sid === 'string' ? payload.sid : undefined
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
  async handlePresencePing(@ConnectedSocket() client: Socket) {
    const data = client.data as { userId?: string; sid?: string }
    if (!data?.userId) return
    // A ping is a cheap moment to re-read the session, so a revoked one's socket
    // goes here too, between sweeps (`disconnectRevokedSockets`). A read that
    // fails throws into Nest's message handler, which answers the ping as an
    // error and keeps the socket, as the sweep keeps it.
    if (data.sid && !(await sessionIsLive(this.db, { sub: data.userId, sid: data.sid }))) {
      this.endSocket(client, 'Session ended')
      return
    }
    void this.presence.recordHeartbeat(data.userId).catch(() => undefined)
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
