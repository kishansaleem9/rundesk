import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { Users, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'
import { InlineSkeleton } from '../components/loading-skeletons'
import { AdminWorkspacePicker, useAdminWorkspace } from '../components/admin-workspace-picker'

type Member = {
  userId: string
  email: string
  displayName: string
  role: string
}

// `labelKey` references an i18n catalog entry; the raw `value` is the
// locale-independent role identifier persisted to / compared against the API.
const ROLES: { value: string; labelKey: TranslationKey }[] = [
  { value: 'workspace_admin', labelKey: 'adminUsers.role.workspaceAdmin' },
  { value: 'manager', labelKey: 'adminUsers.role.manager' },
  { value: 'member', labelKey: 'adminUsers.role.member' },
  { value: 'guest', labelKey: 'adminUsers.role.guest' },
]

export function AdminUsersPage() {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const { workspaces, workspaceId: resolvedWorkspaceId, setWorkspaceId } = useAdminWorkspace()
  const members = useQuery({
    queryKey: ['admin-members', resolvedWorkspaceId],
    queryFn: () => api<Member[]>(`/workspaces/${resolvedWorkspaceId}/members`),
    enabled: Boolean(resolvedWorkspaceId),
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api(`/workspaces/${resolvedWorkspaceId}/members/${userId}`, {
        method: 'PATCH',
        body: { role },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-members', resolvedWorkspaceId] })
    },
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/workspaces/${resolvedWorkspaceId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-members', resolvedWorkspaceId] })
    },
  })

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return members.data ?? []
    return (members.data ?? []).filter((m) =>
      `${m.displayName} ${m.email} ${m.role}`.toLowerCase().includes(needle),
    )
  }, [members.data, search])

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          {t('adminUsers.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('adminUsers.subtitle')}</p>
      </header>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <AdminWorkspacePicker
            testId="admin-users-workspace"
            workspaces={workspaces.data}
            value={resolvedWorkspaceId}
            onChange={setWorkspaceId}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('adminUsers.searchPlaceholder')}
            leadingIcon={<Search className="h-4 w-4" />}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          {tCount('adminUsers.membersCount', filtered.length)}
        </div>
        {members.isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground"><InlineSkeleton /></div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t('adminUsers.noMatchingMembers')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((member) => (
              <li key={member.userId} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{member.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                </div>
                <select
                  value={member.role}
                  onChange={(e) => updateRole.mutate({ userId: member.userId, role: e.target.value })}
                  className="rounded border border-border bg-card px-2 py-1 text-xs"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>{t(role.labelKey)}</option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeMember.mutate(member.userId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
