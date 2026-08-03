import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, toast } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

/**
 * A5.12 — starter layouts, so a new dashboard doesn't have to be assembled card
 * by card. Same shape as the built-in doc templates one folder over: the
 * definitions ship with the client and land as an ordinary preset, so nothing
 * about ownership, sharing or editing has to know they were seeded.
 */

type StarterWidget = { id: string; type: string; w: 1 | 2 | 3; h: 1 | 2 }

export type DashboardTemplate = {
  id: string
  nameKey: TranslationKey
  descKey: TranslationKey
  emoji: string
  // The preset name is persisted user content, so it stays as data.
  name: string
  layout: StarterWidget[]
}

const w = (type: string, width: 1 | 2 | 3 = 1, height: 1 | 2 = 1, index = 0): StarterWidget => ({
  id: `${type}-${index}`,
  type,
  w: width,
  h: height,
})

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'team-pulse',
    nameKey: 'dashboardTemplates.name.teamPulse',
    descKey: 'dashboardTemplates.desc.teamPulse',
    emoji: '📊',
    name: 'Team pulse',
    layout: [
      w('tasks-due', 1, 1, 1),
      w('overdue', 1, 1, 2),
      w('completion', 1, 1, 3),
      w('team-load', 2, 2, 4),
      w('activity', 3, 1, 5),
    ],
  },
  {
    id: 'sprint',
    nameKey: 'dashboardTemplates.name.sprint',
    descKey: 'dashboardTemplates.desc.sprint',
    emoji: '🏃',
    name: 'Sprint tracking',
    layout: [
      w('sprint-burndown', 2, 2, 1),
      w('pie-status', 1, 1, 2),
      w('bar-priority', 1, 1, 3),
      w('task-list', 3, 1, 4),
    ],
  },
  {
    id: 'delivery',
    nameKey: 'dashboardTemplates.name.delivery',
    descKey: 'dashboardTemplates.desc.delivery',
    emoji: '⏱',
    name: 'Time & delivery',
    layout: [
      w('time', 1, 1, 1),
      w('completion', 1, 1, 2),
      w('overdue', 1, 1, 3),
      w('project-health', 2, 2, 4),
      w('goals', 2, 2, 5),
    ],
  },
]

export function DashboardTemplateCards({
  workspaceId,
  onCreated,
}: {
  workspaceId: string
  onCreated: (presetId: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const createFromTemplate = useMutation({
    mutationFn: (template: DashboardTemplate) =>
      api<{ id: string }>('/dashboards', {
        method: 'POST',
        body: { workspaceId, name: template.name, layout: template.layout },
      }),
    onSuccess: async (preset) => {
      await qc.invalidateQueries({ queryKey: ['dashboard-presets', workspaceId] })
      onCreated(preset.id)
      toast.success(t('dashboardTemplates.created'))
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('dashboardTemplates.couldNotCreate')),
  })

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">{t('dashboardTemplates.title')}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{t('dashboardTemplates.subtitle')}</p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        {DASHBOARD_TEMPLATES.map((template) => (
          <div
            key={template.id}
            className="rounded-lg border border-border/60 bg-card/40 p-3 flex flex-col gap-1"
          >
            <div className="text-xl">{template.emoji}</div>
            <div className="text-sm font-medium">{t(template.nameKey)}</div>
            <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{t(template.descKey)}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 self-start"
              disabled={createFromTemplate.isPending}
              onClick={() => createFromTemplate.mutate(template)}
            >
              {t('dashboardTemplates.use')}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
