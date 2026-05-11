import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Switch,
  Label,
  Badge,
  Progress,
  cn,
} from '@rundesk/ui'
import { Calendar, ArrowRight, Check, Sparkles } from 'lucide-react'

type Provider = 'google' | 'outlook' | 'apple' | 'cal'

const PROVIDERS: Array<{ id: Provider; name: string; brand: string; icon: string }> = [
  { id: 'google', name: 'Google Calendar', brand: '#4285F4', icon: 'G' },
  { id: 'outlook', name: 'Outlook Calendar', brand: '#0078D4', icon: 'O' },
  { id: 'apple', name: 'Apple iCloud', brand: '#1d1d1f', icon: 'A' },
  { id: 'cal', name: 'Cal.com', brand: '#000', icon: 'C' },
]

export function CalendarSyncWizard({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [twoWay, setTwoWay] = useState(true)
  const [includeCompleted, setIncludeCompleted] = useState(false)
  const [reminders, setReminders] = useState(true)

  function reset() {
    setStep(0)
    setProvider(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient text-white shadow-sm">
              <Calendar className="h-3.5 w-3.5" />
            </span>
            Sync your calendar
          </DialogTitle>
          <DialogDescription>
            Two-way sync — task due dates appear on your calendar, and calendar events surface in Rundesk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-1">
          <Progress value={((step + 1) / 3) * 100} className="h-1" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Step {step + 1} of 3
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-3 animate-fade-in">
            <Label>Pick your provider</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 transition-all text-left',
                    provider === p.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border/60 hover:border-border hover:bg-card/40',
                  )}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-md text-white font-bold text-sm shrink-0"
                    style={{ background: p.brand }}
                  >
                    {p.icon}
                  </div>
                  <span className="text-sm font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <Label>Sync preferences</Label>
            <div className="space-y-2">
              <SettingRow
                title="Two-way sync"
                description="Edits in either app stay in sync"
                checked={twoWay}
                onChange={setTwoWay}
              />
              <SettingRow
                title="Include completed tasks"
                description="Show done tasks on the calendar"
                checked={includeCompleted}
                onChange={setIncludeCompleted}
              />
              <SettingRow
                title="Send reminders"
                description="15 minutes before each task due time"
                checked={reminders}
                onChange={setReminders}
              />
            </div>
            <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-xs flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
              <span>
                Rundesk will create a dedicated calendar named{' '}
                <span className="font-mono">Rundesk · Main Workspace</span> so it&apos;s easy to toggle off.
              </span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-center py-2 animate-fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient shadow-glow">
              <Check className="h-8 w-8 text-white" strokeWidth={3} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Connected</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your {PROVIDERS.find((p) => p.id === provider)?.name} is syncing now. Existing events will appear within a minute.
              </p>
            </div>
            <Badge variant="success" className="text-[10px] uppercase">Live · 2-way sync</Badge>
          </div>
        )}

        <DialogFooter>
          {step > 0 && step < 2 && (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 0 | 1)}>
              Back
            </Button>
          )}
          {step < 2 ? (
            <Button
              variant="gradient"
              onClick={() => setStep((s) => (s + 1) as 1 | 2)}
              disabled={step === 0 && !provider}
            >
              {step === 1 ? 'Connect' : 'Continue'} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="gradient" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
