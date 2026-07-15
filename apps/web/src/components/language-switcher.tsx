import { Languages } from 'lucide-react'
import { cn } from '@rundesk/ui'
import { useTranslation, LOCALE_LABELS, type Locale } from '../lib/i18n'

/**
 * Locale picker (Plan §13). Uses the i18n context so it persists to localStorage
 * + the account and flips text direction. Works on the login page (anonymous)
 * and in settings.
 */
export function LanguageSwitcher({ className, withIcon = true }: { className?: string; withIcon?: boolean }) {
  const { locale, setLocale, locales } = useTranslation()
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {withIcon && <Languages className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="h-8 rounded-md border border-border/70 bg-background px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </div>
  )
}
