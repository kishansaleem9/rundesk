import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  Textarea,
  Switch,
  Badge,
  cn,
} from '@rundesk/ui'
import { ChevronLeft, ChevronRight, Lock, Layers, Circle, ToggleRight } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { CONTAINER_COLORS, CONTAINER_ICONS } from './container-edit-dialog'
import { toast } from '@rundesk/ui'

/**
 * §V2-06 — "Create a Space", frames `06:52` and `07:06`.
 *
 * Creating a space asked for a name and nothing else, from two different
 * dialogs that looked nothing alike — the quick-create modal's Space tab and
 * the sidebar's "New space". This is one wizard, used by both, so there is one
 * answer to "what does creating a space ask you".
 *
 * Step one, frame `06:52`: Icon & name · Description *(optional)* · Default
 * permission · Make Private, with the subtitle the frame carries. Step two,
 * frame `07:06`: four workflow presets, then "Customize defaults for
 * `<preset>`" over Default views, Task statuses and ClickApps.
 *
 * THE PRESETS ARE FETCHED, NOT LISTED HERE. `GET /space-presets` returns the
 * same objects the server applies, so what this previews and what gets built
 * cannot drift into disagreeing about what "Marketing Teams" means.
 */

type PresetStatus = { key: string; name: string; color: string; category: string }
type SpacePreset = {
  key: string
  views: string[]
  defaultView: string
  statuses: PresetStatus[]
  features: string[]
  seedLists: string[]
}
type PresetPayload = { presets: SpacePreset[]; features: string[]; views: string[] }

/** The four rungs, using the wording the share dialog already uses for them. */
const PERMISSIONS: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: 'view', labelKey: 'share.levelView' },
  { value: 'comment', labelKey: 'share.levelComment' },
  { value: 'edit', labelKey: 'share.levelEdit' },
  { value: 'admin', labelKey: 'share.levelFull' },
]

const VIEW_LABEL: Record<string, TranslationKey> = {
  list: 'list.viewList',
  board: 'list.viewBoard',
  table: 'list.viewTable',
  calendar: 'list.viewCalendar',
  gantt: 'list.viewGantt',
}

/*
 * Frame `07:19` lists ClickApps that have no Rundesk equivalent (Remap Subtask
 * Due Dates, Incomplete Warning). Those are absent rather than decorative —
 * the server decides the set, and this map only supplies wording for whatever
 * it sends. A key arriving with no entry here renders as itself rather than
 * disappearing, so a new server-side feature is visible-but-untranslated
 * instead of silently missing.
 */
const FEATURE_LABEL: Record<string, TranslationKey> = {
  priority: 'taskDetail.fieldPriority',
  tags: 'list.filter.fieldTags',
  customFields: 'spaceWizard.featureCustomFields',
  multipleAssignees: 'spaceWizard.featureMultipleAssignees',
  timeTracking: 'spaceWizard.featureTimeTracking',
  timeEstimates: 'spaceWizard.featureTimeEstimates',
  milestones: 'spaceWizard.featureMilestones',
  wipLimits: 'spaceWizard.featureWipLimits',
  listEmail: 'spaceWizard.featureListEmail',
}

const PRESET_LABEL: Record<string, { name: TranslationKey; blurb: TranslationKey }> = {
  starter: { name: 'spaceWizard.presetStarter', blurb: 'spaceWizard.presetStarterBlurb' },
  marketing: { name: 'spaceWizard.presetMarketing', blurb: 'spaceWizard.presetMarketingBlurb' },
  project: { name: 'spaceWizard.presetProject', blurb: 'spaceWizard.presetProjectBlurb' },
  product: { name: 'spaceWizard.presetProduct', blurb: 'spaceWizard.presetProductBlurb' },
}

type Panel = 'none' | 'views' | 'statuses' | 'features'

export function CreateSpaceWizard({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  workspaceId: string
  onCreated?: (space: { id: string; name: string }) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const [step, setStep] = useState<1 | 2>(1)
  const [panel, setPanel] = useState<Panel>('none')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('🚀')
  const [color, setColor] = useState(CONTAINER_COLORS[0])
  const [permission, setPermission] = useState('edit')
  const [isPrivate, setIsPrivate] = useState(false)
  const [presetKey, setPresetKey] = useState('starter')
  /* null until the person opens a panel and changes something — then theirs wins. */
  const [views, setViews] = useState<string[] | null>(null)
  const [defaultView, setDefaultView] = useState<string | null>(null)
  const [features, setFeatures] = useState<string[] | null>(null)

  const { data: payload } = useQuery({
    queryKey: ['space-presets'],
    queryFn: () => api<PresetPayload>('/space-presets'),
    enabled: open,
    staleTime: Infinity, // it is a constant
  })
  const presets = payload?.presets ?? []
  const preset = presets.find((p) => p.key === presetKey)

  // A fresh dialog should not show the last visit's answers.
  useEffect(() => {
    if (open) return
    setStep(1); setPanel('none')
    setName(''); setDescription(''); setIcon('🚀'); setColor(CONTAINER_COLORS[0])
    setPermission('edit'); setIsPrivate(false); setPresetKey('starter')
    setViews(null); setDefaultView(null); setFeatures(null)
  }, [open])

  /*
   * Choosing a different card drops the customisations, because they were
   * customisations OF the old card. Keeping them would silently mix "Marketing
   * Teams" with Project Management's views and call the result Marketing.
   */
  const choosePreset = (key: string) => {
    setPresetKey(key)
    setViews(null); setDefaultView(null); setFeatures(null)
  }

  const effectiveViews = views ?? preset?.views ?? ['list']
  const effectiveDefaultView = defaultView ?? preset?.defaultView ?? 'list'
  const effectiveFeatures = features ?? preset?.features ?? []

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; name: string }>('/spaces', {
        method: 'POST',
        body: {
          workspaceId,
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          color,
          visibility: isPrivate ? 'private' : 'public',
          defaultPermission: permission,
          presetKey,
          viewConfig: { enabledViews: effectiveViews, defaultView: effectiveDefaultView },
          features: effectiveFeatures,
        },
      }),
    onSuccess: async (space) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['spaces', workspaceId] }),
        qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] }),
      ])
      onOpenChange(false)
      onCreated?.(space)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('spaceWizard.createFailed')),
  })

  /* ── the panels behind the three `›` rows of frame 07:06 ─────────────── */

  if (panel === 'views') {
    return (
      <PanelShell
        open={open}
        onOpenChange={onOpenChange}
        title={t('spaceWizard.viewsTitle')}
        blurb={t('spaceWizard.viewsBlurb')}
        onBack={() => setPanel('none')}
        onDone={() => setPanel('none')}
        testId="space-wizard-views"
      >
        {(payload?.views ?? []).map((view) => {
          // §V2-06 frame 07:12 — List is marked "Required" and cannot be turned
          // off. Everything on a list falls back to it, so a space without it
          // has lists that cannot render.
          const required = view === 'list'
          const on = required || effectiveViews.includes(view)
          return (
            <div key={view} className="flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-muted/40">
              <span className="flex items-center gap-2 text-[13px]">
                {t(VIEW_LABEL[view] ?? 'list.viewList')}
                {required && <Badge variant="secondary">{t('spaceWizard.required')}</Badge>}
                {effectiveDefaultView === view && <Badge variant="soft">{t('spaceWizard.defaultView')}</Badge>}
              </span>
              <span className="flex items-center gap-2">
                {on && effectiveDefaultView !== view && (
                  <button
                    type="button"
                    onClick={() => setDefaultView(view)}
                    data-testid={`space-wizard-default-${view}`}
                    className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    {t('spaceWizard.markDefault')}
                  </button>
                )}
                <Switch
                  checked={on}
                  disabled={required}
                  data-testid={`space-wizard-view-${view}`}
                  onCheckedChange={(next) => {
                    const base = effectiveViews.filter((v) => v !== view)
                    const nextViews = next ? [...effectiveViews, view] : base
                    setViews(nextViews.length ? nextViews : ['list'])
                    // Turning off the default view has to move the default, or
                    // the space opens on a view it does not have.
                    if (!next && effectiveDefaultView === view) setDefaultView('list')
                  }}
                />
              </span>
            </div>
          )
        })}
      </PanelShell>
    )
  }

  if (panel === 'features') {
    const all = payload?.features ?? []
    const allOff = effectiveFeatures.length === 0
    return (
      <PanelShell
        open={open}
        onOpenChange={onOpenChange}
        title={t('spaceWizard.featuresTitle')}
        blurb={t('spaceWizard.featuresBlurb')}
        onBack={() => setPanel('none')}
        onDone={() => setPanel('none')}
        testId="space-wizard-features"
      >
        {/* Frame 07:19's master switch, top-left of the grid. */}
        <label className="mb-2 flex items-center gap-2 rounded px-2 py-2 text-[13px]">
          <Switch
            checked={allOff}
            data-testid="space-wizard-features-none"
            onCheckedChange={(next) => setFeatures(next ? [] : [...all])}
          />
          {t('spaceWizard.turnOffAll')}
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {all.map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-[13px]"
            >
              <span className="flex items-center gap-2">
                <ToggleRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {FEATURE_LABEL[key] ? t(FEATURE_LABEL[key]) : key}
              </span>
              <Switch
                checked={effectiveFeatures.includes(key)}
                data-testid={`space-wizard-feature-${key}`}
                onCheckedChange={(next) =>
                  setFeatures(
                    next
                      ? [...effectiveFeatures, key]
                      : effectiveFeatures.filter((f) => f !== key),
                  )
                }
              />
            </label>
          ))}
        </div>
      </PanelShell>
    )
  }

  if (panel === 'statuses') {
    return (
      <PanelShell
        open={open}
        onOpenChange={onOpenChange}
        title={t('spaceWizard.statusesTitle')}
        blurb={t('spaceWizard.statusesBlurb')}
        onBack={() => setPanel('none')}
        onDone={() => setPanel('none')}
        testId="space-wizard-statuses"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {(preset?.statuses ?? []).map((st, i) => (
            <span key={st.key} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />}
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[12px]"
                data-testid="space-wizard-status"
              >
                <Circle className="h-2.5 w-2.5" style={{ color: st.color, fill: st.color }} aria-hidden />
                {st.name}
              </span>
            </span>
          ))}
        </div>
        {/*
          Said plainly rather than shown as an editor that is not one. These
          statuses are created WITH the space; changing them before it exists
          would need somewhere to keep them, and the space's own Statuses panel
          already does the job a moment later.
        */}
        <p className="mt-3 text-[12px] text-muted-foreground">{t('spaceWizard.statusesEditLater')}</p>
      </PanelShell>
    )
  }

  /* ── step two ───────────────────────────────────────────────────────── */

  if (step === 2) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl" data-testid="space-wizard-step2">
          <DialogHeader>
            <DialogTitle>{t('spaceWizard.workflowTitle')}</DialogTitle>
            <DialogDescription>{t('spaceWizard.workflowBlurb')}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                data-testid={`space-wizard-preset-${p.key}`}
                aria-pressed={presetKey === p.key}
                onClick={() => choosePreset(p.key)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  presetKey === p.key
                    ? 'border-accent/60 bg-accent/10'
                    : 'border-border/70 hover:bg-muted/40',
                )}
              >
                <div className="text-[13px] font-medium">{t(PRESET_LABEL[p.key]?.name ?? 'spaceWizard.presetStarter')}</div>
                <div className="text-[12px] text-muted-foreground">
                  {t(PRESET_LABEL[p.key]?.blurb ?? 'spaceWizard.presetStarterBlurb')}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-3 text-[12px] font-medium">
            {t('spaceWizard.customizeFor', {
              preset: t(PRESET_LABEL[presetKey]?.name ?? 'spaceWizard.presetStarter'),
            })}
          </div>
          <div className="rounded-lg border border-border/70">
            <SummaryRow
              testId="space-wizard-row-views"
              label={t('spaceWizard.defaultViews')}
              value={effectiveViews.map((v) => t(VIEW_LABEL[v] ?? 'list.viewList')).join(', ')}
              onClick={() => setPanel('views')}
            />
            <SummaryRow
              testId="space-wizard-row-statuses"
              label={t('spaceWizard.taskStatuses')}
              value={(preset?.statuses ?? []).map((s) => s.name).join(' → ')}
              onClick={() => setPanel('statuses')}
            />
            <SummaryRow
              testId="space-wizard-row-features"
              label={t('spaceWizard.clickApps')}
              value={
                effectiveFeatures.length
                  ? effectiveFeatures.map((f) => (FEATURE_LABEL[f] ? t(FEATURE_LABEL[f]) : f)).join(', ')
                  : t('spaceWizard.noneOn')
              }
              onClick={() => setPanel('features')}
            />
          </div>

          {/*
            `[07:46]` — "yeh LIST automatically generate kar deta hai". Said out
            loud before the button, because a space that arrives with two lists
            you did not make is confusing unless you were told.
          */}
          {!!preset?.seedLists.length && (
            <p className="mt-2 text-[12px] text-muted-foreground" data-testid="space-wizard-seed-note">
              {t('spaceWizard.willSeed', { lists: preset.seedLists.join(', ') })}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} data-testid="space-wizard-back">
              <ChevronLeft className="h-3.5 w-3.5" /> {t('spaceWizard.back')}
            </Button>
            <Button
              variant="gradient"
              size="sm"
              disabled={create.isPending}
              onClick={() => create.mutate()}
              data-testid="space-wizard-create"
            >
              {create.isPending ? t('common.saving') : t('spaceWizard.createSpace')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  /* ── step one ───────────────────────────────────────────────────────── */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="space-wizard-step1">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" aria-hidden />
            {t('spaceWizard.title')}
          </DialogTitle>
          <DialogDescription>{t('spaceWizard.blurb')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[12px] font-medium">{t('spaceWizard.iconAndName')}</div>
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[16px]"
                style={{ backgroundColor: `${color}22`, color }}
                aria-hidden
              >
                {icon}
              </span>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('spaceWizard.namePlaceholder')}
                aria-label={t('spaceWizard.iconAndName')}
                data-testid="space-wizard-name"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {CONTAINER_ICONS.slice(0, 16).map((ic) => (
                <button
                  key={ic}
                  type="button"
                  aria-label={ic}
                  aria-pressed={icon === ic}
                  onClick={() => setIcon(ic)}
                  className={cn('h-7 w-7 rounded text-[14px] hover:bg-muted/60', icon === ic && 'bg-muted')}
                >
                  {ic}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CONTAINER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn('h-5 w-5 rounded-full border', color === c ? 'border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium" htmlFor="space-wizard-description">
              {t('spaceWizard.description')}
            </label>
            <Textarea
              id="space-wizard-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="space-wizard-description"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-[13px]" htmlFor="space-wizard-permission">
              {t('spaceWizard.defaultPermission')}
            </label>
            <select
              id="space-wizard-permission"
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              data-testid="space-wizard-permission"
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
            >
              {PERMISSIONS.map((p) => (
                <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[13px]">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {t('spaceWizard.makePrivate')}
              </div>
              <div className="text-[12px] text-muted-foreground">{t('spaceWizard.makePrivateHint')}</div>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} data-testid="space-wizard-private" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <Button
            variant="gradient"
            size="sm"
            disabled={!name.trim()}
            onClick={() => setStep(2)}
            data-testid="space-wizard-continue"
          >
            {t('spaceWizard.continue')} <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One `label — value ›` row of frame `07:06`'s "Customize defaults" list. */
function SummaryRow({
  label,
  value,
  onClick,
  testId,
}: {
  label: string
  value: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/40"
    >
      <span className="text-[13px]">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[12px] text-muted-foreground">{value}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </span>
    </button>
  )
}

/** The back-arrow / title / Done frame that 07:12 and 07:19 both use. */
function PanelShell({
  open,
  onOpenChange,
  title,
  blurb,
  onBack,
  onDone,
  testId,
  children,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  title: string
  blurb: string
  onBack: () => void
  onDone: () => void
  testId: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid={testId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              aria-label={t('spaceWizard.back')}
              className="rounded p-1 hover:bg-muted/60"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {title}
          </DialogTitle>
          <DialogDescription>{blurb}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto">{children}</div>
        <Button variant="gradient" size="sm" className="mt-3 w-full" onClick={onDone} data-testid={`${testId}-done`}>
          {t('spaceWizard.done')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
