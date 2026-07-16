import { useNavigate } from '@tanstack/react-router'
import { api } from './api'

/** The `target` blob the notifications API attaches to every row (Plan §10.1). */
export type NotificationTarget = {
  url?: string
  entityType?: string
  entityId?: string
} | null

/**
 * Resolve a notification's target into an in-app destination path (Plan §10.1).
 * Honors an explicit `/app/...` deep link, resolves a task's *live* location
 * through the task-navigation endpoint (legacy `/tasks/:id` urls included), and
 * falls back to the workspace root. Returns null when there's nothing to open.
 * Shared by the inbox page and the topbar notification bell so both navigate
 * identically.
 */
export async function resolveNotificationDestination(
  target: NotificationTarget | undefined,
  workspaceId?: string,
): Promise<string | null> {
  const raw = target?.url?.trim()
  if (!raw) return null
  let path = raw
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw)
      path = `${parsed.pathname}${parsed.search}${parsed.hash}`
    } catch {
      path = raw
    }
  }
  if (path.startsWith('/app/') && !/\/tasks\/[0-9a-f-]{36}$/i.test(path)) return path

  const taskIdFromTarget = target?.entityType === 'task' ? target.entityId : null
  const taskIdFromLegacyPath = path.match(/\/tasks\/([0-9a-f-]{36})$/i)?.[1] ?? null
  const taskId = taskIdFromTarget ?? taskIdFromLegacyPath
  if (!taskId) return path.startsWith('/') ? path : null

  try {
    const nav = await api<{ url: string }>(`/tasks/${taskId}/navigation`)
    return nav.url
  } catch {
    return workspaceId ? `/app/${workspaceId}` : null
  }
}

/**
 * Navigate to a resolved destination path, splitting any query string into
 * TanStack Router's `search` object so deep links like
 * `/app/:ws/chat?channel=..&message=..` actually carry their params.
 */
export function goToDestination(navigate: ReturnType<typeof useNavigate>, dest: string): void {
  const qIdx = dest.indexOf('?')
  if (qIdx === -1) {
    navigate({ to: dest as any })
    return
  }
  const pathname = dest.slice(0, qIdx)
  const params = new URLSearchParams(dest.slice(qIdx + 1))
  const search: Record<string, string> = {}
  params.forEach((v, k) => {
    search[k] = v
  })
  navigate({ to: pathname as any, search: search as any })
}
