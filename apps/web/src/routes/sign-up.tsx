import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Button,
  Input,
  Label,
  LogoWordmark,
  Progress,
  Separator,
  RadioGroup,
  RadioGroupItem,
  Checkbox,
  Badge,
  PersonAvatar,
  toast,
} from '@rundesk/ui'
import {
  Mail,
  Lock,
  User,
  Building2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  X,
  Trash2,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'

export const Route = createFileRoute('/sign-up')({
  component: SignUpWizard,
})

type Step = 0 | 1 | 2 | 3 | 4

type Invitee = {
  email: string
  orgRole: 'admin' | 'member'
  workspaceRole: 'workspace_admin' | 'manager' | 'member' | 'guest'
}

type WizardState = {
  // Step 0 — account
  fullName: string
  email: string
  password: string
  // Step 1 — workspace
  workspaceName: string
  workspaceSlug: string
  industry: string
  teamSize: string
  // Step 2 — features
  features: string[]
  // Step 3 — invites
  invites: Invitee[]
}

function SignUpWizard() {
  const [step, setStep] = useState<Step>(0)
  const [state, setState] = useState<WizardState>({
    fullName: '',
    email: '',
    password: '',
    workspaceName: '',
    workspaceSlug: '',
    industry: '',
    teamSize: '',
    features: ['core', 'views', 'docs', 'chat', 'ai'],
    invites: [],
  })

  const update = (patch: Partial<WizardState>) =>
    setState((s) => ({ ...s, ...patch }))

  const next = () => setStep((s) => (Math.min(4, s + 1) as Step))
  const prev = () => setStep((s) => (Math.max(0, s - 1) as Step))

  const { setSession } = useAuthStore()
  const [loading, setLoading] = useState(false)

  async function finish() {
    setLoading(true)
    try {
      const res = await api<{
        accessToken: string
        refreshToken: string
        user: any
        organizations: any[]
        workspaces: any[]
      }>('/auth/signup', {
        method: 'POST',
        body: {
          fullName: state.fullName,
          email: state.email,
          password: state.password,
          organizationName: state.workspaceName,
          organizationSlug: state.workspaceSlug,
          industry: state.industry,
          teamSize: state.teamSize,
          features: state.features,
          invites: state.invites,
        },
      })

      setSession(res.user, res.accessToken, res.refreshToken, res.organizations, res.workspaces)
      
      toast.success('Workspace created — welcome to Rundesk')
      
      // Redirect to the newly created workspace
      const wsId = res.workspaces[0]?.id
      if (wsId) {
        window.location.href = `/app/${wsId}`
      } else {
        setStep(4)
      }
    } catch (err: any) {
      toast.error('Signup failed', { description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const totalSteps = 4 // 0..3 are interactive, 4 is the success screen
  const progressValue = Math.min(100, ((step + 1) / totalSteps) * 100)

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="bg-aurora pointer-events-none absolute inset-0" />
      <div className="bg-grid-dim pointer-events-none absolute inset-0 opacity-30" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between p-6 sm:p-8">
        <Link to="/login">
          <LogoWordmark gradient />
        </Link>
        <Link
          to="/login"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Already have an account? <span className="text-foreground underline-offset-4 hover:underline">Sign in</span>
        </Link>
      </header>

      {/* Wizard */}
      <main className="relative z-10 mx-auto flex max-w-2xl flex-col gap-6 px-6 pb-32 pt-4 sm:pt-6">
        {step < 4 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <span>Step {step + 1} of {totalSteps}</span>
              <span>{Math.round(progressValue)}%</span>
            </div>
            <Progress value={progressValue} className="h-1.5" />
          </div>
        )}

        <div className="card-glass relative overflow-hidden p-8 sm:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8"
            >
              {step === 0 && <StepAccount state={state} update={update} />}
              {step === 1 && <StepWorkspace state={state} update={update} />}
              {step === 2 && <StepFeatures state={state} update={update} />}
              {step === 3 && <StepInvites state={state} update={update} />}
              {step === 4 && <StepDone state={state} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        {step < 4 && (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={prev}
              disabled={step === 0}
              className="text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              {step === 3 && (
                <Button variant="ghost" onClick={finish}>
                  Skip for now
                </Button>
              )}
              <Button
                variant="gradient"
                size="lg"
                onClick={step === 3 ? finish : next}
                disabled={!canAdvance(step, state) || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    {step === 3 ? 'Create workspace' : 'Continue'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> By continuing you agree to our terms & privacy policy.
        </p>
      </main>
    </div>
  )
}

function canAdvance(step: Step, s: WizardState): boolean {
  if (step === 0) return s.fullName.trim().length > 1 && /^.+@.+\..+$/.test(s.email) && s.password.length >= 8
  if (step === 1) return s.workspaceName.trim().length > 1 && s.industry !== '' && s.teamSize !== ''
  if (step === 2) return s.features.length > 0
  return true
}

// ---------------------------------------------------------------------------
// STEP 0 — Account
// ---------------------------------------------------------------------------
function StepAccount({
  state,
  update,
}: {
  state: WizardState
  update: (p: Partial<WizardState>) => void
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Let's get you set up
        </h1>
        <p className="text-sm text-muted-foreground">
          Start with the basics — we'll have your workspace ready in under two minutes.
        </p>
      </header>

      <div className="grid gap-2">
        <Button variant="glass" size="lg" className="w-full justify-center">
          <GoogleIcon /> Continue with Google
        </Button>
        <Button variant="glass" size="lg" className="w-full justify-center">
          <MicrosoftIcon /> Continue with Microsoft
        </Button>
      </div>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground/70">
        <Separator className="flex-1" />
        or sign up with email
        <Separator className="flex-1" />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            placeholder="Ada Lovelace"
            leadingIcon={<User className="h-4 w-4" />}
            value={state.fullName}
            onChange={(e) => update({ fullName: e.target.value })}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            placeholder="ada@analytics.io"
            leadingIcon={<Mail className="h-4 w-4" />}
            value={state.email}
            onChange={(e) => update({ email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Create a password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            leadingIcon={<Lock className="h-4 w-4" />}
            value={state.password}
            onChange={(e) => update({ password: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Use 8+ characters with a mix of letters, numbers and symbols.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// STEP 1 — Workspace
// ---------------------------------------------------------------------------
function StepWorkspace({
  state,
  update,
}: {
  state: WizardState
  update: (p: Partial<WizardState>) => void
}) {
  function setName(name: string) {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 32)
    update({ workspaceName: name, workspaceSlug: slug })
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Name your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          This is the home base for your team — usually your company or department.
        </p>
      </header>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            placeholder="Acme HQ"
            leadingIcon={<Building2 className="h-4 w-4" />}
            value={state.workspaceName}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {state.workspaceSlug && (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Your URL will be</span>
            <span className="font-mono text-foreground">
              rundesk.app/<span className="text-brand-gradient">{state.workspaceSlug}</span>
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>What's your industry?</Label>
            <RadioGroup
              value={state.industry}
              onValueChange={(v) => update({ industry: v })}
              className="grid gap-1.5"
            >
              {[
                'Software',
                'Marketing',
                'Design',
                'Operations',
                'Other',
              ].map((i) => (
                <SelectableRow
                  key={i}
                  label={i}
                  value={i}
                  selected={state.industry === i}
                />
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Team size</Label>
            <RadioGroup
              value={state.teamSize}
              onValueChange={(v) => update({ teamSize: v })}
              className="grid gap-1.5"
            >
              {['Just me', '2–10', '11–50', '51–200', '200+'].map((s) => (
                <SelectableRow
                  key={s}
                  label={s}
                  value={s}
                  selected={state.teamSize === s}
                />
              ))}
            </RadioGroup>
          </div>
        </div>
      </div>
    </div>
  )
}

function SelectableRow({
  label,
  value,
  selected,
}: {
  label: string
  value: string
  selected: boolean
}) {
  return (
    <Label
      htmlFor={`opt-${value}`}
      className={
        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ' +
        (selected
          ? 'border-accent bg-accent/10 text-foreground'
          : 'border-border/50 hover:border-border hover:bg-muted/30')
      }
    >
      <RadioGroupItem id={`opt-${value}`} value={value} />
      {label}
    </Label>
  )
}

// ---------------------------------------------------------------------------
// STEP 2 — Features
// ---------------------------------------------------------------------------
const FEATURE_PILLS = [
  { key: 'core', label: 'Tasks & Projects', icon: '✓', desc: 'Lists, boards, custom fields' },
  { key: 'views', label: 'Multiple views', icon: '⬚', desc: 'Calendar, Gantt, Workload' },
  { key: 'docs', label: 'Docs & wikis', icon: '📄', desc: 'Notion-style editor' },
  { key: 'chat', label: 'Chat & DMs', icon: '💬', desc: 'Channels, threads, pins' },
  { key: 'ai', label: 'AI agents', icon: '✨', desc: 'Powered by Claude' },
  { key: 'goals', label: 'Goals & OKRs', icon: '🎯', desc: 'Auto-progress from tasks' },
  { key: 'sprints', label: 'Sprints', icon: '⚡', desc: 'Burndown + velocity' },
  { key: 'time_tracking', label: 'Time tracking', icon: '⏱', desc: 'Timers + timesheets' },
  { key: 'forms', label: 'Forms', icon: '📋', desc: 'Public intake → tasks' },
  { key: 'reporting', label: 'Reports', icon: '📊', desc: 'Custom dashboards' },
  { key: 'integrations', label: 'Integrations', icon: '🔌', desc: 'Slack, Drive, GitHub' },
  { key: 'mobile', label: 'Mobile (PWA)', icon: '📱', desc: 'Install on any device' },
]

function StepFeatures({
  state,
  update,
}: {
  state: WizardState
  update: (p: Partial<WizardState>) => void
}) {
  function toggle(key: string) {
    update({
      features: state.features.includes(key)
        ? state.features.filter((f) => f !== key)
        : [...state.features, key],
    })
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          What does your team need?
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick what you'll use — we'll turn the rest off so the workspace stays uncluttered.
          You can always change this later in Admin → Features.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {FEATURE_PILLS.map((f) => {
          const active = state.features.includes(f.key)
          return (
            <button
              type="button"
              key={f.key}
              onClick={() => toggle(f.key)}
              className={
                'group flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ' +
                (active
                  ? 'border-accent bg-accent/10 shadow-glow'
                  : 'border-border/50 hover:border-border hover:bg-muted/20')
              }
            >
              <span
                className={
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm transition-colors ' +
                  (active ? 'bg-brand-gradient text-white' : 'bg-muted text-muted-foreground')
                }
              >
                {f.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{f.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-accent" />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        <Sparkles className="mr-1 inline h-3 w-3" />
        Selected: <strong className="text-foreground">{state.features.length}</strong> features
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// STEP 3 — Invites
// ---------------------------------------------------------------------------
const ROLES: Array<{ value: Invitee['orgRole']; label: string; description: string }> = [
  { value: 'admin', label: 'Admin', description: 'Full access — manage members, billing, integrations.' },
  { value: 'member', label: 'Member', description: 'Default. Create & edit tasks, comment, log time.' },
]

function StepInvites({
  state,
  update,
}: {
  state: WizardState
  update: (p: Partial<WizardState>) => void
}) {
  const [emailDraft, setEmailDraft] = useState('')
  const [roleDraft, setRoleDraft] = useState<Invitee['orgRole']>('member')

  function add() {
    const e = emailDraft.trim()
    if (!/^.+@.+\..+$/.test(e)) {
      toast.error('That doesn\'t look like a valid email')
      return
    }
    if (state.invites.some((i) => i.email === e)) {
      toast.warning(`${e} is already on the list`)
      return
    }
    update({
      invites: [
        ...state.invites,
        {
          email: e,
          orgRole: roleDraft,
          workspaceRole: (roleDraft === 'admin' ? 'workspace_admin' : roleDraft) as any,
        },
      ],
    })
    setEmailDraft('')
  }

  function remove(email: string) {
    update({ invites: state.invites.filter((i) => i.email !== email) })
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Invite your team
        </h1>
        <p className="text-sm text-muted-foreground">
          Add a few teammates now — you can invite the rest from Settings → Members later.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"
      >
        <Input
          placeholder="teammate@company.com"
          leadingIcon={<Mail className="h-4 w-4" />}
          value={emailDraft}
          onChange={(e) => setEmailDraft(e.target.value)}
        />
        <select
          value={roleDraft}
          onChange={(e) => setRoleDraft(e.target.value as Invitee['orgRole'])}
          className="h-10 rounded-md border border-border/80 bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {/* Role explanation */}
      <details className="group rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm">
        <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
          What can each role do?
          <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
        </summary>
        <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
          {ROLES.map((r) => (
            <li key={r.value} className="flex gap-2">
              <span className="w-16 shrink-0 font-medium text-foreground">{r.label}</span>
              <span>{r.description}</span>
            </li>
          ))}
        </ul>
      </details>

      {/* Invitee list */}
      {state.invites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          No invitees yet. Add the people you collaborate with most.
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {state.invites.map((inv) => (
              <motion.li
                key={inv.email}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2"
              >
                <PersonAvatar name={inv.email} size="sm" />
                <span className="flex-1 truncate text-sm">{inv.email}</span>
                <Badge variant="soft" className="text-[10px] capitalize">
                  {inv.orgRole}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(inv.email)}
                  aria-label={`Remove ${inv.email}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// STEP 4 — Done
// ---------------------------------------------------------------------------
function StepDone({ state }: { state: WizardState }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient shadow-glow">
        <Check className="h-10 w-10 text-white" strokeWidth={3} />
      </div>
      <header className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Welcome to {state.workspaceName || 'Rundesk'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your workspace is ready. {state.invites.length > 0 && `We sent ${state.invites.length} invite${state.invites.length === 1 ? '' : 's'} on your behalf.`}
        </p>
      </header>
      <div className="flex justify-center gap-2 pt-2">
        <Button variant="glass" asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
        <Button variant="gradient" asChild>
          <Link to="/login">
            Open my workspace <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

// Inline icons (so this file is self-contained)
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.8h5.4c-.2 1.4-1.7 4-5.4 4-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 6.7 2.5 2.5 6.8 2.5 12s4.2 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6 0-1.1-.1-1.6L12 10.2z" />
      <path fill="#34A853" d="M3.6 7.6l3.1 2.3C7.6 8 9.6 6 12 6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 8.4 2.5 5.3 4.5 3.6 7.6z" />
      <path fill="#FBBC04" d="M12 21.5c2.6 0 4.7-.9 6.3-2.3l-3-2.4c-.8.6-2 1.2-3.3 1.2-2.7 0-4.9-1.7-5.7-4.1l-3.1 2.4c1.5 3 4.7 5.2 8.8 5.2z" />
      <path fill="#4285F4" d="M21.1 12.2c0-.6 0-1.1-.1-1.6H12v3.8h5.4c-.2 1.4-1.7 4-5.4 4l3 2.4c2.4-2.2 3.9-5.4 3.9-8.6z" />
    </svg>
  )
}
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#F25022" d="M3 3h8v8H3z" />
      <path fill="#7FBA00" d="M13 3h8v8h-8z" />
      <path fill="#00A4EF" d="M3 13h8v8H3z" />
      <path fill="#FFB900" d="M13 13h8v8h-8z" />
    </svg>
  )
}
