import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react'
import { Button, cn } from '@rundesk/ui'
import { useTranslation } from '../../lib/i18n'

/**
 * §1.5 — the wizard's shared chrome: "STEP 2 OF 3" in small caps, a large
 * title and an optional subtitle, the form centred at about 560px, Back
 * bottom-left (always enabled) and the primary action bottom-right (dimmed
 * until the step is valid).
 */
export function WizardStep({
  step,
  of,
  title,
  subtitle,
  wide,
  children,
  onBack,
  primary,
}: {
  step: number
  of: number
  title: string
  subtitle?: string
  /** The grid steps use the whole width; the form steps stay at ~560px. */
  wide?: boolean
  children: ReactNode
  onBack?: () => void
  primary?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; testId?: string; arrow?: boolean }
}) {
  const { t } = useTranslation()
  return (
    // pb-40: room to scroll Back and the primary button clear of a corner banner (cookie consent,
    // announcements) — §10, nothing may cover the wizard.
    <div className={cn('mx-auto w-full pb-40', wide ? 'max-w-none' : 'max-w-[560px]')} data-testid={`import-step-${step}`}>
      <div className="text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground" data-testid="import-step-indicator">
          {t('ie.stepOf', { step, of })}
        </div>
        <h2 className="mt-2 font-display text-2xl font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="mt-6">{children}</div>
      {(onBack || primary) && (
        <div className="mt-8 flex items-center justify-between gap-3">
          {onBack ? (
            <Button variant="ghost" onClick={onBack} data-testid="import-back">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t('ie.back')}
            </Button>
          ) : (
            <span />
          )}
          {primary && (
            <Button
              onClick={primary.onClick}
              disabled={primary.disabled || primary.busy}
              className="disabled:opacity-40"
              data-testid={primary.testId ?? 'import-primary'}
            >
              {primary.busy ? t('ie.working') : primary.label}
              {primary.arrow && !primary.busy && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Small-caps field label, as §2.2 writes them ("CHOOSE WHERE TO IMPORT YOUR TASKS."). */
export function StepLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </label>
  )
}

/** §10 — every importer's "What gets imported / What doesn't", collapsed until asked for. */
export function ImportedNotImported({ imported, notImported }: { imported: string[]; notImported: string[] }) {
  const { t } = useTranslation()
  return (
    <details className="group mt-6 rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm" data-testid="import-what-gets-imported">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
        {t('ie.whatGetsImported')}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold text-success">{t('ie.imported')}</div>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            {imported.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-destructive">{t('ie.notImported')}</div>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            {notImported.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  )
}
