import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '../store/auth'
import { devServerApiOrigin } from './dev-api-origin'

let socket: Socket | null = null

export function getRealtimeSocket() {
  if (socket) return socket
  const token = useAuthStore.getState().accessToken
  const devOrigin = devServerApiOrigin()
  const apiOrigin = devOrigin.length > 0 ? devOrigin : window.location.origin
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
