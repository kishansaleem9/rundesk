/**
 * §1.4 "Select source of import". Only importers that can import are drawn:
 * a tile with nothing behind it is the facade `test/e2e/imports.mjs` exists
 * to refuse. The other apps arrive with their importers (Phases 2 and 3).
 */

import { ArrowLeft, ChevronRight, FileSpreadsheet, FileText, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation, type TranslationKey } from '../../lib/i18n'

export type SourceId = 'spreadsheet' | 'document' | 'clickup'

type Tile = { id: SourceId; nameKey: TranslationKey; icon: LucideIcon; badges: TranslationKey[] }

const LOCAL_FILES: Tile[] = [
  { id: 'spreadsheet', nameKey: 'ie.source.spreadsheet', icon: FileSpreadsheet, badges: ['ie.badge.tasks'] },
  { id: 'document', nameKey: 'ie.source.document', icon: FileText, badges: ['ie.badge.docs'] },
]

const APPS: Tile[] = [{ id: 'clickup', nameKey: 'ie.source.clickup', icon: Workflow, badges: ['ie.badge.tasks'] }]

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
  const section = (titleKey: TranslationKey, tiles: Tile[]) => (
    <div className="space-y-1.5">
      <div className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{t(titleKey)}</div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onPick(tile.id)}
            className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent/10"
            data-testid={`source-${tile.id}`}
          >
            <tile.icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{t(tile.nameKey)}</span>
            {tile.badges.map((b) => (
              <span key={b} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {t(b)}
              </span>
            ))}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <div className="mx-auto max-w-[560px]" data-testid="source-grid">
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
        {section('ie.fromLocalFiles', LOCAL_FILES)}
        {section('ie.fromApps', APPS)}
      </div>
    </div>
  )
}
