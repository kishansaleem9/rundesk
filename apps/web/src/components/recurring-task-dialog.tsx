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

type Mode = 'daily' | 'weekly' | 'monthly'

export type RecurrenceRule = {
  mode: Mode
  interval?: number
  weekdays?: number[]
  dayOfMonth?: number
  skipWeekends?: boolean
}

// Weekday buttons in Mon→Sun display order, each carrying its JS getDay() value
// (0=Sun … 6=Sat) so what we store matches the backend's convention exactly.
const WEEKDAYS: Array<{ label: string; day: number }> = [
  { label: 'M', day: 1 },
  { label: 'T', day: 2 },
  { label: 'W', day: 3 },
  { label: 'T', day: 4 },
  { label: 'F', day: 5 },
  { label: 'S', day: 6 },
  { label: 'S', day: 0 },
]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  const [mode, setMode] = useState<Mode>('weekly')
  const [days, setDays] = useState<Set<number>>(new Set([1, 3, 5]))
  const [interval, setInterval] = useState(1)
  const [skipWeekends, setSkipWeekends] = useState(false)

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
    const every = interval > 1 ? `${interval} ` : ''
    if (mode === 'daily') return `Every ${every}day${interval > 1 ? 's' : ''}${skipWeekends ? ', skipping weekends' : ''}`
    if (mode === 'weekly') {
      const picked = [...days].sort().map((d) => DAY_NAMES[d]).join(', ')
      return `Every ${every}week${interval > 1 ? 's' : ''} on ${picked || '—'}`
    }
    return `Every ${every}month${interval > 1 ? 's' : ''}`
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
            Custom recurrence
          </DialogTitle>
          <DialogDescription>
            We&apos;ll auto-create the next instance when this task is completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-lg border px-2 py-2.5 text-xs font-medium capitalize transition-all',
                  mode === m
                    ? 'border-accent bg-accent/15 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:bg-card/60',
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border/40 bg-card/30 p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Repeat every</Label>
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
                  {mode === 'daily' ? 'day(s)' : mode === 'weekly' ? 'week(s)' : 'month(s)'}
                </span>
              </div>
            </div>

            {mode === 'weekly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">On these days</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map(({ label, day }, i) => (
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
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'daily' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} />
                Skip weekends
              </label>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
            <Calendar className="h-4 w-4 text-accent shrink-0" />
            <Badge variant="soft" className="text-[10px] uppercase">Preview</Badge>
            <span className="text-sm">{summary()}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="gradient" onClick={submit} disabled={!canSubmit || saving}>
            <Check className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Set recurrence'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
