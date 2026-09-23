import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from './api'

/**
 * How every screen asks for notifications.
 *
 * Each of them used to read `GET /notifications` bare — the newest fifty,
 * from every workspace, of every type — and then filtered, counted and
 * declared "all caught up" from those fifty. So workspace A's Inbox listed and
 * marked read workspace B's rows; a person with sixty notifications was told
 * they had fifty; and a Replies page whose replies were older than fifty other
 * notifications said there were none. The server scopes, filters, counts and
 * pages now; this file is the one place the web says what it wants.
 */

/** Rows per page. The server allows up to 100. */
export const INBOX_PAGE = 50

export type NotificationParams = {
  /** Only this workspace's notifications, and those that belong to none. */
  workspaceId?: string
  /** Only these types. An empty list means none of them, not "no filter". */
  types?: Iterable<string>
  view?: 'inbox' | 'later' | 'cleared' | 'all'
  unreadOnly?: boolean
  readOnly?: boolean
  /** The id of the last row of the previous page. */
  before?: string
  limit?: number
}

export function notificationsUrl(path: string, params: NotificationParams = {}): string {
  const q = new URLSearchParams()
  if (params.view) q.set('view', params.view)
  if (params.workspaceId) q.set('workspaceId', params.workspaceId)
  if (params.types !== undefined) q.set('types', [...params.types].join(','))
  if (params.unreadOnly) q.set('unreadOnly', 'true')
  if (params.readOnly) q.set('readOnly', 'true')
  if (params.before) q.set('before', params.before)
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  const query = q.toString()
  return query ? `${path}?${query}` : path
}

/** A stable cache-key part for a set of types, whatever order it was built in. */
export const typesKey = (types?: Iterable<string>): string =>
  types === undefined ? '*' : [...types].sort().join(',')

/**
 * Notifications a page at a time, newest first.
 *
 * Each request asks for one row more than a page and never shows it: whether
 * that row came back is how the page knows there is another, so "Load older"
 * is offered exactly when it will load something.
 */
export function useNotificationPages<T extends { id: string }>(
  key: readonly unknown[],
  params: Omit<NotificationParams, 'before' | 'limit'>,
  opts: { pageSize?: number; enabled?: boolean } = {},
) {
  const pageSize = opts.pageSize ?? INBOX_PAGE
  const query = useInfiniteQuery({
    queryKey: ['notifications', ...key],
    enabled: opts.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<T[]>(notificationsUrl('/notifications', { ...params, before: pageParam, limit: pageSize + 1 })),
    getNextPageParam: (last) => (last.length > pageSize ? last[pageSize - 1].id : undefined),
  })
  // De-duplicated as a guard, not a crutch: the cursor is a row, so pages do
  // not overlap — but a row shown twice would be clicked, cleared and counted
  // twice, and that is not worth trusting to every refetch getting it right.
  const seen = new Set<string>()
  const rows: T[] = []
  for (const page of query.data?.pages ?? []) {
    for (const row of page.slice(0, pageSize)) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
    }
  }
  return { ...query, rows }
}

/**
 * How many are unread, counted by the server — for a badge.
 *
 * One cache entry per scope, types and bucket, so the topbar bell and the
 * sidebar badge share a single request inside a workspace, as they always
 * did. The key's first part stays `notifications-unread-count`, which is what
 * every verb invalidates.
 */
export function useUnreadCount(
  params: Pick<NotificationParams, 'workspaceId' | 'types' | 'view'>,
  opts: { enabled?: boolean; refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: ['notifications-unread-count', params.workspaceId ?? '*', typesKey(params.types), params.view ?? 'inbox'],
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetchInterval,
    queryFn: () => api<{ count: number }>(notificationsUrl('/notifications/unread-count', params)),
  })
}
