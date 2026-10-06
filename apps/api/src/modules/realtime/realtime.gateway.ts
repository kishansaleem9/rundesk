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
import { workspaceMembers, lists, projects, spaces, tasks, taskAssignees, docs, workspaceCanvases, users, calls, chatChannels } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { checkContainerAccess } from '../../common/permissions/container-access.guard-helper'
import { canSeePrivateItem, isManagerRole } from '../../common/permissions/item-visibility'
import { canReadDoc } from '../../common/permissions/doc-access'
import { PresenceService } from '../presence/presence.service'
import { ACCESS_TOKEN_COOKIE } from '../auth/auth-cookies'
import { guestMayRead, guestReachesList } from '../../common/permissions/guest-reach'
import { sessionIsLive } from '../../common/security/live-session'
import { isUuid } from '../../common/validation/uuid'
import { channelReaders } from '../chat/channel-read-filter'

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

/**
 * READS ONE ROOM PASS SHARES BETWEEN ITS QUESTIONS (`askRoomsAgain`).
 * Many people hold the same room, and a person holds several rooms of one
 * workspace: a room's workspace and a person's membership of it are read once a
 * pass, not once a question. Made when a pass starts and dropped when it ends,
 * so no answer outlives the pass that read it; a subscribe reads afresh.
 */
type SweepReads = Map<string, Promise<unknown>>

/**
 * Who a socket is (`admit`), and the rooms its pages asked for and were let
 * into (`handleSubscribe`) until they let them go, each with the workspace it
 * was let in under (a room's item never leaves its workspace: a task, a list
 * and a project are moved only within theirs).
 */
type SocketData = { userId?: string; email?: string; role?: string; sid?: string; wanted?: Map<string, string | null> }

/** The rooms a socket's pages hold: what the room pass asks about again, and joins again when access comes back. */
function wantedBy(client: Socket): Map<string, string | null> {
  const data = client.data as SocketData
  data.wanted ??= new Map<string, string | null>()
  return data.wanted
}

/** One room pass question: may this person read this room now? Asked once for all of their sockets that want it. */
type RoomQuestion = { key: string; userId: string; room: string; workspaceId: string | null; asker: Socket; holders: Socket[] }

/** `read()` once per sweep under `key` — or afresh, when no sweep is asking. */
function shared<T>(reads: SweepReads | undefined, key: string, read: () => Promise<T>): Promise<T> {
  if (!reads) return read()
  const known = reads.get(key) as Promise<T> | undefined
  if (known) return known
  const reading = read()
  reads.set(key, reading)
  return reading
}

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
   * HOW OFTEN THE OPEN SOCKETS ARE ASKED ABOUT AGAIN. Each tick starts two
   * sweeps, each on its own:
   *
   *   · whose session has ended (`disconnectRevokedSockets`,
   *     `found-30-sep/an-open-socket-outlives-its-session`): "within seconds"
   *     of a session ending its sockets go; the presence ping (every ~60s)
   *     re-reads too, between sweeps. A read per distinct session, so the cost
   *     is the live sessions holding a socket, not the sockets;
   *   · which rooms each socket's person may read now (`askRoomsAgain`,
   *     `found-6-oct/an-open-socket-outlives-its-access`), a pass that lasts at
   *     most one interval.
   */
  private static readonly SWEEP_MS = 5_000
  /** How many room questions a pass asks at once: the database's pool is the requests' too (`askRoomsAgain`). */
  private static readonly ROOM_QUESTIONS_AT_ONCE = 4
  private sweepTimer?: ReturnType<typeof setInterval>
  /** The session sweep under way, if one is: a tick that finds one still running leaves it to finish. */
  private sessionSweep?: Promise<void>
  /** The room pass under way, if one is, and whether a tick came while it ran (the next starts when it ends). */
  private roomPass?: Promise<void>
  private roomPassDue = false
  /** When each person's room was last answered (`${userId} ${room}`): a pass asks the longest-unasked first. */
  private readonly roomAskedAt = new Map<string, number>()

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Start the sweeps once the namespace is up. Not in the constructor: the
   * unit tests build the gateway directly and never init it, so nothing starts
   * a timer there.
   */
  afterInit() {
    if (this.sweepTimer) return
    this.sweepTimer = setInterval(() => this.tick(), RealtimeGateway.SWEEP_MS)
    // Does not hold the process open on its own.
    this.sweepTimer.unref?.()
  }

  /**
   * EACH TICK ASKS ABOUT THE SESSIONS AND THE ROOMS, NEITHER BEHIND THE OTHER.
   * The room questions were asked in the same sweep as the sessions, after
   * them, and a tick that found that sweep still running skipped both: measured
   * on lane 2, with one member's socket holding 3,000 task rooms a signed-out
   * session's socket stayed open 9.7 s where it had closed in 3.9 s, and with
   * three such sockets 11.0 s. The session sweep is a read per session and
   * runs at every tick whatever the rooms cost.
   *
   * A SWEEP THAT FAILS IS SAID, AND THE NEXT ONE ASKS AGAIN. A rejection left
   * unheard in a timer ends the process (Node's default for an unhandled
   * rejection), and with it every socket and request it holds: measured on a
   * lane, the lane's database refused connections for eight seconds while one
   * socket was open, the sweep's read failed, and the API exited and stayed
   * down after the database came back — where a request in the same outage
   * answers 500 and the process goes on. So the tick catches what each sweep
   * throws (`disconnectRevokedSockets` already keeps a failed read from
   * throwing; this is for anything else).
   *
   * ONE OF EACH AT A TIME. A sweep that outlasts the interval (a slow database,
   * many sockets) is not started again on top of itself, asking the same
   * questions twice. A room pass stops asking when the interval is up
   * (`askRoomsAgain`), and a tick that came while it ran starts the next one as
   * soon as it ends, so the rooms are asked about at the interval's pace.
   */
  private tick(): void {
    if (!this.sessionSweep) {
      this.sessionSweep = this.disconnectRevokedSockets()
        .catch((err: unknown) =>
          this.logger.warn(`revoked-session sweep failed: ${err instanceof Error ? err.message : String(err)}`),
        )
        .finally(() => {
          this.sessionSweep = undefined
        })
    }
    if (this.roomPass) this.roomPassDue = true
    else this.startRoomPass()
  }

  private startRoomPass(): void {
    this.roomPassDue = false
    this.roomPass = this.askRoomsAgain()
      .catch((err: unknown) =>
        this.logger.warn(`room sweep failed: ${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => {
        this.roomPass = undefined
        if (this.roomPassDue && this.sweepTimer) this.startRoomPass()
      })
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = undefined
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

  /**
   * A SOCKET HEARS WHAT ITS PERSON MAY READ NOW
   * (`found-6-oct/an-open-socket-outlives-its-access`).
   *
   * A room was asked once, when the socket subscribed (`canJoinRoom`), and an
   * event goes to everyone in the room with no question per reader. So when a
   * person's access ended and their session did not, their open socket went on
   * hearing: measured on lane 2, a member removed from the workspace, a guest
   * whose share of a list was removed, a member lowered to guest, and members
   * of a list and of a space made private each heard a task made seven seconds
   * later, while their own read of it was refused 403. ClickUp: "When you
   * remove someone from your ClickUp Workspace, the person immediately loses
   * access to all Workspace content" (help centre, "Remove someone from a
   * Workspace").
   *
   * So each pass asks again every room a live socket's pages asked for
   * (`wantedBy`), by the rule that let it in (`canJoinRoom`): one question per
   * person and room, however many of their sockets want it. A socket leaves a
   * room its person may no longer read, and joins again one they may read once
   * more — a list made private and public again, a member added to the private
   * space, a guest made a member again: leaving alone, measured, kept an open
   * page deaf to its list after its reader's access came back, until it was
   * reloaded, since a page subscribes once, when it mounts. The person's own
   * room (`user:<id>`) is who the socket is and is not asked. The socket itself
   * stays: it also carries the person's other workspaces (measured: the removed
   * member's socket went on hearing their own workspace's channel), and the web
   * does not open again a socket the server has closed.
   *
   * EACH ANSWER IS ACTED ON WHEN IT COMES, not when the pass ends.
   *
   * A QUESTION THAT FAILS ANSWERS NOTHING: the room is left as it is and asked
   * again at the next pass, as a failed session read keeps its socket.
   *
   * A FEW QUESTIONS AT A TIME, SHARING THEIR READS. Asked all at once, the
   * questions took the database's whole pool for the length of the sweep:
   * measured on lane 2 against its database, 200 people holding four rooms each
   * (800 questions, 2,800 reads) took 1.7 s, and a request's read sent meanwhile
   * waited 0.7 s behind them, every five seconds. So `ROOM_QUESTIONS_AT_ONCE`
   * are asked at a time, leaving the rest of the pool to the requests, and the
   * reads one pass makes again and again — a room's workspace, a person's
   * membership of it — are read once a pass (`SweepReads`): the same 800
   * questions then made 2,200 reads in 1.5 s, and the request's read waited 6 ms.
   *
   * EVERY PERSON IN TURN, AND A PASS LASTS AT MOST ONE INTERVAL. The questions
   * were asked socket by socket, so one socket holding thousands of rooms put
   * everyone after it at the end of a sweep that took tens of seconds (measured
   * on lane 2: a removed member went on hearing a list 9.5 s after their removal
   * beside one socket holding 3,000 task rooms, 21.8 s beside three). Now each
   * person is asked one room in turn, their longest-unasked first and the person
   * who has waited longest first (`inTurn`), and a pass stops asking once the
   * interval is up: the next pass goes on from the rooms and the people not
   * reached. Whoever holds a page's few rooms is asked about them all early in
   * every pass; only a person holding more than a pass can ask waits more than
   * one interval, for their own rooms — and not when they leave the workspace,
   * which settles all of their rooms there first (`leaveWorkspacesNoLongerJoined`).
   */
  private async askRoomsAgain(): Promise<void> {
    const until = Date.now() + RealtimeGateway.SWEEP_MS
    const questions = new Map<string, RoomQuestion>()
    for (const client of this.localSockets()) {
      const data = client.data as SocketData | undefined
      const userId = data?.userId
      if (!userId || client.disconnected || !data?.wanted) continue
      for (const [room, workspaceId] of data.wanted) {
        if (room === `user:${userId}`) continue
        const key = `${userId} ${room}`
        const asked = questions.get(key)
        if (asked) asked.holders.push(client)
        else questions.set(key, { key, userId, room, workspaceId, asker: client, holders: [client] })
      }
    }
    // What nobody wants any more is forgotten.
    for (const key of this.roomAskedAt.keys()) if (!questions.has(key)) this.roomAskedAt.delete(key)
    if (questions.size === 0) return
    const reads: SweepReads = new Map()
    const leftAtOnce = await this.leaveWorkspacesNoLongerJoined([...questions.values()], reads)
    const queue = this.inTurn([...questions.values()].filter((question) => !leftAtOnce.has(question.key)))
    let unanswered = 0
    let next = 0
    const askInTurn = async () => {
      while (next < queue.length && Date.now() < until) {
        const question = queue[next++]
        let may: boolean
        try {
          may = await this.canJoinRoom(question.asker, question.room, reads)
        } catch {
          unanswered += 1
          continue
        }
        this.roomAskedAt.set(question.key, Date.now())
        this.actOnAnswer(question, may)
      }
    }
    await Promise.all(Array.from({ length: Math.min(RealtimeGateway.ROOM_QUESTIONS_AT_ONCE, queue.length) }, askInTurn))
    if (unanswered > 0) this.logger.warn(`room sweep: ${unanswered} of ${queue.length} room questions failed; their rooms are asked about again at the next pass`)
  }

  /**
   * A PERSON NO LONGER A MEMBER OF A WORKSPACE MAY READ NONE OF ITS ROOMS,
   * however many they hold: one membership read for each person and workspace
   * answers every one of their rooms there, first thing in the pass. Asked room
   * by room, in turn with everyone else, a removed member whose socket held
   * 3,000 task rooms went on hearing them 18.6 s after the removal (lane 2),
   * where a removed member holding a page's few rooms stopped within the pass.
   * A super_admin passes every guard, so is asked room by room
   * (`canJoinRoom`). Answers the keys of the questions it settled.
   */
  private async leaveWorkspacesNoLongerJoined(questions: RoomQuestion[], reads: SweepReads): Promise<Set<string>> {
    const byMembership = new Map<string, { workspaceId: string; userId: string; questions: RoomQuestion[] }>()
    for (const question of questions) {
      if (!question.workspaceId || (question.asker.data as SocketData)?.role === 'super_admin') continue
      const key = `${question.workspaceId} ${question.userId}`
      const same = byMembership.get(key)
      if (same) same.questions.push(question)
      else byMembership.set(key, { workspaceId: question.workspaceId, userId: question.userId, questions: [question] })
    }
    const settled = new Set<string>()
    const pairs = [...byMembership.values()]
    let next = 0
    const askInTurn = async () => {
      while (next < pairs.length) {
        const pair = pairs[next++]
        let member: boolean
        try {
          member = (await this.membershipOf(pair.workspaceId, pair.userId, reads)).length > 0
        } catch {
          // Answered nothing: each room is asked on its own below, as any question that fails is.
          continue
        }
        if (member) continue
        for (const question of pair.questions) {
          this.roomAskedAt.set(question.key, Date.now())
          this.actOnAnswer(question, false)
          settled.add(question.key)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(RealtimeGateway.ROOM_QUESTIONS_AT_ONCE, pairs.length) }, askInTurn))
    return settled
  }

  /** Each socket of the person that still wants the room leaves it if they may not read it, and joins it again if they may. */
  private actOnAnswer(question: RoomQuestion, may: boolean): void {
    for (const holder of question.holders) {
      if (holder.disconnected || !wantedBy(holder).has(question.room)) continue
      const holds = holder.rooms.has(question.room)
      if (!may && holds) holder.leave(question.room)
      else if (may && !holds) holder.join(question.room)
    }
  }

  /**
   * The questions in turn: one room of each person a round, each person's
   * longest-unasked first, and the person who has waited longest first — so a
   * pass that ends inside a round (more people than a pass can reach) reaches
   * the others at the next pass, rather than the same people every time.
   */
  private inTurn(questions: RoomQuestion[]): RoomQuestion[] {
    const byPerson = new Map<string, RoomQuestion[]>()
    for (const question of questions) {
      const theirs = byPerson.get(question.userId)
      if (theirs) theirs.push(question)
      else byPerson.set(question.userId, [question])
    }
    const lastAsked = (question: RoomQuestion) => this.roomAskedAt.get(question.key) ?? 0
    const turns = [...byPerson.values()]
      .map((theirs) => theirs.sort((a, b) => lastAsked(a) - lastAsked(b)))
      .sort((a, b) => lastAsked(a[0]) - lastAsked(b[0]))
    const queue: RoomQuestion[] = []
    for (let round = 0; queue.length < questions.length; round += 1) {
      for (const theirs of turns) if (round < theirs.length) queue.push(theirs[round])
    }
    return queue
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
   *  workspace it belongs to — resolved transitively for list/task/doc/canvas).
   *  `reads` are a room pass's, shared between its questions; a subscribe has none. */
  private async canJoinRoom(client: Socket, room: string, reads?: SweepReads, found?: { workspaceId?: string }): Promise<boolean> {
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
    const workspaceId = await shared(reads, `workspace of ${room}`, () => this.resolveWorkspaceForRoom(kind, id))
    if (!workspaceId) return false
    if (found) found.workspaceId = workspaceId
    /*
     * A SUPER_ADMIN PASSES, AS IN EVERY GUARD (`ResourceMemberGuard`,
     * `read-access.ts`): the routes let one read a private list they are a
     * plain member of, and the room pass took their open socket out of it —
     * measured on lane 2, their read of the list answered 200 and a task made
     * there went unheard. The socket's role is its handshake token's, which a
     * socket can outlive by hours, so the account is asked whether it still is
     * one (once a pass); a token that never said so is not asked.
     */
    if ((client.data as SocketData)?.role === 'super_admin' && (await this.stillSuperAdmin(userId, reads))) return true
    const [membership] = await this.membershipOf(workspaceId, userId, reads)
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

  /** The person's membership of the workspace, read once a pass (`SweepReads`). */
  private membershipOf(workspaceId: string, userId: string, reads?: SweepReads): Promise<Array<{ role: unknown }>> {
    return shared(reads, `membership ${workspaceId} ${userId}`, async () =>
      this.db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1),
    )
  }

  /** Whether the account is a super_admin now, not when its socket's token was made. */
  private async stillSuperAdmin(userId: string, reads?: SweepReads): Promise<boolean> {
    const [account] = await shared(reads, `account role ${userId}`, async () =>
      this.db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
    )
    return account?.role === 'super_admin'
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
      const found: { workspaceId?: string } = {}
      if (await this.canJoinRoom(client, room, undefined, found)) {
        client.join(room)
        // Held for the page that asked, until it lets go: the room pass asks about it again (`askRoomsAgain`).
        wantedBy(client).set(room, found.workspaceId ?? null)
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
    for (const room of body.rooms) {
      client.leave(room)
      wantedBy(client).delete(room)
    }
    return { ok: true, left: body.rooms }
  }

  /**
   * Collaborator cursor broadcast for whiteboards / mind maps. Receives a
   * raw {canvasId, x, y} payload from the client, stamps it with the
   * connection's authenticated identity, and fans out to all other sockets
   * in the canvas room. Sender is excluded so a client never sees its own
   * cursor reflected back.
   *
   * ONLY FROM A SOCKET IN THE CANVAS'S ROOM, UNDER ITS ACCOUNT'S NAME
   * (`found-6-oct/a-socket-sends-into-rooms-it-may-not-read`). Any socket that named a
   * canvas was relayed into its room under the name its body gave: measured,
   * a member removed from the workspace and an account never in it each drew
   * a cursor on the owner's board as "Rev owner (not really)". The room is let
   * in by `canJoinRoom` and left by the room pass once its person may no
   * longer read the canvas, so holding it is the read rule; the page joins it
   * when the board opens.
   */
  @SubscribeMessage('canvas.cursor')
  async handleCanvasCursor(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { canvasId?: string; x?: number; y?: number; color?: string },
  ) {
    const data = client.data as { userId?: string }
    if (!data?.userId || !body?.canvasId || typeof body.x !== 'number' || typeof body.y !== 'number') {
      return { ok: false }
    }
    const room = `canvas:${body.canvasId}`
    if (!client.rooms.has(room)) return { ok: false }
    const event: RealtimeEvent = {
      type: 'canvas.cursor',
      canvasId: body.canvasId,
      userId: data.userId,
      displayName: await this.nameOf(client),
      x: body.x,
      y: body.y,
      color: body.color,
    }
    client.to(room).emit('event', event)
    return { ok: true }
  }

  @SubscribeMessage('canvas.cursor.leave')
  handleCanvasCursorLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { canvasId?: string },
  ) {
    const data = client.data as { userId?: string }
    if (!data?.userId || !body?.canvasId) return { ok: false }
    const room = `canvas:${body.canvasId}`
    if (!client.rooms.has(room)) return { ok: false }
    const event: RealtimeEvent = {
      type: 'canvas.cursor.leave',
      canvasId: body.canvasId,
      userId: data.userId,
    }
    client.to(room).emit('event', event)
    return { ok: true }
  }

  /** The account's own name, for its cursor: read the first time, and kept on the socket. */
  private async nameOf(client: Socket): Promise<string> {
    const data = client.data as { userId: string; email?: string; displayName?: string }
    if (data.displayName === undefined) {
      const [account] = await this.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, data.userId)).limit(1)
      data.displayName = account?.displayName?.trim() || data.email || data.userId
    }
    return data.displayName
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
  async handleCallReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId?: string; workspaceId?: string; emoji?: string },
  ) {
    const data = client.data as { userId?: string }
    if (!data?.userId || !body?.callId || !body?.emoji) return { ok: false }
    // Bounded: an emoji is one or two code points, and a "reaction" carrying a
    // paragraph is not a reaction.
    const emoji = String(body.emoji).slice(0, 8)
    /*
     * FROM, AND TO, THOSE WHO MAY READ THE CALL'S CHANNEL
     * (`found-6-oct/a-socket-sends-into-rooms-it-may-not-read`). It went into the room of
     * whichever workspace the body named, from anyone: measured, a member
     * removed from the workspace and an account never in it each put a
     * reaction on the owner's screen, and a reaction in a DM's call reached
     * every member. A SyncUp is its channel's ("only people with access to the
     * Channel can be invited to join a channel SyncUp", ClickUp), so the call
     * names its workspace and channel, and its channel's readers
     * (`channelReaders`, the rule its other events go by) are who may send one
     * and who hear it. The body's workspace is not asked.
     */
    const readers = await this.callReaders(body.callId)
    if (!readers || !(await this.readsCall(readers, data.userId))) return { ok: false }
    const event = {
      type: 'call.reaction',
      workspaceId: readers.workspaceId,
      callId: body.callId,
      userId: data.userId,
      emoji,
    } as never
    if (readers.workspace) this.emitToWorkspace(readers.workspaceId, event)
    for (const userId of readers.users) this.emitToUser(userId, event)
    return { ok: true }
  }

  /** Who may read a call's channel; for a call in no channel, the workspace's members. Null when there is no such call. */
  private async callReaders(callId: string): Promise<{ workspaceId: string; workspace: boolean; users: string[] } | null> {
    if (!isUuid(callId)) return null
    const [call] = await this.db
      .select({ workspaceId: calls.workspaceId, channelId: calls.channelId })
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1)
    if (!call) return null
    if (!call.channelId) return { workspaceId: call.workspaceId, workspace: true, users: [] }
    const [channel] = await this.db
      .select({ id: chatChannels.id, workspaceId: chatChannels.workspaceId, spaceId: chatChannels.spaceId, isPrivate: chatChannels.isPrivate, isDm: chatChannels.isDm })
      .from(chatChannels)
      .where(eq(chatChannels.id, call.channelId))
      .limit(1)
    if (!channel) return null
    return { workspaceId: call.workspaceId, ...(await channelReaders(this.db, channel)) }
  }

  /** One of a call's readers: named among them, or, where the whole workspace reads it, a member of it who is not a guest. */
  private async readsCall(readers: { workspaceId: string; workspace: boolean; users: string[] }, userId: string): Promise<boolean> {
    if (readers.users.includes(userId)) return true
    if (!readers.workspace) return false
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, readers.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return Boolean(membership && membership.role !== 'guest')
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
