/**
 * §5.1 Export items: "Get a CSV export of your Workspace data." — the
 * locations to export, a date format, and "Start export", which queues a job
 * and turns into "Preparing export…" and then "Download Export". The link is
 * also emailed, and expires an hour after it is made.
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { Button, Card, toast } from '@rundesk/ui'
import { EXPORT_DATE_FORMATS, type ExportDateFormat } from '@rundesk/imports'
import { refusalMessage } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { exportsApi, type LocationRef } from '../../lib/imports-exports-api'
import { getRealtimeSocket } from '../../lib/realtime'
import { LocationMultiSelect } from './location-pickers'
import { StepLabel } from './wizard-chrome'

export function ExportPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [locations, setLocations] = useState<LocationRef[]>([])
  const [dateFormat, setDateFormat] = useState<ExportDateFormat>('normal')
  const [exportId, setExportId] = useState<string | null>(null)

  const state = useQuery({
    queryKey: ['export-state', workspaceId, exportId],
    queryFn: () => exportsApi.status(workspaceId, exportId!),
    enabled: Boolean(exportId),
    refetchInterval: (q) => (q.state.data && ['pending', 'processing'].includes(q.state.data.status) ? 2_000 : false),
  })

  // The ready event arrives before the next poll would.
  useEffect(() => {
    if (!exportId) return
    const socket = getRealtimeSocket()
    const onEvent = (e: { type?: string; exportId?: string }) => {
      if (e?.type === 'export.ready' && e.exportId === exportId) {
        void qc.invalidateQueries({ queryKey: ['export-state', workspaceId, exportId] })
        void qc.invalidateQueries({ queryKey: ['imports-history', workspaceId] })
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [exportId, workspaceId, qc])

  const start = useMutation({
    mutationFn: () => exportsApi.start(workspaceId, { type: 'workspace_csv', locations, dateFormat }),
    onSuccess: (s) => {
      setExportId(s.id)
      void qc.invalidateQueries({ queryKey: ['imports-history', workspaceId] })
    },
    onError: (e) => toast.error(refusalMessage(e, t('ie.export.couldNotStart'))),
  })

  const s = state.data
  return (
    <Card className="p-5" data-testid="export-panel">
      <h3 className="font-display text-lg font-semibold">{t('ie.export.heading')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('ie.export.text')}{' '}
        <a href="/app/help" className="text-accent hover:underline">
          {t('ie.learnMore')}
        </a>
      </p>
      <div className="mt-5 space-y-4">
        <div>
          <StepLabel>{t('ie.export.locations')}</StepLabel>
          <LocationMultiSelect
            workspaceId={workspaceId}
            selected={selected}
            onChange={(next, locs) => {
              setSelected(next)
              setLocations(locs)
            }}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{t('ie.export.largeWarning')}</p>
        </div>
        <div>
          <StepLabel htmlFor="export-date-format">{t('ie.export.dateFormat')}</StepLabel>
          <select
            id="export-date-format"
            className="h-10 w-48 rounded-md border border-border bg-background px-3 text-sm"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as ExportDateFormat)}
            data-testid="export-date-format"
          >
            {EXPORT_DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => start.mutate()} disabled={!locations.length || start.isPending} className="disabled:opacity-40" data-testid="export-start">
            {t('ie.export.start')}
          </Button>
          {exportId && (
            <div className="flex items-center gap-2 text-sm" data-testid="export-progress">
              {!s || s.status === 'pending' || s.status === 'processing' ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('ie.export.preparing')}
                </span>
              ) : s.status === 'failed' ? (
                <span className="text-destructive">{s.error ?? t('ie.export.failed')}</span>
              ) : s.download ? (
                <Button variant="outline" asChild data-testid="export-download">
                  <a href={s.download.url}>
                    <Download className="mr-1.5 h-4 w-4" />
                    {t('ie.export.download')}
                  </a>
                </Button>
              ) : (
                <span className="text-muted-foreground">{t('ie.export.expired')}</span>
              )}
              {s?.status === 'completed' && <span className="text-xs text-muted-foreground">{t('ie.export.emailed', { count: s.rowCount ?? 0 })}</span>}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
