import { cn } from '@rundesk/ui'
import { useCustomDomainStore } from '../lib/custom-domain'
import { useTranslation } from '../lib/i18n'

/**
 * Compact workspace mark (logo + name, plus "Powered by Rundesk") surfaced on
 * the entry screens when the app is served from a verified custom domain.
 * Renders nothing on the primary host or before the lookup resolves, so it
 * never blocks or shifts the normal app.
 *
 * `compact` renders a single inline row (no tagline) for tight spots like the
 * landing header.
 */
export function CustomDomainBrandMark({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const workspace = useCustomDomainStore((s) => (s.status === 'resolved' ? s.workspace : null))
  if (!workspace) return null

  const logo = workspace.logoUrl ? (
    <img
      src={workspace.logoUrl}
      alt={workspace.name}
      className="h-8 w-8 rounded-md object-cover ring-1 ring-border/60"
    />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-gradient text-sm font-semibold text-white">
      {workspace.name.charAt(0).toUpperCase()}
    </div>
  )

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
        {logo}
        <span className="font-display text-base font-semibold tracking-tight truncate">
          {workspace.name}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2.5">
        {logo}
        <span className="font-display text-lg font-semibold tracking-tight truncate max-w-[220px]">
          {workspace.name}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground">{t('customDomain.poweredBy')}</span>
    </div>
  )
}
