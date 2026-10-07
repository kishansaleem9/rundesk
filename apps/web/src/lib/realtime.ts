import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth'
import { devServerApiOrigin } from './dev-api-origin'
import { queryClient } from './query'

let socket: Socket | null = null
let presenceTimer: ReturnType<typeof setInterval> | null = null

// Keep the server-side presence heartbeat fresh while a tab is open (Plan §6.2).
// The socket connect already stamps last_seen_at; this ping keeps "online" from
// decaying to "away" during a long idle session.
const PRESENCE_PING_MS = 60_000

export function getRealtimeSocket() {
  if (socket) return socket
  const token = useAuthStore.getState().accessToken
  const devOrigin = devServerApiOrigin()
  const apiOrigin = devOrigin.length > 0 ? devOrigin : window.location.origin
  socket = io(`${apiOrigin}/realtime`, {
    auth: { token },
    transports: ['websocket'],
  })
  const ping = () => {
    if (socket?.connected && document.visibilityState === 'visible') socket.emit('presence.ping')
  }
  socket.on('connect', ping)
  if (presenceTimer) clearInterval(presenceTimer)
  presenceTimer = setInterval(ping, PRESENCE_PING_MS)
  // The rooms the pages hold, joined again whenever the socket opens again.
  const rooms = roomLedger()
  socket.onAnyOutgoing((event, payload) => rooms.sent(event, payload))
  socket.on('disconnect', (reason) => {
    rooms.dropped()
    // The server closed it: it may be the browser's session that changed (`followServerClose`).
    void followServerClose(socket, reason, () => useAuthStore.getState().user?.id ?? null, whoTheBrowserIsSignedInAs)
  })
  socket.on('connect', () => {
    rejoinAndCatchUp(socket, rooms.rejoin(), () => void queryClient.invalidateQueries({ refetchType: 'active' }))
  })
  return socket
}

/**
 * THE ROOMS ARE ASKED FOR AGAIN, AND WHAT WAS SAID IN THEM MEANWHILE IS READ
 * AFRESH ONCE THE SERVER HOLDS THEM (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
 *
 * A socket opened again is in no room until the server has let it in and
 * answered its subscribe. Whatever was said to those rooms while the socket was
 * down, or while the server was still letting it in, reached nothing, and a page
 * reads its data once, when it mounts: measured on lane 7, a task a colleague
 * made just after another tab's sign-in was never drawn on the list the
 * listening tab showed, in 3 of 7 runs under load. So the subscribe asks for
 * the server's answer, and when it comes the page's active queries are read
 * again, after which every event reaches the rooms it holds.
 */
export function rejoinAndCatchUp(sock: Pick<Socket, 'emit'> | null, again: string[], catchUp: () => void): boolean {
  if (!sock || again.length === 0) return false
  sock.emit('subscribe', { rooms: again }, () => catchUp())
  return true
}

export function reconnectRealtime() {
  if (!socket) return
  socket.auth = { token: useAuthStore.getState().accessToken }
  socket.connect()
}

/**
 * THE TAB'S SOCKET IS ITS SESSION'S, so it follows who is signed in
 * (`found-30-sep/an-open-socket-outlives-its-session`).
 *
 * The server ends a socket whose session has ended, and signing out ends the
 * session; socket.io does not reconnect after the server closes a socket. The
 * tab keeps one socket for its life (`getRealtimeSocket`), and nothing opened it
 * again: measured in a browser on a lane, signing out and back in on the same
 * tab left it with no socket, and its own channel's messages went unheard until
 * a reload. So when the person signs out — the store is cleared, whichever way —
 * the socket is closed with the session, and when somebody signs in it is opened
 * again on the new session's token (the handshake reads `auth.token` before the
 * cookie). The same person staying signed in (a refresh, a profile change)
 * leaves it be: a refresh reconnects it itself (`reconnectRealtime`).
 */
export function followSignedIn(
  sock: (Pick<Socket, 'connect' | 'disconnect'> & { auth: unknown }) | null,
  was: string | null,
  now: string | null,
  token: string | null,
): void {
  if (!sock || was === now) return
  if (was) sock.disconnect()
  if (now) {
    sock.auth = { token }
    sock.connect()
  }
}

useAuthStore.subscribe((state, prev) =>
  followSignedIn(socket, prev.user?.id ?? null, state.user?.id ?? null, state.accessToken),
)

/**
 * ANOTHER TAB'S SIGN-IN OPENS THIS TAB'S SOCKET AGAIN
 * (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
 *
 * The tabs of one browser share one session, its cookies. When the person
 * signs out in one tab and back in, that session ends, and the server ends
 * every tab's socket on it — as it must — but only the tab that signed in
 * hears of the new one (`followSignedIn`). Measured with two tabs of one
 * browser on lane 2, three runs alike: the other tab's socket was closed
 * within the server's sweep, no socket opened again, and nothing reached it — a
 * message in the person's own channel, a task made in the list it showed —
 * until it was reloaded; its requests carried the new session's cookie, so no
 * refusal led it to refresh. Its store still names the person.
 *
 * The signing-in tab writes who is signed in to the shared storage, and the
 * other tabs hear that write (a `storage` event, which fires in every tab but
 * the writer). A write that names THIS tab's person as newly signed in — after
 * nobody, or somebody else — is that sign-in: the socket is closed and opened
 * again on the browser's session (`reopenOnTheBrowsersSession`). Any other
 * write (a refresh, a profile change, a sign-out) leaves the socket be: a
 * sign-out's sockets are the server's to end. A tab whose store names somebody
 * else follows nobody here. A sign-in that writes the same person again, or
 * nothing new at all, is followed when the server ends the old session's
 * socket (`followServerClose`).
 */
export function signedInElsewhere(oldValue: string | null, newValue: string | null, here: string | null): boolean {
  const who = (value: string | null): string | null => {
    try {
      const id = (JSON.parse(value ?? 'null') as { state?: { user?: { id?: unknown } | null } } | null)?.state?.user?.id
      return typeof id === 'string' ? id : null
    } catch {
      return null
    }
  }
  const now = who(newValue)
  return now !== null && now === here && who(oldValue) !== now
}

export function followOtherTab(
  sock: (Pick<Socket, 'connect' | 'disconnect'> & { auth: unknown }) | null,
  change: { key: string | null; oldValue: string | null; newValue: string | null },
  authKey: string,
  here: string | null,
): void {
  if (!sock || change.key !== authKey || !signedInElsewhere(change.oldValue, change.newValue, here)) return
  sock.disconnect()
  reopenOnTheBrowsersSession(sock)
}

/**
 * Open the tab's socket on the browser's session. Not on the token this tab
 * holds: the one it holds, if any, is a session's that has ended; the handshake
 * reads the session cookie when no token is given, as a request does.
 */
function reopenOnTheBrowsersSession(sock: Pick<Socket, 'connect'> & { auth: unknown }): void {
  sock.auth = {}
  sock.connect()
}

/**
 * A SOCKET THE SERVER CLOSED IS OPENED AGAIN WHEN THE BROWSER IS STILL SIGNED IN
 * AS THIS TAB'S PERSON (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
 *
 * A sign-in in another tab that is not after a sign-out — the person signing in
 * again at /login, or accepting an invitation, which hands the browser a new
 * session — writes the same person to the shared storage, or nothing new, so
 * no storage event says it (`followOtherTab`). Under a workspace's policy of
 * one session at a time, the new session ends the one this tab's socket was
 * on, and the server closes the socket: measured with two tabs on lane 2, the
 * listening tab's socket was closed 4.1 s after the other tab signed in again,
 * none opened again, its own requests went on answering 200 on the browser's
 * new cookie, and a task made in the list it showed was not drawn.
 *
 * So when the server closes the socket, the tab asks the browser's session who
 * it is (`GET /users/me` on the cookie alone, nothing refreshed and nobody
 * signed out by it) and, when that is still this tab's person, opens the socket
 * again on it. Anyone else, or nobody, leaves it closed as before: a session
 * ended elsewhere is its tab's next request's to find, and another person's
 * sign-in is the owner's to decide. A tab the server closes again at once is
 * not reopened more often than once a second.
 */
const FOLLOW_AT_MOST_EVERY_MS = 1_000
let lastFollowedAt = Number.NEGATIVE_INFINITY

export async function followServerClose(
  sock: (Pick<Socket, 'connect'> & { auth: unknown; active: boolean; connected: boolean }) | null,
  reason: string,
  here: () => string | null,
  signedInNow: () => Promise<string | null>,
  now: () => number = Date.now,
): Promise<boolean> {
  if (!sock || reason !== 'io server disconnect' || !here()) return false
  if (now() - lastFollowedAt < FOLLOW_AT_MOST_EVERY_MS) return false
  const signedIn = await signedInNow().catch(() => null)
  // Asked again after the answer: the tab may have signed out, or opened its socket, meanwhile.
  if (!signedIn || signedIn !== here() || sock.active || sock.connected) return false
  lastFollowedAt = now()
  reopenOnTheBrowsersSession(sock)
  return true
}

/** Who the browser's session (its cookie) is signed in as, or null: no token sent, nothing refreshed. */
async function whoTheBrowserIsSignedInAs(): Promise<string | null> {
  const res = await fetch('/api/v1/users/me', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) return null
  const id = ((await res.json()) as { data?: { id?: unknown } | null } | null)?.data?.id
  return typeof id === 'string' ? id : null
}

/**
 * A TAB THAT SIGNED ITSELF OUT TAKES ITS PERSON BACK WHEN THEY SIGN IN AGAIN IN
 * ANOTHER TAB (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
 *
 * Another tab's sign-out leaves this tab's store naming the person
 * (`followOtherTab` follows only a sign-in) until its own next request finds
 * no session: the refresh fails, and the tab clears its store (`api`). A
 * sign-in in the other tab after that names the person after nobody, but this
 * tab names nobody, and nothing followed it. Measured on lane 6 with the tab's
 * storage logged: it cleared itself 11.7 s after the sign-out, heard the
 * sign-in at 13.7 s, and stayed on its list with its socket closed — in 1 run
 * of 6, whenever the sign-in came after the tab's own next request.
 *
 * So the tab remembers whom it named when its store was cleared
 * (`whoItHeldWhenCleared`), and while it names nobody, that person's sign-in
 * elsewhere (`takesItsPersonBack`) is read back from the shared storage, as a
 * reload of the tab would read it. The store's change then opens the socket
 * again (`followSignedIn`), on the browser's session: the store holds no token
 * now, and the handshake reads the cookie. Whatever cleared the store — a
 * refresh that failed, or the person signing out here — their next sign-in is
 * the browser's, which every tab shares. Somebody else's sign-in leaves the
 * tab signed out: that is the owner's to decide.
 */
export function whoItHeldWhenCleared(was: string | null, now: string | null, held: string | null): string | null {
  if (now) return null
  return was ?? held
}

export function takesItsPersonBack(
  change: { key: string | null; oldValue: string | null; newValue: string | null },
  authKey: string,
  here: string | null,
  held: string | null,
  storedNow: () => string | null,
): boolean {
  if (here !== null || held === null || change.key !== authKey) return false
  // Their sign-in, and still what is stored: what is read back is the storage now, and another write may have come since.
  return signedInElsewhere(change.oldValue, change.newValue, held) && signedInElsewhere(null, storedNow(), held)
}

let heldWhenCleared: string | null = null

useAuthStore.subscribe((state, prev) => {
  heldWhenCleared = whoItHeldWhenCleared(prev.user?.id ?? null, state.user?.id ?? null, heldWhenCleared)
})

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const authKey = useAuthStore.persist.getOptions().name ?? ''
    const here = useAuthStore.getState().user?.id ?? null
    if (takesItsPersonBack(event, authKey, here, heldWhenCleared, () => window.localStorage.getItem(authKey))) {
      void useAuthStore.persist.rehydrate()
      return
    }
    followOtherTab(socket, event, authKey, here)
  })
}

/**
 * THE ROOMS THIS TAB'S PAGES HOLD, JOINED AGAIN WHEN ITS SOCKET OPENS AGAIN
 * (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
 *
 * A page subscribes its rooms once, when it mounts — the list page its list, an
 * open task its task, the chat page the workspace — and a room is the server's
 * socket's: a socket opened again is a new one, in no room but its person's
 * own. So a tab whose socket opened again on the new session (above) heard its
 * own channel and nothing of the list it showed. What the pages subscribe and
 * let go is kept here, read off the socket's outgoing events, and the rooms
 * held when the socket dropped are asked for again when it opens. What a page
 * subscribes while the socket is down is sent by socket.io itself when it
 * opens, so it is not asked twice; nor is anything at the first opening.
 */
export function roomLedger() {
  const held = new Set<string>()
  let whenDropped: string[] | null = null
  return {
    /** An outgoing event: a subscribe holds its rooms, an unsubscribe lets them go. */
    sent(event: string, payload: unknown): void {
      const rooms = (payload as { rooms?: unknown } | null | undefined)?.rooms
      if (!Array.isArray(rooms)) return
      for (const room of rooms) {
        if (typeof room !== 'string') continue
        if (event === 'subscribe') held.add(room)
        else if (event === 'unsubscribe') held.delete(room)
      }
    },
    /** The socket dropped: whatever it held, it holds no longer. */
    dropped(): void {
      whenDropped = [...held]
    },
    /** The socket is open again: the rooms held when it dropped that a page still holds. */
    rejoin(): string[] {
      const again = (whenDropped ?? []).filter((room) => held.has(room))
      whenDropped = null
      return again
    },
  }
}
