import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { buildNamesById } from '../lib/mentions'

type WorkspaceMember = {
  userId: string
  displayName?: string | null
  email?: string | null
}

export function useMentionNames(workspaceId: string | undefined) {
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })

  const namesById = useMemo(
    () => buildNamesById(membersQuery.data ?? []),
    [membersQuery.data],
  )

  return { namesById, membersQuery }
}
