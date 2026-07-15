import { useParams } from '@tanstack/react-router'
import { DocsPanel } from '../components/docs-panel'
import { useTranslation } from '../lib/i18n'

export function DocsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/docs' })
  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{t('common.workspace')}</div>
        <h1 className="font-display text-2xl font-semibold text-foreground">{t('nav.docs')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('docsPage.subtitle')}
        </p>
      </header>
      <div className="flex-1 min-h-0 p-6">
        <DocsPanel workspaceId={workspaceId} />
      </div>
    </div>
  )
}
