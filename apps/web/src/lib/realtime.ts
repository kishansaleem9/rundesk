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
