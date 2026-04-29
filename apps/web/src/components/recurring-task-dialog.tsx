import { useState } from 'react'
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
import { Repeat, Calendar, Clock, Check } from 'lucide-react'

type Cadence = 'daily' | 'weekly' | 'monthly' | 'custom'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function RecurringTaskDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [cadence, setCadence] = useState<Cadence>('weekly')
  const [days, setDays] = useState<Set<number>>(new Set([0, 2, 4]))
  const [interval, setInterval] = useState(1)
  const [time, setTime] = useState('09:00')
  const [endsOn, setEndsOn] = useState<'never' | 'on' | 'after'>('never')

  function summary() {
    if (cadence === 'daily') return `Every ${interval > 1 ? `${interval} days` : 'day'} at ${time}`
    if (cadence === 'weekly') {
      const picked = [...days].sort().map((i) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]).join(', ')
      return `Every ${interval > 1 ? `${interval} weeks` : 'week'} on ${picked || '—'}`
    }
    if (cadence === 'monthly') return `Every ${interval > 1 ? `${interval} months` : 'month'}`
    return 'Custom schedule'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient text-white shadow-sm">
              <Repeat className="h-3.5 w-3.5" />
            </span>
            Make recurring
          </DialogTitle>
          <DialogDescription>
            We'll auto-create the next instance when this task is completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {(['daily', 'weekly', 'monthly', 'custom'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={cn(
                  'rounded-lg border px-2 py-2.5 text-xs font-medium capitalize transition-all',
                  cadence === c
                    ? 'border-accent bg-accent/15 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:bg-card/60',
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border/40 bg-card/30 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Repeat every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={interval}
                    onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))}
                    className="w-20"
                  />
                  <span className="text-sm capitalize text-muted-foreground">
                    {cadence === 'daily' ? 'day(s)' : cadence === 'weekly' ? 'week(s)' : 'month(s)'}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  leadingIcon={<Clock className="h-4 w-4" />}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            {cadence === 'weekly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">On these days</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setDays((s) => {
                          const n = new Set(s)
                          if (n.has(i)) n.delete(i)
                          else n.add(i)
                          return n
                        })
                      }}
                      className={cn(
                        'rounded-md border h-9 text-xs font-medium transition-all',
                        days.has(i)
                          ? 'border-transparent bg-brand-gradient text-white'
                          : 'border-border/60 text-muted-foreground hover:bg-card/60',
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ends</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['never', 'on', 'after'] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setEndsOn(e)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-all',
                      endsOn === e
                        ? 'border-accent bg-accent/10'
                        : 'border-border/60 text-muted-foreground',
                    )}
                  >
                    {e === 'never' ? 'Never' : e === 'on' ? 'On a date' : 'After N times'}
                  </button>
                ))}
              </div>
              {endsOn === 'on' && <Input type="date" className="mt-2" />}
              {endsOn === 'after' && <Input type="number" placeholder="10" className="mt-2 w-32" />}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
            <Calendar className="h-4 w-4 text-accent shrink-0" />
            <Badge variant="soft" className="text-[10px] uppercase">Preview</Badge>
            <span className="text-sm">{summary()}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="gradient" onClick={() => onOpenChange(false)}>
            <Check className="h-3.5 w-3.5" /> Set recurrence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
