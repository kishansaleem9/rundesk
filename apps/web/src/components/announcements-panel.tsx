import { useState } from 'react'
import { InlineSkeleton, ListSkeleton } from './loading-skeletons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Badge, Button, Input, Textarea, Label, Switch, cn, toast } from '@rundesk/ui'
import { Megaphone, Plus, Trash2, Sparkles, AlertTriangle, Pause } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { usePermissions } from '../hooks/use-permissions'
import { useWorkspaceRole } from '../hooks/use-workspace-role'

type Tone = 'info' | 'celebrate' | 'warn'

// `labelKey` references an i18n catalog entry; the raw `value` is the
// locale-independent identifier persisted to the API.
const TONE_OPTIONS = [
  { value: 'info', labelKey: 'adminAnnouncements.toneInfo' },
  { value: 'celebrate', labelKey: 'adminAnnouncements.toneCelebrate' },
  { value: 'warn', labelKey: 'adminAnnouncements.toneWarn' },
] as const

type Announcement = {
  id: string
  title: string
  body: string
  tone: Tone
  isActive: boolean
  expiresAt: string | null
  views: number
  dismisses: number
}

const EMPTY_DRAFT = { title: '', body: '', tone: 'celebrate' as Tone, expires: '' }

/**
 * THE WORKSPACE'S ANNOUNCEMENTS — the banner pinned across it — composed,
 * paused, deleted and listed in full, for whoever holds `announcement.manage`:
 * an admin's by default, and a custom role's where one grants it. Settings
 * offers it as the Announcements tab (`TAB_KEYS`), and the platform console
 * renders it for the workspace its picker chose.
 *
 * Every route here asks that key, and so does the panel: a reader without it
 * is told so, not shown a form the API refuses
 * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`). The
 * live banner itself stays every member's, on the workspace home.
 */
export function AnnouncementsPanel({ workspaceId, heading = true }: { workspaceId: string; heading?: boolean }) {
  const { t, tCount, locale } = useTranslation()
  const qc = useQueryClient()
  const { isAdmin } = useWorkspaceRole(workspaceId)
  const held = usePermissions(workspaceId).can('announcement.manage')
  const mayManage = isAdmin || held === true

  const announcementsQuery = useQuery({
    queryKey: ['admin-announcements', workspaceId],
    enabled: mayManage && workspaceId.length > 0,
    queryFn: () => api<Announcement[]>(`/workspaces/${workspaceId}/announcements`),
  })
  const items = announcementsQuery.data ?? []
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  // The managing list and the live banner (the home page, What's new) both change.
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['admin-announcements', workspaceId] }),
      qc.invalidateQueries({ queryKey: ['workspace-announcements', workspaceId] }),
    ])
  }
  const failed = (fallback: Parameters<typeof t>[0]) => (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : t(fallback))

  const createAnnouncement = useMutation({
    // Publish makes it live; Save draft makes it paused — listed here, shown to nobody.
    mutationFn: ({ isActive }: { isActive: boolean }) =>
      api(`/workspaces/${workspaceId}/announcements`, {
        method: 'POST',
        body: {
          title: draft.title.trim(),
          body: draft.body,
          tone: draft.tone,
          expiresAt: draft.expires || null,
          isActive,
        },
      }),
    onSuccess: async () => {
      setDraft(EMPTY_DRAFT)
      await refresh()
    },
    onError: failed('adminAnnouncements.publishFailed'),
  })
  const updateAnnouncement = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ isActive: boolean }> }) =>
      api(`/workspaces/${workspaceId}/announcements/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: refresh,
    onError: failed('adminAnnouncements.updateFailed'),
  })
  const deleteAnnouncement = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: failed('adminAnnouncements.deleteFailed'),
  })

  function save(isActive: boolean) {
    if (!draft.title.trim() || createAnnouncement.isPending) return
    createAnnouncement.mutate({ isActive })
  }

  // Stored as the picked day's UTC midnight, so it is read back in UTC: the day that was picked.
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const now = Date.now()

  const header = heading ? (
    <div>
      <h2 className="text-lg font-semibold">{t('settings.tabAnnouncements')}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{t('adminAnnouncements.subtitle')}</p>
    </div>
  ) : null

  if (!mayManage) {
    return (
      <div className="space-y-4">
        {header}
        {held === null ? (
          // A wait is a shape, not the word: `loading-states` forbids the string.
          <InlineSkeleton />
        ) : (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300"
            data-testid="announcements-key-only"
          >
            {t('adminAnnouncements.keyOnly')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Compose */}
      <Card variant="glass" className="p-5 space-y-4">
        <h2 className="font-display text-lg font-semibold">{t('adminAnnouncements.newAnnouncement')}</h2>
        <div className="space-y-2">
          <Label htmlFor="announcement-title">{t('adminAnnouncements.titleLabel')}</Label>
          <Input
            id="announcement-title"
            value={draft.title}
            maxLength={200}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t('adminAnnouncements.titlePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="announcement-body">{t('adminAnnouncements.bodyLabel')}</Label>
          <Textarea
            id="announcement-body"
            rows={2}
            value={draft.body}
            maxLength={2000}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder={t('adminAnnouncements.bodyPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('adminAnnouncements.toneLabel')}</Label>
            <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-md p-1">
              {TONE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.tone === option.value}
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
            <Label htmlFor="announcement-expires">{t('adminAnnouncements.expiresLabel')}</Label>
            <Input
              id="announcement-expires"
              type="date"
              value={draft.expires}
              onChange={(e) => setDraft({ ...draft, expires: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            title={t('adminAnnouncements.saveDraftHint')}
            onClick={() => save(false)}
            disabled={!draft.title.trim() || createAnnouncement.isPending}
            data-testid="announcement-save-draft"
          >
            {t('adminAnnouncements.saveDraft')}
          </Button>
          <Button
            variant="gradient"
            onClick={() => save(true)}
            disabled={!draft.title.trim() || createAnnouncement.isPending}
          >
            <Plus className="h-3.5 w-3.5" /> {t('adminAnnouncements.publish')}
          </Button>
        </div>
      </Card>

      {/* List: live and paused alike, with each one's views and dismissals. */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          {t('adminAnnouncements.allAnnouncements')}
        </h2>
        {announcementsQuery.isError ? (
          <div className="text-sm text-destructive" role="alert">{t('adminAnnouncements.loadFailed')}</div>
        ) : announcementsQuery.isLoading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground" data-testid="announcements-empty">{t('adminAnnouncements.empty')}</div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const expired = item.expiresAt !== null && new Date(item.expiresAt).getTime() <= now
              return (
                <Card key={item.id} variant="glass" className="p-4" data-testid="announcement-row">
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium break-words">{item.title}</span>
                        {!item.isActive ? (
                          <Badge variant="soft" className="text-[9px] uppercase">
                            <Pause className="h-2.5 w-2.5" /> {t('adminAnnouncements.statusPaused')}
                          </Badge>
                        ) : expired ? (
                          <Badge variant="soft" className="text-[9px] uppercase">{t('adminAnnouncements.statusExpired')}</Badge>
                        ) : (
                          <Badge variant="success" className="text-[9px] uppercase">{t('adminAnnouncements.statusLive')}</Badge>
                        )}
                      </div>
                      {item.body && <p className="text-xs text-muted-foreground mt-0.5">{item.body}</p>}
                      <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-3 flex-wrap">
                        <span>
                          {item.expiresAt
                            ? t('adminAnnouncements.expiresOn', { date: fmt(item.expiresAt) })
                            : t('adminAnnouncements.noExpiry')}
                        </span>
                        <span>· {tCount('adminAnnouncements.viewsCount', item.views)}</span>
                        <span>· {tCount('adminAnnouncements.dismissesCount', item.dismisses)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={item.isActive}
                        aria-label={t('adminAnnouncements.statusLive')}
                        disabled={updateAnnouncement.isPending && updateAnnouncement.variables?.id === item.id}
                        onCheckedChange={(v) =>
                          updateAnnouncement.mutate({ id: item.id, patch: { isActive: v } })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                        disabled={deleteAnnouncement.isPending && deleteAnnouncement.variables === item.id}
                        onClick={() => deleteAnnouncement.mutate(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
