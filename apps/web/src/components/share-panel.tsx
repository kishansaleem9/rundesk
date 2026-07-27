import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
  toast,
} from '@rundesk/ui'
import { UserPlus, X, Mail, Lock } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

/** Every object a share can be attached to. */
export type ShareObjectType = 'space' | 'folder' | 'project' | 'list' | 'task' | 'doc' | 'channel'
type ShareLevel = 'view' | 'comment' | 'edit' | 'admin'

type ShareRow = {
  id: string
  level: ShareLevel
  user: { id: string; name: string; email: string; avatarUrl: string | null } | null
  invitedEmail: string | null
  createdAt: string
}
type ShareResponse = { items: ShareRow[]; myLevel: ShareLevel | null; canShare: boolean; levels: ShareLevel[] }

// Weakest → strongest, matching ClickUp: view < comment < edit < full edit.
// `admin` is ClickUp's "Full edit" — the only level that may delete the item.
const LEVELS: { value: ShareLevel; labelKey: TranslationKey; hintKey: TranslationKey }[] = [
  { value: 'view', labelKey: 'share.levelView', hintKey: 'share.levelViewHint' },
  { value: 'comment', labelKey: 'share.levelComment', hintKey: 'share.levelCommentHint' },
  { value: 'edit', labelKey: 'share.levelEdit', hintKey: 'share.levelEditHint' },
  { value: 'admin', labelKey: 'share.levelFull', hintKey: 'share.levelFullHint' },
]

const TITLE_KEY: Record<ShareObjectType, TranslationKey> = {
  space: 'share.titleSpace',
  folder: 'share.titleFolder',
  project: 'share.titleProject',
  list: 'share.titleList',
  task: 'share.titleTask',
  doc: 'share.titleDoc',
  channel: 'share.titleChannel',
}

export function SharePanel({
  open,
  onOpenChange,
  objectType,
  objectId,
  objectName,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  objectType: ShareObjectType
  objectId: string
  objectName?: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [invite, setInvite] = useState('')
  const [level, setLevel] = useState<ShareLevel>('view')

  useEffect(() => {
    if (open) { setInvite(''); setLevel('view') }
  }, [open])

  const key = ['shares', objectType, objectId] as const
  const sharesQuery = useQuery({
    queryKey: key,
    queryFn: () => api<ShareResponse>(`/shares/${objectType}/${objectId}`),
    enabled: open,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const failed = (e: unknown, fb: TranslationKey) => toast.error(e instanceof ApiError ? e.message : t(fb))

  // One field accepts either a workspace member's email or an outsider's — the
  // server binds a known address to that user and keeps the rest as a pending
  // invite, so there is no separate "invite a guest" flow.
  const share = useMutation({
    mutationFn: () => api(`/shares/${objectType}/${objectId}`, { method: 'POST', body: { email: invite.trim(), level } }),
    onSuccess: () => { toast.success(t('share.shared')); setInvite(''); refresh() },
    onError: (e) => failed(e, 'share.shareFailed'),
  })
  const changeLevel = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ShareLevel }) =>
      api(`/shares/${objectType}/${objectId}/${id}`, { method: 'PATCH', body: { level: next } }),
    onSuccess: () => { toast.success(t('share.levelUpdated')); refresh() },
    onError: (e) => failed(e, 'share.shareFailed'),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/shares/${objectType}/${objectId}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success(t('share.revoked')); refresh() },
    onError: (e) => failed(e, 'share.shareFailed'),
  })

  const data = sharesQuery.data
  const canShare = data?.canShare ?? false
  const items = data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(TITLE_KEY[objectType], { name: objectName ?? '' })}</DialogTitle>
        </DialogHeader>

        {!canShare && !sharesQuery.isLoading && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{t('share.readOnlyNotice')}</span>
          </div>
        )}

        {canShare && (
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (invite.trim()) share.mutate() }}
          >
            <Input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder={t('share.invitePlaceholder')}
              className="h-9 flex-1"
              type="email"
            />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as ShareLevel)}
              aria-label={t('share.levelLabel')}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
              ))}
            </select>
            <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!invite.trim() || share.isPending}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              {share.isPending ? t('share.sharing') : t('share.shareAction')}
            </Button>
          </form>
        )}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {t('share.sharedWith')}
          </p>
          {sharesQuery.isLoading ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">{t('common.loading')}</p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">{t('share.noneYet')}</p>
          ) : (
            <ul className="divide-y divide-border/60 max-h-[280px] overflow-y-auto">
              {items.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
                      {!s.user && <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      {s.user?.name || s.invitedEmail}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.user ? s.user.email : t('share.pendingInvite')}
                    </div>
                  </div>
                  <select
                    value={s.level}
                    disabled={!canShare || changeLevel.isPending}
                    aria-label={t('share.levelFor', { name: s.user?.name || s.invitedEmail || '' })}
                    onChange={(e) => changeLevel.mutate({ id: s.id, next: e.target.value as ShareLevel })}
                    className={cn(
                      'h-8 rounded-md border border-border bg-background px-1.5 text-[12px] shrink-0',
                      !canShare && 'opacity-60',
                    )}
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
                    ))}
                  </select>
                  {canShare && (
                    <button
                      type="button"
                      aria-label={t('share.removeAccess')}
                      title={t('share.removeAccess')}
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(s.id)}
                      className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* What each level actually means — the client asked for the levels to be
            explained the way ClickUp's permissions article does. */}
        <div className="rounded-md border border-border/70 bg-card/40 px-3 py-2 space-y-0.5">
          {LEVELS.map((l) => (
            <p key={l.value} className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{t(l.labelKey)}</span> — {t(l.hintKey)}
            </p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
