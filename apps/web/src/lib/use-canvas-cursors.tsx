import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { getRealtimeSocket } from './realtime'
import { useAuthStore } from '../store/auth'

export type RemoteCursor = {
  userId: string
  displayName: string
  color: string
  x: number
  y: number
  lastSeenAt: number
}

const CURSOR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

function colorFor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0
  }
  return CURSOR_COLORS[h % CURSOR_COLORS.length]
}

const STALE_MS = 6000
const THROTTLE_MS = 60

/**
 * Subscribes the current socket to the canvas presence room and exposes both
 *  - `remoteCursors`: a live map of other users' cursor positions
 *  - `bindEvents`: handlers to spread onto a canvas wrapper to broadcast
 *    the local user's pointer.
 */
export function useCanvasCursors(canvasId: string | null, containerRef: React.RefObject<HTMLElement | null>) {
  const me = useAuthStore((s) => s.user)
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({})
  const lastEmitRef = useRef(0)
  const myColor = useMemo(() => (me?.id ? colorFor(me.id) : CURSOR_COLORS[0]), [me?.id])

  useEffect(() => {
    if (!canvasId) return
    const socket = getRealtimeSocket()
    const room = `canvas:${canvasId}`
    socket.emit('subscribe', { rooms: [room] })

    const onEvent = (event: {
      type: string
      canvasId?: string
      userId?: string
      displayName?: string
      x?: number
      y?: number
      color?: string
    }) => {
      if (event.canvasId !== canvasId) return
      if (event.userId && event.userId === me?.id) return
      if (event.type === 'canvas.cursor' && event.userId && typeof event.x === 'number' && typeof event.y === 'number') {
        setRemoteCursors((prev) => ({
          ...prev,
          [event.userId!]: {
            userId: event.userId!,
            displayName: event.displayName ?? 'Teammate',
            color: event.color ?? colorFor(event.userId!),
            x: event.x!,
            y: event.y!,
            lastSeenAt: Date.now(),
          },
        }))
      }
      if (event.type === 'canvas.cursor.leave' && event.userId) {
        const leavingId = event.userId
        setRemoteCursors((prev) => {
          if (!prev[leavingId]) return prev
          const next = { ...prev }
          delete next[leavingId]
          return next
        })
      }
    }
    socket.on('event', onEvent)

    // Periodically prune cursors that haven't pinged recently (e.g. crashed tab).
    const sweep = window.setInterval(() => {
      const now = Date.now()
      setRemoteCursors((prev) => {
        let changed = false
        const next: Record<string, RemoteCursor> = {}
        for (const [id, c] of Object.entries(prev)) {
          if (now - c.lastSeenAt < STALE_MS) next[id] = c
          else changed = true
        }
        return changed ? next : prev
      })
    }, 2000)

    return () => {
      socket.off('event', onEvent)
      window.clearInterval(sweep)
      socket.emit('canvas.cursor.leave', { canvasId })
      socket.emit('unsubscribe', { rooms: [room] })
      setRemoteCursors({})
    }
  }, [canvasId, me?.id])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!canvasId || !containerRef.current) return
      const now = Date.now()
      if (now - lastEmitRef.current < THROTTLE_MS) return
      lastEmitRef.current = now
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const socket = getRealtimeSocket()
      socket.emit('canvas.cursor', {
        canvasId,
        x,
        y,
        color: myColor,
        displayName: me?.displayName ?? me?.email ?? 'Me',
      })
    },
    [canvasId, containerRef, me?.displayName, me?.email, myColor],
  )

  const onPointerLeave = useCallback(() => {
    if (!canvasId) return
    const socket = getRealtimeSocket()
    socket.emit('canvas.cursor.leave', { canvasId })
  }, [canvasId])

  return { remoteCursors, onPointerMove, onPointerLeave }
}

export function CursorLayer({ cursors }: { cursors: Record<string, RemoteCursor> }) {
  const entries = Object.values(cursors)
  if (entries.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {entries.map((c) => (
        <div
          key={c.userId}
          className="absolute transition-transform duration-75 ease-linear"
          style={{ transform: `translate3d(${c.x}px, ${c.y}px, 0)` }}
        >
          <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden>
            <path
              d="M3 1.5L17.5 9.5L10 11L7 18.5L3 1.5Z"
              fill={c.color}
              stroke="#fff"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          <div
            className="ml-3 mt-0.5 inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
            style={{ backgroundColor: c.color }}
          >
            {c.displayName}
          </div>
        </div>
      ))}
    </div>
  )
}
