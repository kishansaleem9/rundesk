/**
 * §V2-08 — "Description history", frame `15:32`.
 *
 * `[15:27]` "yahan par aap ko HISTORY wagera sab cheezein show hoti hain."
 *
 * WHAT A ROW MEANS, and why it is worded the way it is. Each entry is what the
 * description said UNTIL that moment — not what it became. Labelling them "X
 * edited this" would be a lie in the direction that matters: the row shows the
 * text that person REPLACED, not the text they wrote. So the heading says
 * "Until <when>", and names the editor separately.
 *
 * RESTORING IS AN EDIT, NOT A REWIND. Putting an old description back goes
 * through the ordinary update path, so it records what the description said
 * beforehand and can itself be undone. That is why there is no confirmation
 * step here: nothing is destroyed by pressing it.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  cn,
  toast,
} from '@rundesk/ui'
import { History, RotateCcw } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type Revision = {
  id: string
  description: string | null
  replacedAt: string
  editor?: { id: string; displayName?: string | null; email?: string | null } | null
}

export function TaskDescriptionHistoryDialog({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)

  const query = useQuery({
    enabled: open,
    queryKey: ['task', taskId, 'description-history'],
    queryFn: () => api<Revision[]>(`/tasks/${taskId}/description-history`),
  })

  const restore = useMutation({
    mutationFn: (revisionId: string) =>
      api(`/tasks/${taskId}/description-history/${revisionId}/restore`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('descriptionHistory.restored'))
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'description-history'] })
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('descriptionHistory.restoreFailed'))
    },
  })

  const revisions = query.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="description-history-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('descriptionHistory.title')}
          </DialogTitle>
        </DialogHeader>

        {query.isPending ? (
          /*
           * §2.9a — a wait is drawn as the SHAPE of what is coming, never as
           * the word "Loading". `loading-states` enforces that and caught this
           * file: "Loading…" tells a person nothing about whether anything is
           * on its way; three stacked rows tell them a list is.
           */
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-md border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : revisions.length === 0 ? (
          /*
           * An empty history is the normal state for a task nobody has edited,
           * so it says that rather than reading as a failure. It also says WHEN
           * entries appear, because "no history" on a task with a long
           * description otherwise looks like the feature is broken — the
           * description was written before anything was ever replaced.
           */
          <div data-testid="description-history-empty" className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{t('descriptionHistory.empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('descriptionHistory.emptyHint')}</p>
          </div>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-auto">
            {revisions.map((rev) => {
              const isOpen = expanded === rev.id
              const who = rev.editor?.displayName || rev.editor?.email || t('descriptionHistory.someone')
              return (
                <li
                  key={rev.id}
                  data-testid="description-revision"
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium">
                        {t('descriptionHistory.until', { when: new Date(rev.replacedAt).toLocaleString() })}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t('descriptionHistory.replacedBy', { name: who })}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="description-revision-toggle"
                        onClick={() => setExpanded(isOpen ? null : rev.id)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {isOpen ? t('descriptionHistory.hide') : t('descriptionHistory.show')}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="description-revision-restore"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(rev.id)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        {t('descriptionHistory.restore')}
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <pre
                      data-testid="description-revision-body"
                      className={cn(
                        'mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs',
                        // An emptied description is a real state and has to look
                        // different from a revision that failed to load.
                        !rev.description && 'italic text-muted-foreground',
                      )}
                    >
                      {rev.description || t('descriptionHistory.wasEmpty')}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
