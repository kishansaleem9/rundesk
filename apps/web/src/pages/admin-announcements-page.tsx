import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Label } from '@rundesk/ui'
import { Megaphone } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { AnnouncementsPanel } from '../components/announcements-panel'

/**
 * The platform console's Announcements: a workspace picker over the same panel
 * workspace Settings offers as its Announcements tab, so there is one compose
 * form and one list, each asking `announcement.manage`
 * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
 */
export function AnnouncementsAdminPage() {
  const { t } = useTranslation()
  const workspacesQuery = useQuery({
    queryKey: ['announcement-admin-workspaces'],
    // GET /workspaces returns `{ workspace, role }[]`, not a flat workspace list —
    // reading `w.id`/`w.name` off the wrapper gave every <option> an empty value,
    // so the selected workspaceId was '' and Publish POSTed to `/workspaces//announcements` (404).
    queryFn: async () => {
      const rows = await api<Array<{ workspace: { id: string; name: string } }>>('/workspaces')
      return rows.map((r) => r.workspace).filter((w): w is { id: string; name: string } => Boolean(w?.id))
    },
  })
  const workspaces = workspacesQuery.data ?? []
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const workspaceId =
    selectedWorkspaceId && workspaces.some((w) => w.id === selectedWorkspaceId)
      ? selectedWorkspaceId
      : workspaces[0]?.id ?? ''

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          {t('adminAnnouncements.eyebrow')}
        </div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Megaphone className="h-4 w-4" />
          </span>
          {t('adminAnnouncements.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          {t('adminAnnouncements.subtitle')}
        </p>
        {workspaces.length > 0 && (
          <div className="mt-4 space-y-1.5 max-w-xs">
            <Label htmlFor="announcement-workspace">{t('common.workspace')}</Label>
            <select
              id="announcement-workspace"
              value={workspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              disabled={workspaces.length < 2}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* No workspace chosen, no form: a Publish with nowhere to go was a 404. */}
      {workspaceId && <AnnouncementsPanel key={workspaceId} workspaceId={workspaceId} heading={false} />}
    </div>
  )
}
