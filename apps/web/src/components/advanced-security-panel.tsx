import { useState } from 'react'
import {
  Card,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from '@rundesk/ui'
import {
  Shield,
  Plus,
  Trash2,
  Globe,
  Clock,
  AlertTriangle,
  Check,
  Lock,
} from 'lucide-react'

export function AdvancedSecurityPanel() {
  const [allowlistOpen, setAllowlistOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)

  return (
    <div className="space-y-4">
      {/* IP allowlist card */}
      <Card variant="glass" className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Globe className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-semibold">IP allowlist</h3>
              <Badge variant="soft" className="text-[9px] uppercase">3 ranges</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Only allow workspace access from approved IPs. Members outside the list see a soft block.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {['203.0.113.0/24', '198.51.100.42', '2001:db8::/32'].map((ip) => (
                <Badge key={ip} variant="info" className="font-mono text-[10px]">
                  {ip}
                </Badge>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAllowlistOpen(true)}>
            Configure
          </Button>
        </div>
      </Card>

      {/* Session timeout */}
      <Card variant="glass" className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Clock className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-semibold">Session timeout</h3>
              <Badge variant="success" className="text-[9px] uppercase">8h after inactivity</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Force re-login after a period of inactivity.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSessionOpen(true)}>
            Configure
          </Button>
        </div>
      </Card>

      {/* Login policy */}
      <Card variant="glass" className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Lock className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">Login policy</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Lockout, password strength, and SSO requirements.
            </p>
          </div>
        </div>
        <div className="space-y-2 pl-13">
          <PolicyToggle
            label="Lock account after 5 failed attempts"
            description="Released automatically after 30 minutes."
            checked
          />
          <PolicyToggle
            label="Require strong passwords"
            description="At least 10 chars, mixed case, number + symbol."
            checked
          />
          <PolicyToggle
            label="Require SSO for admins"
            description="Email + password disabled for workspace admins."
            checked={false}
          />
          <PolicyToggle
            label="Block known-breached passwords"
            description="Cross-check against haveibeenpwned at sign-up."
            checked
          />
        </div>
      </Card>

      <IpAllowlistDialog open={allowlistOpen} onOpenChange={setAllowlistOpen} />
      <SessionTimeoutDialog open={sessionOpen} onOpenChange={setSessionOpen} />
    </div>
  )
}

function PolicyToggle({
  label,
  description,
  checked: initial,
}: {
  label: string
  description: string
  checked: boolean
}) {
  const [checked, setChecked] = useState(initial)
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} />
    </div>
  )
}

function IpAllowlistDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [enabled, setEnabled] = useState(true)
  const [includeAdmins, setIncludeAdmins] = useState(false)
  const [ips, setIps] = useState<string[]>(['203.0.113.0/24', '198.51.100.42', '2001:db8::/32'])
  const [draft, setDraft] = useState('')
  const [draftLabel, setDraftLabel] = useState('')

  function add() {
    if (!draft.trim()) return
    setIps((arr) => [...arr, draft.trim()])
    setDraft('')
    setDraftLabel('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent" /> IP allowlist
          </DialogTitle>
          <DialogDescription>
            Restrict workspace access to a list of IPs or ranges (CIDR).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Enforce allowlist</div>
              <div className="text-xs text-muted-foreground">
                Members outside the list see a soft block with admin contact.
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                <span>
                  Your current IP <span className="font-mono font-medium">203.0.113.42</span> is allowed —
                  if it isn't, you'll be locked out.
                </span>
              </div>

              <div>
                <Label className="mb-2">Allowed IPs / ranges</Label>
                <ul className="space-y-1.5 mb-2">
                  {ips.map((ip) => (
                    <li
                      key={ip}
                      className="flex items-center gap-2 rounded-md border border-border/40 bg-card/30 px-3 py-1.5"
                    >
                      <Globe className="h-3 w-3 text-muted-foreground" />
                      <code className="flex-1 text-xs font-mono">{ip}</code>
                      <button
                        onClick={() => setIps((arr) => arr.filter((x) => x !== ip))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-[1fr_140px_auto] gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="203.0.113.0/24 or 198.51.100.42"
                  />
                  <Input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="Label (HQ, VPN…)"
                  />
                  <Button variant="outline" size="sm" onClick={add}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
                <div>
                  <div className="text-sm">Apply to workspace admins</div>
                  <div className="text-xs text-muted-foreground">
                    By default, admins can sign in from any IP for emergency access.
                  </div>
                </div>
                <Switch checked={includeAdmins} onCheckedChange={setIncludeAdmins} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="gradient" onClick={() => onOpenChange(false)}>
            <Check className="h-3.5 w-3.5" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SessionTimeoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [duration, setDuration] = useState(8)
  const [unit, setUnit] = useState<'minutes' | 'hours' | 'days'>('hours')
  const [trustedDevice, setTrustedDevice] = useState(true)
  const [maxSessions, setMaxSessions] = useState(5)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent" /> Session timeout
          </DialogTitle>
          <DialogDescription>
            Force re-login after inactivity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Inactivity timeout</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-24"
              />
              <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-md p-0.5">
                {(['minutes', 'hours', 'days'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={cn(
                      'text-xs px-3 py-1 rounded font-medium capitalize transition-all',
                      unit === u
                        ? 'bg-brand-gradient text-white'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Max concurrent sessions per user</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={maxSessions}
              onChange={(e) => setMaxSessions(Number(e.target.value))}
              className="w-24"
            />
            <p className="text-[11px] text-muted-foreground">
              Older sessions get logged out when this number is exceeded.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
            <div>
              <div className="text-sm">Trusted devices</div>
              <div className="text-xs text-muted-foreground">
                Skip 2FA for 30 days on a device the user marks as trusted.
              </div>
            </div>
            <Switch checked={trustedDevice} onCheckedChange={setTrustedDevice} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="gradient" onClick={() => onOpenChange(false)}>
            <Check className="h-3.5 w-3.5" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
