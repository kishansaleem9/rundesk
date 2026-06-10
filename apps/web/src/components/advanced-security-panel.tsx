import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  toast,
} from '@rundesk/ui'
import {
  Plus,
  Trash2,
  Globe,
  Clock,
  AlertTriangle,
  Check,
  Lock,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'

type SecuritySettings = {
  workspaceId: string
  ipAllowlistEnabled: boolean
  ipAllowlist: string[]
  ipAllowlistIncludeAdmins: boolean
  sessionTimeoutMinutes: number
  maxConcurrentSessions: number
  lockoutEnabled: boolean
  lockoutThreshold: number
  lockoutDurationMinutes: number
  requireStrongPasswords: boolean
  blockBreachedPasswords: boolean
  currentIp: string
}

type TimeUnit = 'minutes' | 'hours' | 'days'

function formatMinutes(min: number): string {
  if (min % 1440 === 0) return `${min / 1440}d`
  if (min % 60 === 0) return `${min / 60}h`
  return `${min}m`
}
function splitMinutes(min: number): { duration: number; unit: TimeUnit } {
  if (min % 1440 === 0) return { duration: min / 1440, unit: 'days' }
  if (min % 60 === 0) return { duration: min / 60, unit: 'hours' }
  return { duration: min, unit: 'minutes' }
}
function toMinutes(duration: number, unit: TimeUnit): number {
  const mult = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1
  return Math.max(1, Math.round(duration * mult))
}

// Light client-side check (server is the authority via isValidIpRule).
function looksLikeIpRule(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  const [addr, prefix] = v.split('/')
  if (prefix !== undefined && !/^\d{1,3}$/.test(prefix)) return false
  const isV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(addr)
  const isV6 = /^[0-9a-fA-F:]+$/.test(addr) && addr.includes(':')
  return isV4 || isV6
}

export function AdvancedSecurityPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const queryKey = ['security-settings', workspaceId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api<SecuritySettings>(`/workspaces/${workspaceId}/security-settings`),
    enabled: Boolean(workspaceId),
  })

  const save = useMutation({
    mutationFn: (patch: Partial<SecuritySettings>) =>
      api<SecuritySettings>(`/workspaces/${workspaceId}/security-settings`, { method: 'PATCH', body: patch }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKey, updated)
      toast.success('Security settings saved')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof ApiError ? e.message : 'Failed to save security settings'),
  })

  const [allowlistOpen, setAllowlistOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)

  if (isLoading || !data) {
    return (
      <Card variant="glass" className="p-5 text-sm text-muted-foreground">
        Loading security settings…
      </Card>
    )
  }
  const s = data

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
              <Badge variant="soft" className="text-[9px] uppercase">
                {s.ipAllowlist.length} {s.ipAllowlist.length === 1 ? 'range' : 'ranges'}
              </Badge>
              <Badge variant={s.ipAllowlistEnabled ? 'success' : 'outline'} className="text-[9px] uppercase">
                {s.ipAllowlistEnabled ? 'Enforced' : 'Off'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Only allow workspace access from approved IPs. Logins from other addresses are blocked.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {s.ipAllowlist.length === 0 ? (
                <span className="text-xs text-muted-foreground">No ranges configured.</span>
              ) : (
                s.ipAllowlist.slice(0, 8).map((ip) => (
                  <Badge key={ip} variant="info" className="font-mono text-[10px]">
                    {ip}
                  </Badge>
                ))
              )}
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
              <Badge variant="success" className="text-[9px] uppercase">
                {formatMinutes(s.sessionTimeoutMinutes)} after inactivity
              </Badge>
              {s.maxConcurrentSessions > 0 && (
                <Badge variant="soft" className="text-[9px] uppercase">
                  max {s.maxConcurrentSessions} sessions
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Force re-login after a period of inactivity, and cap concurrent sessions per user.
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
              Lockout and password-strength requirements applied at sign-in and sign-up.
            </p>
          </div>
        </div>
        <div className="space-y-2 pl-13">
          <PolicyToggle
            label={`Lock account after ${s.lockoutThreshold} failed attempts`}
            description={`Released automatically after ${s.lockoutDurationMinutes} minutes.`}
            checked={s.lockoutEnabled}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ lockoutEnabled: v })}
          />
          {s.lockoutEnabled && (
            <div className="grid grid-cols-2 gap-2 pl-3">
              <NumberField
                label="Attempts before lock"
                value={s.lockoutThreshold}
                min={1}
                max={100}
                onCommit={(v) => v !== s.lockoutThreshold && save.mutate({ lockoutThreshold: v })}
              />
              <NumberField
                label="Lock duration (min)"
                value={s.lockoutDurationMinutes}
                min={1}
                max={1440}
                onCommit={(v) => v !== s.lockoutDurationMinutes && save.mutate({ lockoutDurationMinutes: v })}
              />
            </div>
          )}
          <PolicyToggle
            label="Require strong passwords"
            description="At least 10 chars, mixed case, number + symbol — enforced at sign-up and reset."
            checked={s.requireStrongPasswords}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ requireStrongPasswords: v })}
          />
          <PolicyToggle
            label="Block known-breached passwords"
            description="Cross-check against HaveIBeenPwned at sign-up. Fails open if the service is unreachable."
            checked={s.blockBreachedPasswords}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ blockBreachedPasswords: v })}
          />
        </div>
      </Card>

      <IpAllowlistDialog
        open={allowlistOpen}
        onOpenChange={setAllowlistOpen}
        settings={s}
        saving={save.isPending}
        onSave={async (patch) => {
          await save.mutateAsync(patch)
          setAllowlistOpen(false)
        }}
      />
      <SessionTimeoutDialog
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        settings={s}
        saving={save.isPending}
        onSave={async (patch) => {
          await save.mutateAsync(patch)
          setSessionOpen(false)
        }}
      />
    </div>
  )
}

function PolicyToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(draft))))
    if (Number.isFinite(n)) onCommit(n)
    else setDraft(String(value))
  }
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="h-8"
      />
    </div>
  )
}

function IpAllowlistDialog({
  open,
  onOpenChange,
  settings,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  settings: SecuritySettings
  saving: boolean
  onSave: (patch: Partial<SecuritySettings>) => Promise<void>
}) {
  const [enabled, setEnabled] = useState(settings.ipAllowlistEnabled)
  const [includeAdmins, setIncludeAdmins] = useState(settings.ipAllowlistIncludeAdmins)
  const [ips, setIps] = useState<string[]>(settings.ipAllowlist)
  const [draft, setDraft] = useState('')

  // Re-seed local draft whenever the dialog (re)opens with fresh server state.
  useEffect(() => {
    if (open) {
      setEnabled(settings.ipAllowlistEnabled)
      setIncludeAdmins(settings.ipAllowlistIncludeAdmins)
      setIps(settings.ipAllowlist)
      setDraft('')
    }
  }, [open, settings])

  function add() {
    const v = draft.trim()
    if (!v) return
    if (!looksLikeIpRule(v)) {
      toast.error('Enter a valid IP or CIDR (e.g. 203.0.113.0/24)')
      return
    }
    if (!ips.includes(v)) setIps((arr) => [...arr, v])
    setDraft('')
  }

  const currentCovered = ips.some((rule) => {
    // mirror server normalisation loosely: exact match or obvious /32 host
    return rule === settings.currentIp || rule.startsWith(settings.currentIp + '/')
  })

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
                Logins from addresses outside the list are blocked.
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <div
                className={cn(
                  'rounded-md border p-3 text-xs flex items-start gap-2',
                  currentCovered || includeAdmins
                    ? 'border-success/30 bg-success/10'
                    : 'border-warning/30 bg-warning/10',
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Your current IP <span className="font-mono font-medium">{settings.currentIp}</span>{' '}
                  {currentCovered
                    ? 'is in the list.'
                    : 'is not in the list yet — it will be added automatically on save so you don’t lock yourself out.'}
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
                  {ips.length === 0 && (
                    <li className="text-xs text-muted-foreground px-1">
                      No ranges yet. With the list empty, enforcement is skipped (fail-open).
                    </li>
                  )}
                </ul>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
                    placeholder="203.0.113.0/24 or 198.51.100.42"
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={saving}
            onClick={() =>
              onSave({
                ipAllowlistEnabled: enabled,
                ipAllowlist: ips,
                ipAllowlistIncludeAdmins: includeAdmins,
              })
            }
          >
            <Check className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SessionTimeoutDialog({
  open,
  onOpenChange,
  settings,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  settings: SecuritySettings
  saving: boolean
  onSave: (patch: Partial<SecuritySettings>) => Promise<void>
}) {
  const initial = splitMinutes(settings.sessionTimeoutMinutes)
  const [duration, setDuration] = useState(initial.duration)
  const [unit, setUnit] = useState<TimeUnit>(initial.unit)
  const [maxSessions, setMaxSessions] = useState(settings.maxConcurrentSessions)

  useEffect(() => {
    if (open) {
      const s = splitMinutes(settings.sessionTimeoutMinutes)
      setDuration(s.duration)
      setUnit(s.unit)
      setMaxSessions(settings.maxConcurrentSessions)
    }
  }, [open, settings])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent" /> Session timeout
          </DialogTitle>
          <DialogDescription>Force re-login after inactivity.</DialogDescription>
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
              min={0}
              max={100}
              value={maxSessions}
              onChange={(e) => setMaxSessions(Number(e.target.value))}
              className="w-24"
            />
            <p className="text-[11px] text-muted-foreground">
              Older sessions get logged out when this number is exceeded. 0 = unlimited.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={saving}
            onClick={() =>
              onSave({
                sessionTimeoutMinutes: toMinutes(duration, unit),
                maxConcurrentSessions: Math.min(100, Math.max(0, Math.round(maxSessions))),
              })
            }
          >
            <Check className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
