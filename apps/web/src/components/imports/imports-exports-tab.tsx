/**
 * Settings › Imports / Exports (§1).
 *
 * The header's two pills switch between Export items (§5) and Import items
 * (§1.4, §7). The Import side is the history once anything has been imported,
 * else the source grid; Spreadsheet opens its wizard in place. The address
 * carries the state, as the spec's query parameters do: `?import=false` is the
 * Export tab, `?spreadsheet=true` the Spreadsheet importer, `?importId=` a
 * report, and a Space, Folder, Project or List can be handed in as the
 * destination (`locationType` + `locationId`).
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@rundesk/ui'
import { usePermissions } from '../../hooks/use-permissions'
import { useTranslation } from '../../lib/i18n'
import { importsApi, type LocationType } from '../../lib/imports-exports-api'
import { getRealtimeSocket } from '../../lib/realtime'
import { isCsvSource, type CsvSourceKey } from '@rundesk/imports'
import { ExportPanel } from './export-panel'
import { ImportDetailsDialog, ImportHistory } from './import-history'
import { flattenTree } from './location-tree'
import { useLocationTree } from './location-pickers'
import { SourceGrid, type SourceId } from './source-grid'
import { SpreadsheetWizard } from './spreadsheet-wizard'

export type ImportsExportsSearch = {
  import?: boolean
  spreadsheet?: boolean
  /** An app whose own export is imported through the Spreadsheet importer (`?asana=true` arrives as this). */
  source?: CsvSourceKey
  importId?: string
  via?: string
  locationType?: LocationType
  locationId?: string
}

export function ImportsExportsTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const search = useSearch({ from: '/app/$workspaceId/settings' }) as ImportsExportsSearch & { tab?: string }
  const permissions = usePermissions(workspaceId)
  const mayImport = permissions.can('workspace.import') !== false
  const mayExport = permissions.can('workspace.export') !== false
  const mode: 'import' | 'export' = search.import === false || !mayImport ? 'export' : 'import'
  const [showSources, setShowSources] = useState(false)

  const go = (next: Partial<ImportsExportsSearch>) =>
    navigate({
      to: '/app/$workspaceId/settings',
      params: { workspaceId },
      search: { tab: 'importsExports', ...next },
    })

  const history = useQuery({
    queryKey: ['imports-history', workspaceId],
    queryFn: () => importsApi.history(workspaceId),
    enabled: mayImport && permissions.loaded,
    // §7 "Live updates via the existing realtime channel or polling every 5s".
    refetchInterval: (q) => (q.state.data?.items.some((i) => ['pending', 'processing'].includes(i.status)) ? 5_000 : false),
  })

  // The runner tells whoever started a run how it is going.
  useEffect(() => {
    const socket = getRealtimeSocket()
    const onEvent = (e: { type?: string; workspaceId?: string; jobId?: string }) => {
      if (!e?.type || !/^(import|export)\./.test(e.type) || e.workspaceId !== workspaceId) return
      void qc.invalidateQueries({ queryKey: ['imports-history', workspaceId] })
      if (e.jobId) void qc.invalidateQueries({ queryKey: ['import-report', workspaceId, e.jobId] })
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [workspaceId, qc])

  // A destination handed in from a Space's "+" menu: preselected in the wizard.
  const { tree } = useLocationTree(workspaceId)
  const handed = search.locationType && search.locationId ? flattenTree(tree).find((n) => n.type === search.locationType && n.id === search.locationId) : undefined

  const items = history.data?.items ?? []
  const pick = (id: SourceId) => {
    if (id === 'spreadsheet' || isCsvSource(id)) {
      return go({
        spreadsheet: true,
        source: isCsvSource(id) ? id : undefined,
        via: 'settings',
        locationType: search.locationType,
        locationId: search.locationId,
      })
    }
    navigate({ to: '/app/$workspaceId/import', params: { workspaceId }, search: { tab: id === 'document' ? 'doc' : 'clickup' } })
  }

  return (
    <div className="space-y-5" data-testid="imports-exports">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold">{t('ie.title')}</h2>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={t('ie.about')} className="text-muted-foreground hover:text-foreground">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t('ie.about')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <a href="/app/help" className="text-sm text-accent hover:underline">
            {t('ie.learnMore')}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-full border border-border/60 p-0.5" role="group">
          {mayExport && (
            <button
              type="button"
              aria-pressed={mode === 'export'}
              onClick={() => go({ import: false })}
              className={cn('rounded-full px-3 py-1 text-sm', mode === 'export' ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground')}
              data-testid="pill-export"
            >
              {t('ie.exportItems')}
            </button>
          )}
          {mayImport && (
            <button
              type="button"
              aria-pressed={mode === 'import'}
              onClick={() => go({})}
              className={cn('rounded-full px-3 py-1 text-sm', mode === 'import' ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground')}
              data-testid="pill-import"
            >
              {t('ie.importItems')}
            </button>
          )}
        </div>
      </header>

      {mode === 'export' ? (
        mayExport ? (
          <ExportPanel workspaceId={workspaceId} />
        ) : null
      ) : (
        <>
          {/* §1.2 — imports are made on a desktop browser. */}
          <p className="rounded-md border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground md:hidden" data-testid="import-mobile-note">
            {t('ie.mobileOnly')}
          </p>
          <div className="hidden md:block">
            {search.spreadsheet ? (
              <SpreadsheetWizard
                key={search.source ?? 'spreadsheet'}
                workspaceId={workspaceId}
                source={search.source}
                initialLocation={handed ? { type: handed.type, id: handed.id, path: handed.path } : null}
                onExit={() => go({})}
                onStarted={() => {
                  void qc.invalidateQueries({ queryKey: ['imports-history', workspaceId] })
                  setShowSources(false)
                  go({})
                }}
              />
            ) : !showSources && items.length > 0 ? (
              <ImportHistory
                workspaceId={workspaceId}
                items={items}
                loading={history.isLoading}
                onNewImport={() => setShowSources(true)}
                onOpen={(id) => go({ importId: id })}
              />
            ) : history.isLoading ? null : (
              <SourceGrid
                onPick={pick}
                onBack={items.length > 0 ? () => setShowSources(false) : undefined}
                onExportInstead={mayExport ? () => go({ import: false }) : undefined}
              />
            )}
          </div>
        </>
      )}

      <ImportDetailsDialog workspaceId={workspaceId} id={search.importId ?? null} onClose={() => go({})} />
    </div>
  )
}
