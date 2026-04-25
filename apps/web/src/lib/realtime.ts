import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth'

let socket: Socket | null = null

export function getRealtimeSocket() {
  if (socket) return socket
  const token = useAuthStore.getState().accessToken
  const apiOrigin =
    window.location.port === '5173'
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : window.location.origin
  socket = io(`${apiOrigin}/realtime`, {
    auth: { token },
    transports: ['websocket'],
  })
  return socket
}

export function reconnectRealtime() {
  if (!socket) return
  socket.auth = { token: useAuthStore.getState().accessToken }
  socket.connect()
}
