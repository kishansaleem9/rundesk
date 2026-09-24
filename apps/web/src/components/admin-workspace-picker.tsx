import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@rundesk/ui'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

/** A workspace as `GET /workspaces` lists it: the signed-in person's own, the first joined first. */
export type AdminWorkspaceEntry = {
  workspace: { id: string; name: string; slug: string }
  role: string
}

/**
 * The workspace a console page works on: the one picked, else the first the
 * admin joined. One rule for the console's pages that work on one workspace —
 * users, webhooks, settings, integrations and the audit log. The first four
 * each kept a copy of it; the audit log had none, and read the first workspace
 * with no way to pick another (`found-24-sep/admin-audit-reads-the-first-workspace`).
 */
export function useAdminWorkspace() {
  const [picked, setWorkspaceId] = useState('')
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<AdminWorkspaceEntry[]>('/workspaces'),
  })
  const workspaceId = picked || workspaces.data?.[0]?.workspace.id || ''
  return { workspaces, workspaceId, setWorkspaceId }
}

/** The console's workspace picker, over what `useAdminWorkspace` keeps. */
export function AdminWorkspacePicker({
  workspaces,
  value,
  onChange,
  testId,
  className,
}: {
  workspaces: AdminWorkspaceEntry[] | undefined
  value: string
  onChange: (workspaceId: string) => void
  testId: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <select
      data-testid={testId}
      aria-label={t('common.workspace')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('rounded-md border border-border bg-card px-3 py-2 text-sm w-full md:w-auto', className)}
    >
      {(workspaces ?? []).map((entry) => (
        <option key={entry.workspace.id} value={entry.workspace.id}>
          {entry.workspace.name} ({entry.workspace.slug})
        </option>
      ))}
    </select>
  )
}
