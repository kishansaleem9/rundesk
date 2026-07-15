import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type PresenceStatus = 'online' | 'away' | 'offline'

type PresenceRow = { userId: string; lastSeenAt: string | null; status: PresenceStatus }

/**
 * Live presence for a workspace's members (Plan §6.2). Polls on an interval and
 * on window focus; the realtime socket keeps each user's heartbeat fresh. Returns
 * a userId→status map plus a helper that defaults unknown users to offline.
 */
export function usePresence(workspaceId: string | undefined) {
  const query = useQuery({
    queryKey: ['presence', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => api<PresenceRow[]>(`/workspaces/${workspaceId}/presence`),
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })

  const map = useMemo(() => {
    const m: Record<string, PresenceStatus> = {}
    for (const row of query.data ?? []) m[row.userId] = row.status
    return m
  }, [query.data])

  return {
    map,
    statusOf: (userId: string | undefined | null): PresenceStatus => (userId ? map[userId] ?? 'offline' : 'offline'),
  }
}

/** Tailwind color for a presence dot. */
export function presenceDotClass(status: PresenceStatus): string {
  switch (status) {
    case 'online': return 'bg-emerald-500'
    case 'away': return 'bg-amber-400'
    default: return 'bg-muted-foreground/40'
  }
}
