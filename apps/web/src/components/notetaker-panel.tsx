import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Loader2 } from 'lucide-react'
import { Button, Input, cn, toast } from '@rundesk/ui'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type NotetakerStatus = 'scheduled' | 'joining' | 'waiting' | 'recording' | 'processing' | 'writing' | 'done' | 'failed' | 'cancelled'
type NotetakerRun = {
  id: string
  meetingUrl: string
  platform: 'zoom' | 'google_meet' | 'teams'
  title: string | null
  joinAt: string | null
  status: NotetakerStatus
  statusDetail: string | null
  meetingId: string | null
  calendarAccountId: string | null
  createdAt: string
}
type NotetakerOverview = {
  configured: boolean
  calendars: Array<{ id: string; provider: string; email: string | null; joins: boolean; status: string }>
  runs: NotetakerRun[]
}

/** Still under way: asked after again while any is. */
const UNDER_WAY: NotetakerStatus[] = ['scheduled', 'joining', 'waiting', 'recording', 'processing', 'writing']
/** What a person may call back. */
const CALLABLE: NotetakerStatus[] = ['scheduled', 'joining', 'waiting', 'recording']
const PLATFORM: Record<NotetakerRun['platform'], string> = { zoom: 'Zoom', google_meet: 'Google Meet', teams: 'Microsoft Teams' }

/**
 * THE AI NOTETAKER (`commit-log/log-39863ff-1`), on the Meetings page where its
 * notes land.
 *
 * ClickUp's: "Send AI Notetaker" to any Zoom, Google Meet or Teams meeting by
 * pasting its link, and "Join all meetings for" the calendars it should join
 * when their meetings begin; afterwards the notes are kept and the Inbox says
 * so (its help centre, through search excerpts). Each visit is listed with
 * where it stands, called back while it can be, and opens its notes once
 * written. Where the server has no meeting-bot key the panel says so.
 */
export function NotetakerPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [link, setLink] = useState('')
  const key = ['notetaker', workspaceId]
  const overview = useQuery({
    queryKey: key,
    queryFn: () => api<NotetakerOverview>(`/workspaces/${workspaceId}/notetaker`),
    refetchInterval: (q) => ((q.state.data as NotetakerOverview | undefined)?.runs ?? []).some((r) => UNDER_WAY.includes(r.status)) ? 5_000 : false,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  /*
   * A visit whose notes were just written made a meeting this page's list has
   * not read: read it again, so "Open notes" lands on a row that is there.
   */
  const written = (overview.data?.runs ?? []).filter((r) => r.status === 'done' && r.meetingId).map((r) => r.meetingId).join(',')
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (seen.current !== null && seen.current !== written) void qc.invalidateQueries({ queryKey: ['meetings', workspaceId] })
    seen.current = written
  }, [written, qc, workspaceId])
  const send = useMutation({
    mutationFn: (meetingUrl: string) => api<NotetakerRun>(`/workspaces/${workspaceId}/notetaker/runs`, { method: 'POST', body: { meetingUrl } }),
    onSuccess: async () => {
      setLink('')
      toast.success(t('notetaker.sent'))
      await refresh()
    },
    onError: (e: Error) => toast.error(e.message || t('notetaker.couldNotSend')),
  })
  const cancel = useMutation({
    mutationFn: (runId: string) => api(`/workspaces/${workspaceId}/notetaker/runs/${runId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || t('notetaker.couldNotCancel')),
  })
  const joins = useMutation({
    mutationFn: ({ accountId, on }: { accountId: string; on: boolean }) =>
      api(`/workspaces/${workspaceId}/notetaker/calendars/${accountId}`, { method: 'PATCH', body: { joins: on } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || t('notetaker.couldNotSave')),
  })

  const data = overview.data
  const state = overview.isLoading ? 'loading' : overview.isError ? 'failed' : data?.configured ? 'ready' : 'unset'
  return (
    <section className="rounded-xl border border-border/70 p-4 space-y-3" data-testid="notetaker" data-state={state}>
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">{t('notetaker.title')}</h2>
      </div>
      {state === 'loading' ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.loading')}</p>
      ) : state === 'failed' ? (
        <p className="text-xs text-destructive" data-testid="notetaker-failed">{t('notetaker.loadFailed')}</p>
      ) : state === 'unset' ? (
        <p className="text-xs text-muted-foreground" data-testid="notetaker-not-set-up">{t('notetaker.notSetUp')}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('notetaker.subtitle')}</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (link.trim()) send.mutate(link.trim())
            }}
          >
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t('notetaker.linkPlaceholder')}
              className="h-8"
              data-testid="notetaker-link"
            />
            <Button type="submit" size="sm" disabled={!link.trim() || send.isPending} data-testid="notetaker-send">
              {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('notetaker.send')}
            </Button>
          </form>

          <div className="space-y-1.5" data-testid="notetaker-calendars">
            <p className="text-xs font-medium">{t('notetaker.joinAllFor')}</p>
            {(data?.calendars ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="notetaker-no-calendar">
                {t('notetaker.noCalendar')}{' '}
                <Link to="/app/$workspaceId/calendar" params={{ workspaceId }} search={{ settings: 'accounts' }} className="underline">
                  {t('notetaker.connectCalendar')}
                </Link>
              </p>
            ) : (
              (data?.calendars ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={c.joins}
                    disabled={joins.isPending || c.status !== 'connected'}
                    onChange={(e) => joins.mutate({ accountId: c.id, on: e.target.checked })}
                    data-testid={`notetaker-calendar-${c.id}`}
                  />
                  <span>{c.email ?? c.provider}</span>
                </label>
              ))
            )}
          </div>

          <ul className="space-y-1.5" data-testid="notetaker-runs">
            {(data?.runs ?? []).length === 0 && <li className="text-xs text-muted-foreground">{t('notetaker.noRuns')}</li>}
            {(data?.runs ?? []).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                data-testid={`notetaker-run-${r.id}`}
                data-status={r.status}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{r.title || PLATFORM[r.platform]}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    <span data-testid={`notetaker-status-${r.id}`} className={cn(r.status === 'failed' && 'text-destructive')}>
                      {t(`notetaker.status.${r.status === 'writing' ? 'processing' : r.status}` as TranslationKey)}
                    </span>
                    {r.joinAt && r.status === 'scheduled' && ` · ${new Date(r.joinAt).toLocaleString()}`}
                    {r.status === 'failed' && r.statusDetail && ` · ${r.statusDetail}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.status === 'done' && r.meetingId && (
                    <Link
                      to="/app/$workspaceId/meetings"
                      params={{ workspaceId }}
                      search={{ meeting: r.meetingId }}
                      className="text-xs underline"
                      data-testid={`notetaker-notes-${r.id}`}
                    >
                      {t('notetaker.openNotes')}
                    </Link>
                  )}
                  {CALLABLE.includes(r.status) && (
                    <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)} data-testid={`notetaker-cancel-${r.id}`}>
                      {t('notetaker.cancel')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
