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
 * colleague's) while the writes are about yourself (`/priorities`, no `:userId`
 * in the path), with ONE exception: `addFor` puts a task on a colleague's list
 * (`POST /people/:userId/priorities`, `ledger-rows/row-850`), as ClickUp lets
 * a member do. Ticking, removing and reordering stay the owner's, which is why
 * the rest of the actions here take no user id.
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
  createdAt?: string
  /**
   * Who put it on the list (`ledger-rows/row-850`): the owner, or a colleague
   * who added a task to it. Null on a row older than the record.
   */
  addedBy?: { id: string; displayName: string } | null
}

/**
 * The name to say "Added by" with, when somebody OTHER than the list's owner
 * put this row there; null when the owner did, or nobody knows.
 */
export function addedByOther(p: Priority, ownerId: string | undefined): string | null {
  return p.addedBy && p.addedBy.id !== ownerId ? p.addedBy.displayName : null
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

/**
 * The one read, as a query definition: `usePriorities` renders it, and the
 * task sheet asks it once after assigning a colleague (`qc.fetchQuery`), under
 * the same key, so the answer lands in the cache every surface reads.
 */
export const prioritiesQuery = (workspaceId: string | undefined, userId: string | undefined) => ({
  queryKey: prioritiesKey(workspaceId, userId),
  queryFn: () => api<Priority[]>(`/workspaces/${workspaceId}/people/${userId}/priorities`),
})

export function usePriorities(workspaceId: string | undefined, userId: string | undefined) {
  return useQuery({
    ...prioritiesQuery(workspaceId, userId),
    enabled: !!workspaceId && !!userId,
  })
}

/**
 * §V2-S16 frame `15:50`, and `ledger-rows/row-850` — whether assigning
 * somebody should ask to add the task to their priorities.
 *
 * For yourself, as the frame shows it. For a colleague, too: ClickUp's
 * setting is "Ask to add task to priorities after assigning … to the assigned
 * member's priorities", and its prompt names them. Not for anybody while the
 * prompt is muted ("Don't ask again" is one preference, whoever is assigned);
 * not when the task is already on that person's list and still open; and a
 * guest is never offered a colleague's list, because guests cannot add to one
 * (the server refuses it too). A guest's OWN list is theirs to add to.
 */
export function offersPriority(opts: {
  assigneeId: string
  currentUserId: string
  viewerRole: string | undefined
  muted: boolean
  taskId: string
  /** The assignee's priorities, as the viewer may read them. */
  theirs: Priority[] | undefined
}): boolean {
  if (opts.muted) return false
  if (opts.assigneeId !== opts.currentUserId && opts.viewerRole === 'guest') return false
  return !(opts.theirs ?? []).some((p) => p.taskId === opts.taskId && !p.doneAt)
}

/**
 * Add, tick, remove and reorder your own priorities — and add a task to a
 * colleague's (`addFor`).
 *
 * `userId` is only used to know which cached list to refresh — the requests
 * themselves are about the caller, except `addFor`'s, which names its person
 * and refreshes theirs.
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

  /*
   * `ledger-rows/row-850` — a task onto a COLLEAGUE's list. A task only, as the
   * API takes it: the server asks that the caller is no guest, that the
   * colleague is in the workspace and that both of them may open the task, and
   * a refusal comes back as its own sentence in the toast.
   */
  const addFor = useMutation({
    mutationFn: ({ userId: theirId, taskId }: { userId: string; taskId: string }) =>
      api<Priority>(`/workspaces/${workspaceId}/people/${theirId}/priorities`, {
        method: 'POST',
        body: { taskId },
      }),
    onSuccess: (_row, { userId: theirId }) =>
      qc.invalidateQueries({ queryKey: prioritiesKey(workspaceId, theirId) }),
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

  return { add, addFor, setDone, remove, reorder }
}
