import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './api'

/**
 * TASKS TO PICK FROM, NARROWED ON THE SERVER BY WHAT THE PERSON TYPED.
 *
 * Every task picker — the @ Tasks tab and chat's, merge, convert to subtask,
 * dependencies, a Tasks custom field, adding to a sprint — asked for the newest
 * 200 tasks of the workspace and filtered those in the browser. So task 201
 * answered "no matches" however exactly its title was typed, in any workspace
 * past two hundred tasks.
 *
 * `q` goes to `GET /tasks/workspace/:id`, which matches the title and the
 * list's and project's names in SQL before its limit, with the caller's access
 * applied as always. The words are part of the query key, so each is a fetch of
 * its own; the previous answer stays on screen while the next one loads, so a
 * picker does not blink empty between keystrokes.
 */
export function useTaskSearch<T extends { id: string; title: string }>(
  workspaceId: string | null | undefined,
  query: string,
  {
    enabled = true,
    limit = 50,
    key,
    listId,
  }: {
    enabled?: boolean
    limit?: number
    key: string
    /** One list's tasks alone — a Relationship limited to that list (`ledger-rows/row-719`). */
    listId?: string | null
  },
) {
  const q = query.trim()
  return useQuery({
    queryKey: ['task-search', key, workspaceId, q, limit, listId ?? null],
    queryFn: () =>
      api<T[]>(
        `/tasks/workspace/${workspaceId}?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}${listId ? `&listId=${encodeURIComponent(listId)}` : ''}`,
      ),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: keepPreviousData,
  })
}
