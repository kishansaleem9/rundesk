import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, cn, toast } from '@rundesk/ui'
import { Target, TrendingUp, CheckCircle2, AlertTriangle, Plus, Folder as FolderIcon, Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { goalProgress } from '../lib/goal-progress'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { useAuthStore } from '../store/auth'

/** A goal as `GET /workspaces/:id/goals` sends it. */
type Goal = {
  id: string
  title: string
  description?: string | null
  currentValue: number
  targetValue: number
  kind: 'numeric' | 'percentage' | 'boolean'
  status: 'on_track' | 'at_risk' | 'off_track' | 'completed'
  dueDate?: string | null
  ownerId?: string | null
  /** Its Goal Folder, if it is in one. */
  folderId?: string | null
}

/** A Goal Folder as `GET /workspaces/:id/goal-folders` sends it (`found-14-oct/clickup-import-rest-unimported`). */
type GoalFolder = { id: string; name: string; position: number; createdById: string | null }

const STATUS_META: Record<Goal['status'], { labelKey: TranslationKey; color: string; icon: React.ElementType }> = {
  on_track: { labelKey: 'goals.statusOnTrack', color: 'bg-emerald-500', icon: TrendingUp },
  at_risk: { labelKey: 'goals.statusAtRisk', color: 'bg-amber-500', icon: AlertTriangle },
  off_track: { labelKey: 'goals.statusOffTrack', color: 'bg-red-500', icon: AlertTriangle },
  completed: { labelKey: 'goals.statusCompleted', color: 'bg-brand-700', icon: CheckCircle2 },
}

export function GoalsPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/goals' })
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // A guest has no goal shared with them and may make none (the API answers
  // an empty list and 403), so they are offered no "New goal" to fail.
  const { role, isAdmin } = useWorkspaceRole(workspaceId)
  const isGuest = role === 'guest'
  const me = useAuthStore((s) => s.user?.id)
  // The folder a new goal goes into; '' for none.
  const [createIn, setCreateIn] = useState('')
  // The New folder field: closed (null) or its words so far.
  const [newFolder, setNewFolder] = useState<string | null>(null)

  const goalsQuery = useQuery({
    queryKey: ['goals', workspaceId],
    queryFn: () => api<Goal[]>(`/workspaces/${workspaceId}/goals`),
  })
  // A guest reads no goal, so no folder either (the API answers none).
  const foldersQuery = useQuery({
    queryKey: ['goal-folders', workspaceId],
    queryFn: () => api<GoalFolder[]>(`/workspaces/${workspaceId}/goal-folders`),
    enabled: !isGuest,
  })

  const createGoal = useMutation({
    mutationFn: async () =>
      api<Goal>(`/workspaces/${workspaceId}/goals`, {
        method: 'POST',
        body: { title: newTitle.trim(), ...(createIn ? { folderId: createIn } : {}) },
      }),
    onSuccess: async () => {
      setNewTitle('')
      setCreating(false)
      await qc.invalidateQueries({ queryKey: ['goals', workspaceId] })
    },
    onError: () => toast.error(t('goals.createFailed')),
  })

  const createFolder = useMutation({
    mutationFn: (name: string) => api<GoalFolder>(`/workspaces/${workspaceId}/goal-folders`, { method: 'POST', body: { name } }),
    onSuccess: async () => {
      setNewFolder(null)
      await qc.invalidateQueries({ queryKey: ['goal-folders', workspaceId] })
    },
    onError: () => toast.error(t('goals.folders.createFailed')),
  })

  const goals = goalsQuery.data ?? []
  const folders = foldersQuery.data ?? []
  const folderIds = new Set(folders.map((f) => f.id))
  const loose = goals.filter((g) => !g.folderId || !folderIds.has(g.folderId))
  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{t('common.workspace')}</div>
            <h1 className="font-display text-2xl font-semibold text-foreground">{t('goals.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('goals.subtitle')}
            </p>
          </div>
          {!isGuest && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setNewFolder('')} data-testid="goal-folder-new">
                <FolderIcon className="h-4 w-4 mr-1" /> {t('goals.folders.new')}
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-1" /> {t('goals.newGoal')}
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {newFolder !== null && (
          <Card className="p-4">
            <div className="flex gap-2">
              <Input
                autoFocus
                data-testid="goal-folder-name"
                placeholder={t('goals.folders.namePlaceholder')}
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolder.trim()) createFolder.mutate(newFolder.trim())
                  if (e.key === 'Escape') setNewFolder(null)
                }}
              />
              <Button data-testid="goal-folder-create" onClick={() => createFolder.mutate(newFolder.trim())} disabled={!newFolder.trim() || createFolder.isPending}>
                {t('common.create')}
              </Button>
              <Button variant="ghost" onClick={() => setNewFolder(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </Card>
        )}

        {creating && (
          <Card className="p-4">
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder={t('goals.titlePlaceholder')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle.trim()) createGoal.mutate()
                  if (e.key === 'Escape') {
                    setCreating(false)
                    setNewTitle('')
                  }
                }}
              />
              {folders.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t('goals.folders.moveTo')}
                  <select
                    data-testid="goal-create-folder"
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                    value={createIn}
                    onChange={(e) => setCreateIn(e.target.value)}
                  >
                    <option value="">{t('goals.folders.noFolder')}</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex gap-2">
                <Button onClick={() => createGoal.mutate()} disabled={!newTitle.trim() || createGoal.isPending}>
                  {t('common.create')}
                </Button>
                <Button variant="ghost" onClick={() => { setCreating(false); setNewTitle('') }}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {folders.map((f) => (
          <FolderSection
            key={f.id}
            folder={f}
            goals={goals.filter((g) => g.folderId === f.id)}
            folders={folders}
            canManage={isAdmin || (!!me && f.createdById === me)}
          />
        ))}

        <section data-testid="goal-folder-loose">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-foreground">{folders.length ? t('goals.folders.none') : t('goals.activeGoals')}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{tCount('goals.count', loose.length)}</span>
          </div>

          {goals.length === 0 ? (
            <Card className="p-10 text-center">
              <Target className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h3 className="font-display text-lg font-semibold text-foreground mb-1">{t('goals.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t(isGuest ? 'goals.emptyGuest' : 'goals.emptyDesc')}
              </p>
              {!isGuest && (
                <Button onClick={() => setCreating(true)} className="mt-4">
                  {t('goals.createFirst')}
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loose.map((goal) => (
                <GoalCard key={goal.id} goal={goal} folders={folders} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * A Goal Folder: its name, its goals, and — for its maker and the workspace's admins — Rename and
 * Delete, which the API answers for the same people. Deleting it leaves its goals, out of any folder.
 */
function FolderSection({ folder, goals, folders, canManage }: { folder: GoalFolder; goals: Goal[]; folders: GoalFolder[]; canManage: boolean }) {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/goals' })
  const qc = useQueryClient()
  const [renaming, setRenaming] = useState<string | null>(null)
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['goal-folders', workspaceId] })
    await qc.invalidateQueries({ queryKey: ['goals', workspaceId] })
  }
  const rename = useMutation({
    mutationFn: (name: string) => api(`/workspaces/${workspaceId}/goal-folders/${folder.id}`, { method: 'PATCH', body: { name } }),
    onSuccess: async () => {
      setRenaming(null)
      await refresh()
    },
    onError: () => toast.error(t('goals.folders.saveFailed')),
  })
  const remove = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/goal-folders/${folder.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: () => toast.error(t('goals.folders.saveFailed')),
  })
  return (
    <section data-testid="goal-folder" data-folder-id={folder.id}>
      <div className="flex items-center justify-between mb-3 gap-2">
        {renaming !== null ? (
          <Input
            autoFocus
            data-testid="goal-folder-rename-input"
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renaming.trim()) rename.mutate(renaming.trim())
              if (e.key === 'Escape') setRenaming(null)
            }}
          />
        ) : (
          <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2" data-testid="goal-folder-name-text">
            <FolderIcon className="h-4 w-4 text-muted-foreground" /> {folder.name}
          </h2>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{tCount('goals.count', goals.length)}</span>
          {canManage && renaming === null && (
            <>
              <Button size="sm" variant="ghost" data-testid="goal-folder-rename" aria-label={t('goals.folders.rename')} onClick={() => setRenaming(folder.name)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="goal-folder-delete"
                aria-label={t('goals.folders.delete')}
                onClick={() => {
                  if (window.confirm(t('goals.folders.deleteConfirm', { name: folder.name }))) remove.mutate()
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('goals.folders.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} folders={folders} />
          ))}
        </div>
      )}
    </section>
  )
}

function GoalCard({ goal, folders }: { goal: Goal; folders: GoalFolder[] }) {
  const { t } = useTranslation()
  const meta = STATUS_META[goal.status]
  const Icon = meta.icon
  const { workspaceId } = useParams({ from: '/app/$workspaceId/goals' })
  const qc = useQueryClient()
  const move = useMutation({
    mutationFn: (folderId: string | null) => api(`/goals/${goal.id}`, { method: 'PATCH', body: { folderId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals', workspaceId] }),
    onError: () => toast.error(t('goals.folders.moveFailed')),
  })
  return (
    <div className="relative">
    {folders.length > 0 && (
      <select
        data-testid={`goal-folder-select-${goal.id}`}
        aria-label={t('goals.folders.moveTo')}
        className="absolute right-3 top-3 z-10 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
        value={goal.folderId ?? ''}
        onChange={(e) => move.mutate(e.target.value || null)}
      >
        <option value="">{t('goals.folders.noFolder')}</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    )}
    <Link
      to="/app/$workspaceId/goals/$goalId"
      params={{ workspaceId, goalId: goal.id }}
      className="block group"
    >
      <Card className="p-4 hover:border-accent/40 hover:shadow-glow transition-all">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Target className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate group-hover:text-accent transition-colors">{goal.title}</h3>
            {goal.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{goal.description}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={cn('h-full transition-all', meta.color)}
                  style={{ width: `${goalProgress(goal.currentValue, goal.targetValue)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right" data-testid={`goal-progress-${goal.id}`}>
                {goalProgress(goal.currentValue, goal.targetValue)}%
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3 w-3" />
              <span>{t(meta.labelKey)}</span>
              {goal.dueDate && <span>· {t('goals.due', { date: new Date(goal.dueDate).toLocaleDateString() })}</span>}
            </div>
          </div>
        </div>
      </Card>
    </Link>
    </div>
  )
}
