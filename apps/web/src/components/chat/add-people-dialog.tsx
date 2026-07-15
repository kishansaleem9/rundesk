import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, cn } from '@rundesk/ui'
import { Check, UserPlus } from 'lucide-react'
import { api } from '../../lib/api'
import { initials } from './chat-utils'
import { useTranslation } from '../../lib/i18n'

type WsMember = { userId: string; displayName: string; email: string }
type ChannelMember = { userId: string }

export function AddPeopleDialog({
  channelId,
  workspaceId,
  channelName,
  open,
  onOpenChange,
}: {
  channelId: string
  workspaceId: string
  channelName?: string
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const membersQ = useQuery({
    queryKey: ['channel-members', channelId],
    queryFn: () => api<ChannelMember[]>(`/chat/channels/${channelId}/members`),
    enabled: open,
  })
  const wsQ = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WsMember[]>(`/workspaces/${workspaceId}/members`),
    enabled: open,
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const memberIds = new Set((membersQ.data ?? []).map((m) => m.userId))
  const candidates = (wsQ.data ?? []).filter((w) => !memberIds.has(w.userId))

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const add = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await api(`/chat/channels/${channelId}/members`, { method: 'POST', body: { userIds: [...selected] } })
      setSelected(new Set())
      await qc.invalidateQueries({ queryKey: ['channel-members', channelId] })
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      onOpenChange(false)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('chat.couldNotAddPeople'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{channelName ? t('chat.addPeopleTo', { channel: channelName }) : t('chat.addPeople')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {wsQ.isLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t('chat.loadingTeammates')}</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('chat.everyoneHere')}</p>
          ) : (
            candidates.map((c) => {
              const on = selected.has(c.userId)
              return (
                <button
                  key={c.userId}
                  type="button"
                  onClick={() => toggle(c.userId)}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left',
                    on ? 'bg-violet-500/10' : 'hover:bg-accent/10',
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                    {initials(c.displayName || c.email)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {c.displayName || c.email}
                  </span>
                  <span
                    className={cn(
                      'h-4 w-4 rounded border flex items-center justify-center',
                      on ? 'bg-violet-600 border-violet-600 text-white' : 'border-border',
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={add} disabled={busy || selected.size === 0}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            {t('chat.add')}{selected.size > 0 ? ` ${selected.size}` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
