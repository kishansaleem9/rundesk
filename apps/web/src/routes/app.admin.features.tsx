import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@rundesk/ui'
import { FLAGS, DEFAULT_ENABLED_FLAGS } from '@rundesk/feature-flags'
import type { FlagKey } from '@rundesk/feature-flags'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/admin/features')({
  component: FeatureFlagsPanel,
})

// ---------------------------------------------------------------------------
// Flag metadata — derived from the registry (we don't modify the registry).
// ---------------------------------------------------------------------------

type CategoryId =
  | 'core'
  | 'views'
  | 'ai'
  | 'chat'
  | 'time_tracking'
  | 'reporting'
  | 'integrations'
  | 'docs'
  | 'goals'
  | 'sprints'
  | 'forms'
  | 'advanced_security'
  | 'other'

const CATEGORY_ORDER: CategoryId[] = [
  'core',
  'views',
  'ai',
  'chat',
  'time_tracking',
  'reporting',
  'integrations',
  'docs',
  'goals',
  'sprints',
  'forms',
  'advanced_security',
  'other',
]

const CATEGORY_LABELS: Record<CategoryId, string> = {
  core: 'Core tasks',
  views: 'Views',
  ai: 'AI',
  chat: 'Chat',
  time_tracking: 'Time tracking',
  reporting: 'Reporting',
  integrations: 'Integrations',
  docs: 'Docs',
  goals: 'Goals',
  sprints: 'Sprints',
  forms: 'Forms',
  advanced_security: 'Advanced security',
  other: 'Platform & other',
}

// Explicit mapping for flags whose category can't be inferred by prefix.
const SINGLETON_CATEGORY: Partial<Record<FlagKey, CategoryId>> = {
  [FLAGS.SPRINTS]: 'sprints',
  [FLAGS.GOALS]: 'goals',
  [FLAGS.DOCS]: 'docs',
  [FLAGS.FORMS]: 'forms',
  [FLAGS.CHAT]: 'chat',
  [FLAGS.AI]: 'ai',
  [FLAGS.TIME_TRACKING]: 'time_tracking',
  [FLAGS.REPORTING]: 'reporting',
  [FLAGS.INTEGRATIONS]: 'integrations',
  [FLAGS.CORE_TASKS]: 'core',
  [FLAGS.SECURITY_ADVANCED]: 'advanced_security',
  [FLAGS.SECURITY_AUDIT_TRAIL]: 'advanced_security',
  [FLAGS.SECURITY_DATA_EXPORT]: 'advanced_security',
}

function categoryFor(key: FlagKey): CategoryId {
  if (SINGLETON_CATEGORY[key]) return SINGLETON_CATEGORY[key]!
  const prefix = key.split('.')[0]
  switch (prefix) {
    case 'tasks':
    case 'projects':
      return 'core'
    case 'views':
      return 'views'
    case 'ai':
      return 'ai'
    case 'chat':
      return 'chat'
    case 'time_tracking':
      return 'time_tracking'
    case 'reporting':
      return 'reporting'
    case 'integrations':
      return 'integrations'
    case 'docs':
      return 'docs'
    case 'goals':
      return 'goals'
    case 'sprints':
      return 'sprints'
    case 'forms':
      return 'forms'
    default:
      return 'other'
  }
}

function humanize(segment: string): string {
  return segment
    .split('_')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

function displayName(key: FlagKey): string {
  const parts = key.split('.')
  if (parts.length === 1) return humanize(parts[0])
  return parts.slice(1).map(humanize).join(' · ')
}

const DESCRIPTIONS: Partial<Record<FlagKey, string>> = {
  [FLAGS.CORE_TASKS]: 'Master toggle for all task functionality.',
  [FLAGS.CHAT]: 'Enable the in-app chat surface (channels, DMs, threads).',
  [FLAGS.AI]: 'Top-level AI features gate. Disabling turns off every AI capability.',
  [FLAGS.DOCS]: 'Rich collaborative documents attached to workspaces and projects.',
  [FLAGS.GOALS]: 'Objectives and key results tied to projects and sprints.',
  [FLAGS.SPRINTS]: 'Sprint planning, velocity, and burndown.',
  [FLAGS.FORMS]: 'Public and internal intake forms that create tasks.',
  [FLAGS.REPORTING]: 'Dashboards and cross-workspace reporting surface.',
  [FLAGS.TIME_TRACKING]: 'Record time against tasks, sprints, and goals.',
  [FLAGS.INTEGRATIONS]: 'Gate for all third-party integrations.',
}

function descriptionFor(key: FlagKey): string {
  if (DESCRIPTIONS[key]) return DESCRIPTIONS[key]!
  return `Controls availability of the ${displayName(key).toLowerCase()} capability.`
}

type FlagMeta = {
  key: FlagKey
  category: CategoryId
  name: string
  description: string
  defaultEnabled: boolean
}

const DEFAULT_SET = new Set<FlagKey>(DEFAULT_ENABLED_FLAGS)

const ALL_FLAGS: FlagMeta[] = (Object.values(FLAGS) as FlagKey[]).map((key) => ({
  key,
  category: categoryFor(key),
  name: displayName(key),
  description: descriptionFor(key),
  defaultEnabled: DEFAULT_SET.has(key),
}))

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

type ResolvedResponse = {
  flags: Record<string, boolean>
  resolvedAt: number
}

async function fetchResolved(): Promise<ResolvedResponse> {
  return api<ResolvedResponse>('/feature-flags/resolved')
}

async function setFlagGlobal(key: FlagKey, enabled: boolean): Promise<void> {
  await api(`/feature-flags/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled, scope: 'global' }),
  })
}

// ---------------------------------------------------------------------------
// Switch component (inline — not yet in @rundesk/ui)
// ---------------------------------------------------------------------------

function Switch({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-700' : 'bg-muted',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function FeatureFlagsPanel() {
  const queryClient = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryId | 'all'>('all')

  // Cmd+K / Ctrl+K to focus search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const resolvedQuery = useQuery({
    queryKey: ['feature-flags', 'resolved'],
    queryFn: fetchResolved,
  })

  const flagState: Record<string, boolean> = useMemo(() => {
    const base: Record<string, boolean> = {}
    for (const f of ALL_FLAGS) base[f.key] = f.defaultEnabled
    if (resolvedQuery.data?.flags) {
      for (const [k, v] of Object.entries(resolvedQuery.data.flags)) base[k] = v
    }
    return base
  }, [resolvedQuery.data])

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: FlagKey; enabled: boolean }) =>
      setFlagGlobal(key, enabled),
    onMutate: async ({ key, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['feature-flags', 'resolved'] })
      const previous = queryClient.getQueryData<ResolvedResponse>([
        'feature-flags',
        'resolved',
      ])
      queryClient.setQueryData<ResolvedResponse>(
        ['feature-flags', 'resolved'],
        (old) => ({
          resolvedAt: Date.now(),
          flags: { ...(old?.flags ?? {}), [key]: enabled },
        }),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['feature-flags', 'resolved'], ctx.previous)
      }
      queryClient.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
    },
    onSettled: () => {
      // Eventually reconcile with server-computed state.
      queryClient.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
    },
  })

  const bulkMutation = useMutation({
    mutationFn: async ({ keys, enabled }: { keys: FlagKey[]; enabled: boolean }) => {
      await Promise.all(keys.map((key) => setFlagGlobal(key, enabled)))
    },
    onMutate: async ({ keys, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['feature-flags', 'resolved'] })
      const previous = queryClient.getQueryData<ResolvedResponse>([
        'feature-flags',
        'resolved',
      ])
      queryClient.setQueryData<ResolvedResponse>(
        ['feature-flags', 'resolved'],
        (old) => {
          const next = { ...(old?.flags ?? {}) }
          for (const k of keys) next[k] = enabled
          return { resolvedAt: Date.now(), flags: next }
        },
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['feature-flags', 'resolved'], ctx.previous)
      }
      queryClient.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
    },
  })

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return ALL_FLAGS.filter((f) => {
      if (activeCategory !== 'all' && f.category !== activeCategory) return false
      if (!needle) return true
      return (
        f.key.toLowerCase().includes(needle) ||
        f.name.toLowerCase().includes(needle)
      )
    })
  }, [search, activeCategory])

  const grouped = useMemo(() => {
    const map = new Map<CategoryId, FlagMeta[]>()
    for (const f of filtered) {
      const list = map.get(f.category) ?? []
      list.push(f)
      map.set(f.category, list)
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      id: c,
      label: CATEGORY_LABELS[c],
      flags: map.get(c)!,
    }))
  }, [filtered])

  const availableCategories = useMemo(() => {
    const present = new Set<CategoryId>()
    for (const f of ALL_FLAGS) present.add(f.category)
    return CATEGORY_ORDER.filter((c) => present.has(c) && c !== 'other')
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <header className="space-y-2">
        <h1 className="font-display text-3xl text-brand-900">Feature flags</h1>
        <p className="text-muted-foreground">
          Control every feature across the platform.
        </p>
      </header>

      <div className="space-y-4">
        <div className="relative">
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flags by key or name…"
            aria-label="Search feature flags"
            className="pr-16"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-surface-50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        <div className="flex flex-wrap gap-2">
          <CategoryChip
            label="All"
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          />
          {availableCategories.map((c) => (
            <CategoryChip
              key={c}
              label={CATEGORY_LABELS[c]}
              active={activeCategory === c}
              onClick={() => setActiveCategory(c)}
            />
          ))}
        </div>
      </div>

      {resolvedQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Loading flags…</p>
      )}
      {resolvedQuery.isError && (
        <p className="text-sm text-destructive">Failed to load flag state.</p>
      )}

      <div className="space-y-10">
        {grouped.map((group) => {
          const allOn = group.flags.every((f) => flagState[f.key])
          const allOff = group.flags.every((f) => !flagState[f.key])
          return (
            <section key={group.id} className="space-y-4">
              <div className="flex items-end justify-between gap-4 pt-2">
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-semibold text-brand-900">
                    {group.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {group.flags.length} flag{group.flags.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={allOn || bulkMutation.isPending}
                    onClick={() =>
                      bulkMutation.mutate({
                        keys: group.flags.map((f) => f.key),
                        enabled: true,
                      })
                    }
                  >
                    Enable all
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={allOff || bulkMutation.isPending}
                    onClick={() =>
                      bulkMutation.mutate({
                        keys: group.flags.map((f) => f.key),
                        enabled: false,
                      })
                    }
                  >
                    Disable all
                  </Button>
                </div>
              </div>

              <Card className="divide-y divide-border overflow-hidden">
                {group.flags.map((flag) => {
                  const enabled = flagState[flag.key] ?? false
                  return (
                    <div
                      key={flag.key}
                      className="flex items-center gap-6 px-5 py-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {flag.key}
                          </span>
                          <DefaultBadge defaultEnabled={flag.defaultEnabled} />
                        </div>
                        <p className="font-semibold text-foreground">
                          {flag.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {flag.description}
                        </p>
                      </div>
                      <Switch
                        checked={enabled}
                        ariaLabel={`Toggle ${flag.name}`}
                        disabled={toggleMutation.isPending}
                        onChange={(next) =>
                          toggleMutation.mutate({ key: flag.key, enabled: next })
                        }
                      />
                    </div>
                  )
                })}
              </Card>
            </section>
          )
        })}

        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No flags match your filters.
          </p>
        )}
      </div>
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-brand-700 bg-brand-700 text-white'
          : 'border-border bg-card text-muted-foreground hover:border-brand-500 hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function DefaultBadge({ defaultEnabled }: { defaultEnabled: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        defaultEnabled
          ? 'bg-brand-100 text-brand-900'
          : 'bg-secondary text-muted-foreground',
      ].join(' ')}
    >
      default {defaultEnabled ? 'on' : 'off'}
    </span>
  )
}
