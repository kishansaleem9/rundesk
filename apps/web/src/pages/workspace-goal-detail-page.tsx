import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Badge,
  Button,
  Input,
  Progress,
  PersonAvatar,
  toast,
  cn,
} from '@rundesk/ui'
import {
  ArrowLeft,
  Target,
  TrendingUp,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Check,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'completed'

type KeyResult = {
  id: string
  goalId: string
  ownerName: string | null
  title: string
  unit: string | null
  targetValue: number
  currentValue: number
  status: GoalStatus
}

type GoalDetail = {
  id: string
  title: string
  description: string | null
  owner: { id: string; displayName: string | null } | null
  targetValue: number
  currentValue: number
  unit: string | null
  status: GoalStatus
  dueDate: string | null
  keyResults: KeyResult[]
}

const STATUS_META: Record<GoalStatus, { labelKey: TranslationKey; badge: 'success' | 'warning' | 'destructive'; icon: typeof TrendingUp }> = {
  on_track: { labelKey: 'goalDetail.status.onTrack', badge: 'success', icon: TrendingUp },
  at_risk: { labelKey: 'goalDetail.status.atRisk', badge: 'warning', icon: AlertTriangle },
  off_track: { labelKey: 'goalDetail.status.offTrack', badge: 'destructive', icon: AlertTriangle },
  completed: { labelKey: 'goalDetail.status.completed', badge: 'success', icon: CheckCircle2 },
}

const pctOf = (cur: number, target: number) => (target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 0)
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null)

export function GoalDetailPage() {
  const { t, tCount } = useTranslation()
  const { goalId } = useParams({ from: '/app/$workspaceId/goals/$goalId' })
  const qc = useQueryClient()
  const goalQuery = useQuery({
    queryKey: ['goal', goalId],
    queryFn: () => api<GoalDetail>(`/goals/${goalId}`),
  })

  const [addingKr, setAddingKr] = useState(false)
  const [editingProgress, setEditingProgress] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['goal', goalId] })

  const setGoalProgress = useMutation({
    mutationFn: (currentValue: number) => api(`/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify({ currentValue }) }),
    onSuccess: () => { invalidate(); setEditingProgress(false); toast.success(t('goalDetail.toastProgressUpdated')) },
    onError: () => toast.error(t('goalDetail.toastProgressError')),
  })
  const addKr = useMutation({
    mutationFn: (body: { title: string; targetValue: number; unit?: string }) =>
      api(`/goals/${goalId}/key-results`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setAddingKr(false); toast.success(t('goalDetail.toastKrAdded')) },
    onError: () => toast.error(t('goalDetail.toastKrAddError')),
  })
  const updateKr = useMutation({
    mutationFn: ({ id, currentValue }: { id: string; currentValue: number }) =>
      api(`/goals/${goalId}/key-results/${id}`, { method: 'PATCH', body: JSON.stringify({ currentValue }) }),
    onSuccess: invalidate,
    onError: () => toast.error(t('goalDetail.toastKrUpdateError')),
  })
  const deleteKr = useMutation({
    mutationFn: (id: string) => api(`/goals/${goalId}/key-results/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: () => toast.error(t('goalDetail.toastKrRemoveError')),
  })

  if (goalQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('goalDetail.loading')}</div>
  }
  if (goalQuery.isError || !goalQuery.data) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground"><Link to="..">
          <ArrowLeft className="h-3.5 w-3.5" /> {t('goalDetail.allGoals')}</Link></Button>
        <p className="text-sm text-muted-foreground">{t('goalDetail.notFound')}</p>
      </div>
    )
  }

  const goal = goalQuery.data
  const meta = STATUS_META[goal.status] ?? STATUS_META.on_track
  const progress = pctOf(goal.currentValue, goal.targetValue)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link to="..">
          <ArrowLeft className="h-3.5 w-3.5" /> {t('goalDetail.allGoals')}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
            {t('goalDetail.objective')}
            <Badge variant={meta.badge} className="text-[9px] uppercase">{t(meta.labelKey)}</Badge>
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-start gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow shrink-0 mt-1">
              <Target className="h-4 w-4" />
            </span>
            <span>{goal.title}</span>
          </h1>
          {goal.description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{goal.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-3">
            {goal.owner?.displayName && (
              <span className="flex items-center gap-1.5">
                <PersonAvatar name={goal.owner.displayName} size="sm" />
                {goal.owner.displayName}
              </span>
            )}
            {goal.dueDate && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {t('goalDetail.due', { date: fmt(goal.dueDate) ?? '' })}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditingProgress((v) => !v)}>{t('goalDetail.updateProgress')}</Button>
          <Button variant="gradient" size="sm" onClick={() => setAddingKr((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> {t('goalDetail.addKeyResult')}
          </Button>
        </div>
      </div>

      {/* Rolled-up progress card */}
      <Card variant="glass" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('goalDetail.objectiveProgress')}</div>
            <div className="font-display text-3xl font-semibold tabular-nums">
              {progress}%
              <span className="text-sm font-normal text-muted-foreground ml-2 tabular-nums">
                {goal.currentValue} / {goal.targetValue}{goal.unit ? ` ${goal.unit}` : ''}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{tCount('goalDetail.keyResultsCount', goal.keyResults.length)}</div>
          </div>
          {editingProgress && (
            <ProgressEditor
              initial={goal.currentValue}
              target={goal.targetValue}
              pending={setGoalProgress.isPending}
              onSave={(v) => setGoalProgress.mutate(v)}
              onCancel={() => setEditingProgress(false)}
            />
          )}
        </div>
        <Progress value={progress} className="h-2" />
      </Card>

      {/* Key results */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">{t('goalDetail.keyResultsHeading')}</h2>

        {addingKr && (
          <AddKeyResultForm
            pending={addKr.isPending}
            onAdd={(body) => addKr.mutate(body)}
            onCancel={() => setAddingKr(false)}
          />
        )}

        {goal.keyResults.length === 0 && !addingKr ? (
          <Card variant="glass" className="p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('goalDetail.emptyKeyResults')}</p>
          </Card>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-accent/60 via-accent/30 to-transparent" />
            <div className="space-y-3">
              {goal.keyResults.map((kr, i) => (
                <KeyResultCard
                  key={kr.id}
                  kr={kr}
                  index={i}
                  onUpdate={(currentValue) => updateKr.mutate({ id: kr.id, currentValue })}
                  onDelete={() => deleteKr.mutate(kr.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function ProgressEditor({ initial, target, pending, onSave, onCancel }: {
  initial: number; target: number; pending: boolean; onSave: (v: number) => void; onCancel: () => void
}) {
  const { t } = useTranslation()
  const [val, setVal] = useState(String(initial))
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-8 w-24"
        autoFocus
      />
      <span className="text-xs text-muted-foreground">/ {target}</span>
      <Button size="sm" variant="gradient" disabled={pending} onClick={() => onSave(Number(val) || 0)}>{t('common.save')}</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
    </div>
  )
}

function AddKeyResultForm({ pending, onAdd, onCancel }: {
  pending: boolean; onAdd: (b: { title: string; targetValue: number; unit?: string }) => void; onCancel: () => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('100')
  const [unit, setUnit] = useState('%')
  return (
    <Card variant="glass" className="p-4 mb-3 space-y-2">
      <Input placeholder={t('goalDetail.keyResultPlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <div className="flex items-center gap-2">
        <Input type="number" placeholder={t('goalDetail.targetPlaceholder')} value={target} onChange={(e) => setTarget(e.target.value)} className="w-28" />
        <Input placeholder={t('goalDetail.unitPlaceholder')} value={unit} onChange={(e) => setUnit(e.target.value)} className="w-32" />
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button
          size="sm"
          variant="gradient"
          disabled={pending || !title.trim()}
          onClick={() => onAdd({ title: title.trim(), targetValue: Number(target) || 100, unit: unit.trim() || undefined })}
        >
          {t('goalDetail.add')}
        </Button>
      </div>
    </Card>
  )
}

function KeyResultCard({ kr, index, onUpdate, onDelete }: {
  kr: KeyResult; index: number; onUpdate: (v: number) => void; onDelete: () => void
}) {
  const { t } = useTranslation()
  const meta = STATUS_META[kr.status] ?? STATUS_META.on_track
  const StatusIcon = meta.icon
  const pct = pctOf(kr.currentValue, kr.targetValue)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(kr.currentValue))
  return (
    <div className="relative">
      <div className="absolute -left-[14px] top-5 flex h-3 w-3 items-center justify-center">
        <div className={cn('h-3 w-3 rounded-full', kr.status === 'completed' ? 'bg-success' : 'bg-accent')} />
      </div>
      <Card variant="glass" className="p-4 hover:border-accent/40 transition-colors">
        <div className="flex items-start gap-4">
          <Badge variant="soft" className="font-mono text-[9px] uppercase mt-0.5">{t('goalDetail.krBadge', { num: index + 1 })}</Badge>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
              <span className="font-medium">{kr.title}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant={meta.badge} className="text-[9px] uppercase">
                  <StatusIcon className="h-2.5 w-2.5" /> {t(meta.labelKey)}
                </Badge>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete} title={t('goalDetail.removeKeyResult')}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              {editing ? (
                <span className="flex items-center gap-1.5">
                  <Input type="number" value={val} onChange={(e) => setVal(e.target.value)} className="h-7 w-24" autoFocus />
                  <span>/ {kr.targetValue}{kr.unit ? ` ${kr.unit}` : ''}</span>
                  <Button size="icon" variant="gradient" className="h-7 w-7" onClick={() => { onUpdate(Number(val) || 0); setEditing(false) }} title={t('common.save')}>
                    <Check className="h-3 w-3" />
                  </Button>
                </span>
              ) : (
                <button type="button" className="hover:text-foreground" onClick={() => { setVal(String(kr.currentValue)); setEditing(true) }} title={t('goalDetail.clickToUpdate')}>
                  <span className="text-foreground font-medium tabular-nums">
                    {kr.currentValue} / {kr.targetValue}{kr.unit ? ` ${kr.unit}` : ''}
                  </span>
                </button>
              )}
              {kr.ownerName && (
                <>
                  <span>·</span>
                  <PersonAvatar name={kr.ownerName} size="sm" />
                  <span>{kr.ownerName}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Progress
                value={pct}
                indicatorClassName={cn(
                  kr.status === 'completed' && 'bg-success',
                  kr.status === 'at_risk' && 'bg-warning',
                  kr.status === 'off_track' && 'bg-destructive',
                )}
              />
              <span className="text-xs font-medium tabular-nums w-10 text-right">{pct}%</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
