import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth'
import { devServerApiOrigin } from './dev-api-origin'

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
  return socket
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
