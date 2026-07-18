import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Badge,
  Button,
  Input,
  Textarea,
  Label,
  Switch,
  cn,
} from '@rundesk/ui'
import { Megaphone, Plus, Trash2, Sparkles, AlertTriangle, Pause } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type Tone = 'info' | 'celebrate' | 'warn'

// `labelKey` references an i18n catalog entry; the raw `value` is the
// locale-independent identifier persisted to the API.
const TONE_OPTIONS = [
  { value: 'info', labelKey: 'adminAnnouncements.toneInfo' },
  { value: 'celebrate', labelKey: 'adminAnnouncements.toneCelebrate' },
  { value: 'warn', labelKey: 'adminAnnouncements.toneWarn' },
] as const
type Item = {
  id: string
  title: string
  body: string
  tone: Tone
  active: boolean
  expires: string
  views: number
  dismisses: number
}

export function AnnouncementsAdminPage() {
  const { t, tCount } = useTranslation()
  const qc = useQueryClient()
  const workspacesQuery = useQuery({
    queryKey: ['announcement-admin-workspaces'],
    // GET /workspaces returns `{ workspace, role }[]`, not a flat workspace list —
    // reading `w.id`/`w.name` off the wrapper gave every <option> an empty value,
    // so the selected workspaceId was '' and Publish POSTed to `/workspaces//announcements` (404).
    queryFn: async () => {
      const rows = await api<Array<{ workspace: { id: string; name: string } }>>('/workspaces')
      return rows.map((r) => r.workspace).filter((w): w is { id: string; name: string } => Boolean(w?.id))
    },
  })
  const workspaces = workspacesQuery.data ?? []
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const workspaceId =
    selectedWorkspaceId && workspaces.some((w) => w.id === selectedWorkspaceId)
      ? selectedWorkspaceId
      : workspaces[0]?.id ?? ''
  const announcementsQuery = useQuery({
    queryKey: ['admin-announcements', workspaceId],
    enabled: workspaceId.length > 0,
    queryFn: async () => {
      const rows = await api<Array<{
        id: string
        title: string
        body: string
        tone: Tone
        isActive: boolean
        expiresAt: string | null
        views: number
        dismisses: number
      }>>(`/workspaces/${workspaceId}/announcements`)
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        tone: row.tone,
        active: row.isActive,
        expires: row.expiresAt ? row.expiresAt.slice(0, 10) : '',
        views: row.views,
        dismisses: row.dismisses,
      })) as Item[]
    },
  })
  const items = announcementsQuery.data ?? []
  const [draft, setDraft] = useState({
    title: '',
    body: '',
    tone: 'celebrate' as Tone,
    expires: '',
  })

  const createAnnouncement = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/announcements`, {
        method: 'POST',
        body: {
          title: draft.title,
          body: draft.body,
          tone: draft.tone,
          expiresAt: draft.expires || null,
          isActive: true,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-announcements', workspaceId] })
      setDraft({ title: '', body: '', tone: 'celebrate', expires: '' })
    },
  })
  const updateAnnouncement = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ isActive: boolean }> }) =>
      api(`/workspaces/${workspaceId}/announcements/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-announcements', workspaceId] })
    },
  })
  const deleteAnnouncement = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-announcements', workspaceId] })
    },
  })

  function add() {
    if (!draft.title.trim()) return
    createAnnouncement.mutate()
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          {t('adminAnnouncements.eyebrow')}
        </div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Megaphone className="h-4 w-4" />
          </span>
          {t('adminAnnouncements.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          {t('adminAnnouncements.subtitle')}
        </p>
        {workspaces.length > 0 && (
          <div className="mt-4 space-y-1.5 max-w-xs">
            <Label htmlFor="announcement-workspace">{t('common.workspace')}</Label>
            <select
              id="announcement-workspace"
              value={workspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              disabled={workspaces.length < 2}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* Compose */}
      <Card variant="glass" className="p-5 space-y-4">
        <h2 className="font-display text-lg font-semibold">{t('adminAnnouncements.newAnnouncement')}</h2>
        <div className="space-y-2">
          <Label>{t('adminAnnouncements.titleLabel')}</Label>
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t('adminAnnouncements.titlePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('adminAnnouncements.bodyLabel')}</Label>
          <Textarea
            rows={2}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder={t('adminAnnouncements.bodyPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('adminAnnouncements.toneLabel')}</Label>
            <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-md p-1">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDraft({ ...draft, tone: option.value })}
                  className={cn(
                    'flex-1 text-xs px-3 py-1.5 rounded font-medium transition-all capitalize',
                    draft.tone === option.value
                      ? 'bg-brand-gradient text-white'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('adminAnnouncements.expiresLabel')}</Label>
            <Input
              type="date"
              value={draft.expires}
              onChange={(e) => setDraft({ ...draft, expires: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost">{t('adminAnnouncements.saveDraft')}</Button>
          <Button variant="gradient" onClick={add} disabled={!draft.title.trim()}>
            <Plus className="h-3.5 w-3.5" /> {t('adminAnnouncements.publish')}
          </Button>
        </div>
      </Card>

      {/* List */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          {t('adminAnnouncements.allAnnouncements')}
        </h2>
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} variant="glass" className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md shrink-0 text-white',
                    item.tone === 'celebrate' && 'bg-brand-gradient',
                    item.tone === 'warn' && 'bg-warning',
                    item.tone === 'info' && 'bg-accent',
                  )}
                >
                  {item.tone === 'celebrate' ? <Sparkles className="h-4 w-4" /> : item.tone === 'warn' ? <AlertTriangle className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    {item.active ? (
                      <Badge variant="success" className="text-[9px] uppercase">{t('adminAnnouncements.statusLive')}</Badge>
                    ) : (
                      <Badge variant="soft" className="text-[9px] uppercase">
                        <Pause className="h-2.5 w-2.5" /> {t('adminAnnouncements.statusPaused')}
                      </Badge>
                    )}
                  </div>
                  {item.body && <p className="text-xs text-muted-foreground mt-0.5">{item.body}</p>}
                  <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-3">
                    <span>{t('adminAnnouncements.expiresOn', { date: fmt(item.expires) })}</span>
                    <span>· {tCount('adminAnnouncements.viewsCount', item.views)}</span>
                    <span>· {tCount('adminAnnouncements.dismissesCount', item.dismisses)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    checked={item.active}
                    onCheckedChange={(v) =>
                      updateAnnouncement.mutate({ id: item.id, patch: { isActive: v } })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteAnnouncement.mutate(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
