/**
 * Today's priorities — one read, one set of writes, for both surfaces.
 *
 * WHY THIS FILE EXISTS. Priorities are shown in two places: the person panel
 * (§G06 `[05:54]`) and the Planner's rail (§V2 frame `13:05`). They were
 * fetching the SAME endpoint under two different React Query keys —
 * `['person-priorities', ws, user]` and `['planner-priorities', ws, user]` —
 * so the two caches could not invalidate each other. Add a priority in one and
 * the other went on showing the old list until something else happened to
 * refetch it.
 *
 * The rail also had no writes at all, so the obvious way to give it some was to
 * copy the person panel's four mutations. That would have been the seventh
 * instance of this codebase's most productive bug: one fact, two hand-kept
 * copies, no compiler between them. One key and one set of mutations instead.
 *
 * The READ is per-person (`/people/:userId/priorities` — you can look at a
 * colleague's) while every WRITE is about yourself (`/priorities`, no `:userId`
 * in the path). That asymmetry is the API's, deliberately: see
 * `PrioritiesController`. It is why the actions here take no user id.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@rundesk/ui'
import { api, ApiError } from './api'

export type Priority = {
  id: string
  taskId: string | null
  title: string
  taskStatus?: string | null
  position: number
  doneAt: string | null
}

/*
 * §V2-S16 frame `15:50` — "Don't ask again".
 *
 * The prompt after assigning is a convenience, and a convenience that cannot be
 * switched off becomes an irritation. Per-viewer, because it is a preference
 * about being interrupted rather than anything the workspace needs to know.
 */
const PROMPT_OFF_KEY = 'rundesk.priorityPromptOff'

export function priorityPromptMuted(): boolean {
  try {
    return window.localStorage.getItem(PROMPT_OFF_KEY) === '1'
  } catch {
    // Blocked site data throws rather than returning null. If the preference
    // cannot be read, ask — the prompt is dismissible either way.
    return false
  }
}

export function mutePriorityPrompt(): void {
  try {
    window.localStorage.setItem(PROMPT_OFF_KEY, '1')
  } catch {
    // Nothing to do: it will ask again next session, which is the safe failure.
  }
}

/** The one cache key for a person's priorities. */
export const prioritiesKey = (workspaceId: string | undefined, userId: string | undefined) =>
  ['priorities', workspaceId, userId] as const

export function usePriorities(workspaceId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: prioritiesKey(workspaceId, userId),
    enabled: !!workspaceId && !!userId,
    queryFn: () => api<Priority[]>(`/workspaces/${workspaceId}/people/${userId}/priorities`),
  })
}

/**
 * Add, tick, remove and reorder your own priorities.
 *
 * `userId` is only used to know which cached list to refresh — the requests
 * themselves are always about the caller.
 */
export function usePriorityActions(workspaceId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: prioritiesKey(workspaceId, userId) })
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : (err as Error).message)

  const add = useMutation({
    // Either a typed line or an existing task; the API takes both and the
    // callers differ — the rail types, the assign flow passes a taskId.
    mutationFn: (input: string | { taskId: string }) =>
      api(`/workspaces/${workspaceId}/priorities`, {
        method: 'POST',
        body: typeof input === 'string' ? { title: input } : input,
      }),
    onSuccess: invalidate,
    onError,
  })

  const setDone = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api(`/workspaces/${workspaceId}/priorities/${id}`, { method: 'PATCH', body: { done } }),
    onSuccess: invalidate,
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/priorities/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError,
  })

  const reorder = useMutation({
    // The whole order in one call — a drag produces one order, not N moves.
    mutationFn: (ids: string[]) =>
      api(`/workspaces/${workspaceId}/priorities/order`, { method: 'PUT', body: { ids } }),
    onSuccess: invalidate,
    onError,
  })

  return { add, setDone, remove, reorder }
}
