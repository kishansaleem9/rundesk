import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  cn,
  toast,
} from '@rundesk/ui'
import { ChevronLeft, ChevronRight, Globe, History, Presentation, Trash2, Wand2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton, PanelSkeleton } from './loading-skeletons'

/**
 * WHAT BRAIN MAKES, AS CLICKUP'S ARTIFACTS (`ledger-rows/row-853`, frame `16:50`):
 * asked for an overview, Brain answers with prose and an embedded deck — "I made
 * you a quick overview. 4 slides." — and `16:55` pages through it as slides.
 * The card sits under the answer; the deck opens over the page, is changed by
 * asking again (the whole deck, as ClickUp does it), goes back to an earlier
 * version, is published to a link anybody may open, and is deleted.
 */
export type DeckSlide = { title: string; bullets: string[]; notes?: string }
export type MadeArtifact = { id: string; kind: 'deck'; title: string; slideCount: number }
type ArtifactDetail = {
  id: string
  kind: 'deck'
  title: string
  version: number
  slides: DeckSlide[]
  versions: Array<{ version: number; title: string; slideCount: number; prompt: string; restoredFrom: number | null; createdAt: string }>
  published: { token: string; at: string } | null
}
export type ArtifactRow = { id: string; kind: 'deck'; title: string; slideCount: number; version: number; published: boolean; updatedAt: string }

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))

/** One slide, drawn the same on the page that asked for it and on the published link. */
export function DeckSlideView({ slide, index, total }: { slide: DeckSlide; index: number; total: number }) {
  return (
    <div
      data-testid="deck-slide"
      data-index={index}
      className="aspect-video w-full rounded-lg border border-border bg-gradient-to-br from-violet-50 to-white p-8 shadow-sm dark:from-violet-950/40 dark:to-background flex flex-col"
    >
      <h2 data-testid="deck-slide-title" className="text-2xl font-semibold text-foreground">
        {slide.title}
      </h2>
      <ul className="mt-5 space-y-2 text-base text-foreground/90 list-disc pl-6">
        {slide.bullets.map((b, i) => (
          <li key={i} data-testid="deck-slide-point">
            {b}
          </li>
        ))}
      </ul>
      <div className="mt-auto text-right text-xs text-muted-foreground">
        {index + 1} / {total}
      </div>
    </div>
  )
}

/**
 * A deck paged through: the arrows and the counter, and ← / → on the keyboard.
 * The page resets to the first slide when the deck itself changes — a new
 * version is a new deck to read.
 */
export function DeckPager({ slides, resetKey }: { slides: DeckSlide[]; resetKey?: string | number }) {
  const { t } = useTranslation()
  const [at, setAt] = useState(0)
  useEffect(() => setAt(0), [resetKey])
  const total = slides.length
  const go = (step: number) => setAt((i) => Math.min(Math.max(i + step, 0), Math.max(total - 1, 0)))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])
  if (!total) return <div className="text-sm text-muted-foreground">{t('artifacts.noSlides')}</div>
  return (
    <div className="space-y-3" data-testid="deck-pager">
      <DeckSlideView slide={slides[Math.min(at, total - 1)]} index={Math.min(at, total - 1)} total={total} />
      <div className="flex items-center justify-center gap-3">
        <Button size="sm" variant="outline" data-testid="deck-prev" disabled={at === 0} onClick={() => go(-1)} aria-label={t('artifacts.previous')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span data-testid="deck-counter" className="text-sm tabular-nums text-muted-foreground">
          {Math.min(at, total - 1) + 1} / {total}
        </span>
        <Button size="sm" variant="outline" data-testid="deck-next" disabled={at >= total - 1} onClick={() => go(1)} aria-label={t('artifacts.next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/** The card under Brain's answer, as frame `16:50` draws it: what it made, how many slides, and the way in. */
export function ArtifactCard({ artifact, onOpen }: { artifact: MadeArtifact; onOpen: (id: string) => void }) {
  const { tCount } = useTranslation()
  return (
    <button
      type="button"
      data-testid="artifact-card"
      data-artifact-id={artifact.id}
      onClick={() => onOpen(artifact.id)}
      className="mt-2 flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left hover:border-violet-400 hover:bg-violet-50/60 dark:hover:bg-violet-950/30"
    >
      <span className="flex h-9 w-12 items-center justify-center rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        <Presentation className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span data-testid="artifact-card-title" className="block truncate text-sm font-medium text-foreground">
          {artifact.title}
        </span>
        <span data-testid="artifact-card-count" className="block text-xs text-muted-foreground">
          {tCount('artifacts.slideCount', artifact.slideCount)}
        </span>
      </span>
    </button>
  )
}

/** The deck, opened: its slides, and what ClickUp lets you do with an Artifact. */
export function DeckViewer({ artifactId, onClose }: { artifactId: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [ask, setAsk] = useState('')
  const query = useQuery({
    queryKey: ['ai-artifact', artifactId],
    queryFn: () => api<ArtifactDetail>(`/ai/artifacts/${artifactId}`),
    enabled: !!artifactId,
  })
  const deck = query.data
  const refresh = (next?: ArtifactDetail) => {
    if (next) qc.setQueryData(['ai-artifact', artifactId], next)
    void qc.invalidateQueries({ queryKey: ['ai-artifacts'] })
  }
  const revise = useMutation({
    mutationFn: (instruction: string) => api<ArtifactDetail>(`/ai/artifacts/${artifactId}/revise`, { method: 'POST', body: { instruction } }),
    onSuccess: (next) => {
      setAsk('')
      refresh(next)
    },
    onError: (err) => toast.error(errorText(err)),
  })
  const restore = useMutation({
    mutationFn: (version: number) => api<ArtifactDetail>(`/ai/artifacts/${artifactId}/restore`, { method: 'POST', body: { version } }),
    onSuccess: (next) => refresh(next),
    onError: (err) => toast.error(errorText(err)),
  })
  const publish = useMutation({
    mutationFn: (on: boolean) => api(`/ai/artifacts/${artifactId}/publish`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-artifact', artifactId] })
      void qc.invalidateQueries({ queryKey: ['ai-artifacts'] })
    },
    onError: (err) => toast.error(errorText(err)),
  })
  const remove = useMutation({
    mutationFn: () => api(`/ai/artifacts/${artifactId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-artifacts'] })
      onClose()
    },
    onError: (err) => toast.error(errorText(err)),
  })
  const link = deck?.published ? `${window.location.origin}/deck/${deck.published.token}` : ''

  return (
    <Dialog open={!!artifactId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl" data-testid="artifact-viewer" data-artifact-id={artifactId ?? ''}>
        <DialogTitle className="flex items-center gap-2 pr-8">
          <Presentation className="h-4 w-4 text-violet-600" />
          <span data-testid="artifact-viewer-title" className="truncate">
            {deck?.title ?? ''}
          </span>
          {deck && (
            <span data-testid="artifact-viewer-version" className="ml-1 text-xs font-normal text-muted-foreground">
              {t('artifacts.versionN', { n: deck.version })}
            </span>
          )}
        </DialogTitle>
        {query.isError ? (
          <div data-testid="artifact-viewer-error" className="text-sm text-destructive">
            {errorText(query.error)}
          </div>
        ) : !deck ? (
          <PanelSkeleton className="p-0" />
        ) : (
          <div className="space-y-4">
            <DeckPager slides={deck.slides} resetKey={deck.version} />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (ask.trim()) revise.mutate(ask.trim())
              }}
            >
              <Input
                data-testid="artifact-ask"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder={t('artifacts.askPlaceholder')}
                disabled={revise.isPending}
              />
              <Button type="submit" data-testid="artifact-ask-send" disabled={!ask.trim() || revise.isPending}>
                <Wand2 className="mr-1 h-4 w-4" />
                {revise.isPending ? t('artifacts.remaking') : t('artifacts.remake')}
              </Button>
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" data-testid="artifact-versions">
                    <History className="mr-1 h-4 w-4" />
                    {t('artifacts.versions', { count: deck.versions.length })}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuLabel>{t('artifacts.versionsTitle')}</DropdownMenuLabel>
                  {deck.versions.map((v) => (
                    <DropdownMenuItem
                      key={v.version}
                      data-testid="artifact-version"
                      data-version={v.version}
                      data-current={v.version === deck.version ? 'yes' : 'no'}
                      disabled={v.version === deck.version || restore.isPending}
                      onSelect={() => restore.mutate(v.version)}
                    >
                      <span className={cn('flex-1 truncate', v.version === deck.version && 'font-medium')}>
                        {t('artifacts.versionN', { n: v.version })} · {v.title}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {v.version === deck.version ? t('artifacts.shown') : t('artifacts.restore')}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {deck.published ? (
                <>
                  <Input data-testid="artifact-link" readOnly value={link} className="h-8 max-w-xs text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" data-testid="artifact-unpublish" disabled={publish.isPending} onClick={() => publish.mutate(false)}>
                    {t('artifacts.unpublish')}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" data-testid="artifact-publish" disabled={publish.isPending} onClick={() => publish.mutate(true)}>
                  <Globe className="mr-1 h-4 w-4" />
                  {t('artifacts.publish')}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                data-testid="artifact-delete"
                className="ml-auto text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t('artifacts.deleteConfirm'))) remove.mutate()
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {t('artifacts.delete')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The asker's own decks, newest first — ClickUp's Artifacts list, beside Brain's chats. */
export function ArtifactsList({ workspaceId, onOpen }: { workspaceId: string; onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['ai-artifacts', workspaceId],
    queryFn: () => api<ArtifactRow[]>(`/ai/artifacts?workspaceId=${workspaceId}`),
  })
  const rows = query.data ?? []
  return (
    <div data-testid="ai-artifacts" className="space-y-1">
      <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('artifacts.navTitle')}</div>
      {query.isPending ? (
        <div className="px-2 text-xs">
          <InlineSkeleton />
        </div>
      ) : query.isError ? (
        <div data-testid="ai-artifacts-error" className="px-2 text-xs text-destructive">
          {errorText(query.error)}
        </div>
      ) : rows.length === 0 ? (
        <div data-testid="ai-artifacts-empty" className="px-2 text-xs text-muted-foreground">
          {t('artifacts.none')}
        </div>
      ) : (
        rows.map((a) => (
          <button
            key={a.id}
            type="button"
            data-testid="ai-artifact-row"
            data-artifact-id={a.id}
            onClick={() => onOpen(a.id)}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
          >
            <Presentation className="h-3.5 w-3.5 shrink-0 text-violet-600" />
            <span className="truncate">{a.title}</span>
            {a.published && <Globe className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('artifacts.publishedMark')} />}
          </button>
        ))
      )}
    </div>
  )
}
