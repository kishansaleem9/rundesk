import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Badge,
  cn,
} from '@rundesk/ui'
import { Repeat, Calendar, Check } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

type Mode = 'daily' | 'weekly' | 'monthly'

export type RecurrenceRule = {
  mode: Mode
  interval?: number
  weekdays?: number[]
  dayOfMonth?: number
  skipWeekends?: boolean
}

// Weekday buttons in Mon→Sun display order. Each value is its JS getDay()
// number (0=Sun … 6=Sat) so what we store matches the backend's convention
// exactly; the visible label is derived per-locale (see weekdayName).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

// The `value` is the persisted Mode identifier; `labelKey`/`unitKey` reference
// i18n catalog entries resolved at render time.
const MODES = [
  { value: 'daily', labelKey: 'recurringTask.freq.daily', unitKey: 'recurringTask.unit.day' },
  { value: 'weekly', labelKey: 'recurringTask.freq.weekly', unitKey: 'recurringTask.unit.week' },
  { value: 'monthly', labelKey: 'recurringTask.freq.monthly', unitKey: 'recurringTask.unit.month' },
] as const

// Jan 1 2023 was a Sunday, so a fixed reference week turns a getDay() number
// into a localized weekday name without hardcoding any language.
function weekdayName(locale: string, day: number, width: 'narrow' | 'short'): string {
  return new Date(2023, 0, 1 + day).toLocaleDateString(locale, { weekday: width })
}

export function RecurringTaskDialog({
  open,
  onOpenChange,
  initialRule,
  onSubmit,
  saving,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialRule?: RecurrenceRule | null
  onSubmit: (rule: RecurrenceRule) => void
  saving?: boolean
}) {
  const { t, tCount, locale } = useTranslation()
  const [mode, setMode] = useState<Mode>('weekly')
  const [days, setDays] = useState<Set<number>>(new Set([1, 3, 5]))
  const [interval, setInterval] = useState(1)
  const [skipWeekends, setSkipWeekends] = useState(false)
  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0]

  // Hydrate from the task's existing rule each time the dialog opens.
  useEffect(() => {
    if (!open) return
    if (initialRule) {
      setMode(initialRule.mode)
      setInterval(Math.max(1, initialRule.interval ?? 1))
      setSkipWeekends(!!initialRule.skipWeekends)
      if (initialRule.weekdays?.length) setDays(new Set(initialRule.weekdays))
    } else {
      setMode('weekly')
      setInterval(1)
      setSkipWeekends(false)
      setDays(new Set([1, 3, 5]))
    }
  }, [open, initialRule])

  function summary() {
    if (mode === 'daily') {
      return skipWeekends
        ? tCount('recurringTask.summaryDailySkip', interval)
        : tCount('recurringTask.summaryDaily', interval)
    }
    if (mode === 'weekly') {
      const picked = [...days].sort().map((d) => weekdayName(locale, d, 'short')).join(', ')
      return tCount('recurringTask.summaryWeekly', interval, { days: picked || '—' })
    }
    return tCount('recurringTask.summaryMonthly', interval)
  }

  const submit = () => {
    const rule: RecurrenceRule = { mode, interval }
    if (mode === 'weekly') rule.weekdays = [...days]
    if (mode === 'daily') rule.skipWeekends = skipWeekends
    onSubmit(rule)
  }

  const canSubmit = mode !== 'weekly' || days.size > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient text-white shadow-sm">
              <Repeat className="h-3.5 w-3.5" />
            </span>
            {t('recurringTask.title')}
          </DialogTitle>
          <DialogDescription>
            {t('recurringTask.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  'rounded-lg border px-2 py-2.5 text-xs font-medium capitalize transition-all',
                  mode === m.value
                    ? 'border-accent bg-accent/15 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:bg-card/60',
                )}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border/40 bg-card/30 p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('recurringTask.repeatEvery')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={interval}
                  onChange={(e) => setInterval(Math.min(52, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-20"
                />
                <span className="text-sm capitalize text-muted-foreground">
                  {t(activeMode.unitKey)}
                </span>
              </div>
            </div>

            {mode === 'weekly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('recurringTask.onTheseDays')}</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAY_ORDER.map((day, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setDays((s) => {
                          const n = new Set(s)
                          if (n.has(day)) n.delete(day)
                          else n.add(day)
                          return n
                        })
                      }
                      className={cn(
                        'rounded-md border h-9 text-xs font-medium transition-all',
                        days.has(day)
                          ? 'border-transparent bg-brand-gradient text-white'
                          : 'border-border/60 text-muted-foreground hover:bg-card/60',
                      )}
                    >
                      {weekdayName(locale, day, 'narrow')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'daily' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} />
                {t('recurringTask.skipWeekends')}
              </label>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
            <Calendar className="h-4 w-4 text-accent shrink-0" />
            <Badge variant="soft" className="text-[10px] uppercase">{t('recurringTask.preview')}</Badge>
            <span className="text-sm">{summary()}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="gradient" onClick={submit} disabled={!canSubmit || saving}>
            <Check className="h-3.5 w-3.5" /> {saving ? t('common.saving') : t('recurringTask.setRecurrence')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
