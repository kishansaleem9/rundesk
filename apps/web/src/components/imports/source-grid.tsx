/**
 * §1.4 "Select source of import" — every row of ClickUp's grid.
 *
 * Spreadsheet, Document and ClickUp open their importers. Asana, Jira,
 * Monday, Notion, Todoist, Trello and Wrike open the Spreadsheet importer for
 * that app's own export file, with its steps shown and its columns pre-mapped
 * (`@rundesk/imports` `CSV_SOURCES`). Basecamp, Confluence and Slack have no
 * task-shaped export to read: they need connectors (§4, Phase 3), and until
 * then their rows say "Coming soon" and do nothing — a tile that looks
 * clickable and imports nothing is the facade this page must not be.
 */

import { ArrowLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react'
import { cn } from '@rundesk/ui'
import { CSV_SOURCES, type CsvSourceKey } from '@rundesk/imports'
import { useTranslation, type TranslationKey } from '../../lib/i18n'

export type SourceId = 'spreadsheet' | 'document' | 'clickup' | CsvSourceKey

type Tile = {
  id: SourceId | 'basecamp' | 'confluence' | 'slack'
  name: string
  mark: { letter: string; bg: string } | 'sheet' | 'doc'
  badges: TranslationKey[]
  soon?: boolean
}

/** A small coloured letter in each app's own colour — not its logo, which is its owner's. */
const APP_COLOURS: Record<string, string> = {
  asana: '#f06a6a',
  basecamp: '#1d9b51',
  clickup: '#7b68ee',
  confluence: '#1868db',
  jira: '#0c66e4',
  monday: '#ff3d57',
  notion: '#37352f',
  slack: '#4a154b',
  todoist: '#e44332',
  trello: '#0079bf',
  wrike: '#08cf65',
}

const app = (id: Tile['id'], name: string, badges: TranslationKey[], soon?: boolean): Tile => ({
  id,
  name,
  mark: { letter: name.slice(0, 1), bg: APP_COLOURS[id] ?? '#64748b' },
  badges,
  soon,
})

const APPS: Tile[] = [
  app('asana', CSV_SOURCES.asana.label, ['ie.badge.tasks']),
  app('basecamp', 'Basecamp', ['ie.badge.tasks'], true),
  app('clickup', 'ClickUp', ['ie.badge.tasks']),
  app('confluence', 'Confluence', ['ie.badge.docs'], true),
  app('jira', CSV_SOURCES.jira.label, ['ie.badge.tasks']),
  app('monday', CSV_SOURCES.monday.label, ['ie.badge.tasks']),
  app('notion', CSV_SOURCES.notion.label, ['ie.badge.tasks']),
  app('slack', 'Slack', ['ie.badge.channels', 'ie.badge.users'], true),
  app('todoist', CSV_SOURCES.todoist.label, ['ie.badge.tasks']),
  app('trello', CSV_SOURCES.trello.label, ['ie.badge.tasks']),
  app('wrike', CSV_SOURCES.wrike.label, ['ie.badge.tasks']),
]

export function AppMark({ mark, className }: { mark: Tile['mark']; className?: string }) {
  if (mark === 'sheet') return <FileSpreadsheet className={cn('h-5 w-5 text-muted-foreground', className)} />
  if (mark === 'doc') return <FileText className={cn('h-5 w-5 text-muted-foreground', className)} />
  return (
    <span
      aria-hidden
      className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white', className)}
      style={{ background: mark.bg }}
    >
      {mark.letter}
    </span>
  )
}

/** The mark for a history row's source. */
export function sourceMark(source: string, preset?: string | null): Tile['mark'] {
  if (preset && APP_COLOURS[preset]) return { letter: (CSV_SOURCES[preset as CsvSourceKey]?.label ?? preset).slice(0, 1), bg: APP_COLOURS[preset] }
  if (source === 'clickup_csv') return { letter: 'C', bg: APP_COLOURS.clickup }
  return 'sheet'
}

export function SourceGrid({
  onPick,
  onBack,
  onExportInstead,
}: {
  onPick: (id: SourceId) => void
  /** "Back to imports" — only when there is a history to go back to. */
  onBack?: () => void
  onExportInstead?: () => void
}) {
  const { t } = useTranslation()
  const localFiles: Tile[] = [
    { id: 'spreadsheet', name: t('ie.source.spreadsheet'), mark: 'sheet', badges: ['ie.badge.tasks'] },
    { id: 'document', name: t('ie.source.document'), mark: 'doc', badges: ['ie.badge.docs'] },
  ]
  const section = (titleKey: TranslationKey, tiles: Tile[]) => (
    <div className="space-y-1.5">
      <div className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t(titleKey)}</div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={tile.soon}
            aria-disabled={tile.soon}
            onClick={() => !tile.soon && onPick(tile.id as SourceId)}
            className={cn(
              'flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0',
              tile.soon ? 'cursor-not-allowed opacity-60' : 'hover:bg-accent/10',
            )}
            data-testid={`source-${tile.id}`}
          >
            <AppMark mark={tile.mark} />
            <span className="w-40 shrink-0 text-sm font-medium">{tile.name}</span>
            <span className="flex flex-1 flex-wrap gap-1.5">
              {tile.badges.map((b) => (
                <span key={b} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {t(b)}
                </span>
              ))}
            </span>
            {tile.soon ? (
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground" data-testid={`source-${tile.id}-soon`}>
                {t('ie.comingSoon')}
              </span>
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <div className="mx-auto max-w-[640px]" data-testid="source-grid">
      <div className="mb-4 flex items-center justify-between text-sm">
        {onBack ? (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" data-testid="back-to-imports">
            <ArrowLeft className="h-4 w-4" />
            {t('ie.backToImports')}
          </button>
        ) : (
          <span />
        )}
        {onExportInstead && (
          <button type="button" onClick={onExportInstead} className="text-accent hover:underline" data-testid="export-instead">
            {t('ie.exportInstead')}
          </button>
        )}
      </div>
      <h2 className="mb-5 text-center font-display text-2xl font-semibold">{t('ie.selectSource')}</h2>
      <div className="space-y-5">
        {section('ie.fromLocalFiles', localFiles)}
        {section('ie.fromApps', APPS)}
      </div>
    </div>
  )
}
