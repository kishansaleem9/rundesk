import { useState } from 'react'
import {
  Card,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  toast,
  cn,
} from '@rundesk/ui'
import { Mail, Copy, RefreshCcw, Check, Sparkles } from 'lucide-react'

export function EmailToTaskPanel({
  projectKey = 'onboarding',
}: {
  projectKey?: string
}) {
  const [enabled, setEnabled] = useState(true)
  const [autoAssign, setAutoAssign] = useState(true)
  const [defaultPriority, setDefaultPriority] = useState<'urgent' | 'high' | 'normal' | 'low'>('normal')
  const inboundAddress = `${projectKey}@inbox.rundesk.app`

  return (
    <Card variant="glass" className="p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow">
          <Mail className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">Email-to-task</h3>
            <Badge variant={enabled ? 'success' : 'soft'} className="text-[9px] uppercase">
              {enabled ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Forward any email to this address — we turn it into a task in this project.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Inbound address</Label>
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <code className="flex-1 text-sm font-mono truncate">{inboundAddress}</code>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              navigator.clipboard?.writeText(inboundAddress)
              toast.success('Address copied')
            }}
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <Button variant="ghost" size="sm" className="h-7">
            <RefreshCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SettingTile
          title="Auto-assign sender"
          description="If sender is a member, assign them as the owner."
          checked={autoAssign}
          onChange={setAutoAssign}
        />
        <SettingTile
          title="AI extract action items"
          description="Use Claude to pull tasks from long emails."
          checked={true}
          onChange={() => {}}
          icon={<Sparkles className="h-3 w-3 text-accent" />}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Default priority</Label>
        <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
          {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setDefaultPriority(p)}
              className={cn(
                'flex-1 text-xs px-3 py-1.5 rounded-md font-medium transition-all capitalize',
                defaultPriority === p
                  ? 'bg-brand-gradient text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border/40 bg-card/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Tip:</strong> Emails from people outside your workspace land
        as <span className="font-medium text-foreground">unassigned</span> with the sender&apos;s email saved
        in the description.
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm">View deliveries</Button>
        <Button variant="gradient" size="sm">
          <Check className="h-3.5 w-3.5" /> Save settings
        </Button>
      </div>
    </Card>
  )
}

function SettingTile({
  title,
  description,
  checked,
  onChange,
  icon,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
