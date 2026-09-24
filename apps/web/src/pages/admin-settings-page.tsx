import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card } from '@rundesk/ui'
import { Settings } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'
import { FLAGS, DEFAULT_ENABLED_FLAGS } from '@rundesk/feature-flags'
import type { FlagKey } from '@rundesk/feature-flags'
import { AdminWorkspacePicker, useAdminWorkspace } from '../components/admin-workspace-picker'

type OverrideRow = {
  flagKey: FlagKey
  scope: string
  scopeId: string | null
  workspaceId: string | null
  enabled: boolean
  updatedAt: string
}

// `labelKey` references an i18n catalog entry; the raw `value` is the
// locale-independent flag identifier persisted to / compared against the API.
const WORKSPACE_SCOPED_FLAGS: { value: FlagKey; labelKey: TranslationKey }[] = [
  { value: FLAGS.INTEGRATIONS, labelKey: 'adminSettings.flag.integrations' },
  { value: FLAGS.TIME_TRACKING, labelKey: 'adminSettings.flag.timeTracking' },
  { value: FLAGS.REPORTING, labelKey: 'adminSettings.flag.reporting' },
  { value: FLAGS.DOCS, labelKey: 'adminSettings.flag.docs' },
  { value: FLAGS.GOALS, labelKey: 'adminSettings.flag.goals' },
  { value: FLAGS.SPRINTS, labelKey: 'adminSettings.flag.sprints' },
  { value: FLAGS.FORMS, labelKey: 'adminSettings.flag.forms' },
]

export function AdminSettingsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { workspaces, workspaceId: resolvedWorkspaceId, setWorkspaceId } = useAdminWorkspace()

  const overrides = useQuery({
    queryKey: ['feature-overrides', resolvedWorkspaceId],
    queryFn: () => api<OverrideRow[]>(`/feature-flags/workspace/${resolvedWorkspaceId}`),
    enabled: Boolean(resolvedWorkspaceId),
  })

  const setWorkspaceFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: FlagKey; enabled: boolean }) =>
      api(`/feature-flags/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: {
          enabled,
          scope: 'workspace',
          scopeId: resolvedWorkspaceId,
          workspaceId: resolvedWorkspaceId,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['feature-overrides', resolvedWorkspaceId] })
      await qc.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
    },
  })

  const latestByFlag = new Map<FlagKey, OverrideRow>()
  for (const row of overrides.data ?? []) {
    if (row.scope !== 'workspace') continue
    if (!latestByFlag.has(row.flagKey)) latestByFlag.set(row.flagKey, row)
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5 text-accent" />
          {t('adminSettings.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('adminSettings.subtitle')}</p>
      </header>

      <Card className="p-4">
        <AdminWorkspacePicker
          testId="admin-settings-workspace"
          workspaces={workspaces.data}
          value={resolvedWorkspaceId}
          onChange={setWorkspaceId}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          {t('adminSettings.featureSwitches')}
        </div>
        <ul className="divide-y divide-border">
          {WORKSPACE_SCOPED_FLAGS.map((flag) => {
            const row = latestByFlag.get(flag.value)
            // With no workspace override the flag falls back to the platform
            // default, so default-on features (Docs, Forms, Goals, Sprints…)
            // show as enabled rather than being mislabeled "disabled".
            const enabled = row ? row.enabled : DEFAULT_ENABLED_FLAGS.includes(flag.value)
            return (
              <li key={flag.value} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t(flag.labelKey)}</div>
                  <div className="text-xs text-muted-foreground">
                    {row?.updatedAt
                      ? t('adminSettings.updatedAt', { date: new Date(row.updatedAt).toLocaleString() })
                      : t('adminSettings.noOverride')}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={enabled ? 'default' : 'outline'}
                  onClick={() => setWorkspaceFlag.mutate({ key: flag.value, enabled: !enabled })}
                  disabled={setWorkspaceFlag.isPending || !resolvedWorkspaceId}
                >
                  {enabled ? t('adminSettings.enabled') : t('adminSettings.disabled')}
                </Button>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
