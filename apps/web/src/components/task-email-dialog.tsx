/**
 * §V2-08 — "Send email to task", frame `15:32`.
 *
 * THIS IS NOT A NEW FEATURE. `email-to-task` has routed
 * `list-<localPart>+task-<id>@<domain>` to a comment on that task since the
 * module was written — `parseRecipient` handles the `+task-` tag and the
 * inbound path files the mail as a comment. What was missing was any way for a
 * person to learn the address existed. That is the "built but never joined up"
 * shape this audit keeps finding, and the fix is a dialog, not a subsystem.
 *
 * THE ADDRESS COMES FROM THE SERVER, ASSEMBLED THERE. The pieces are all in the
 * list's alias response and it would be three lines to splice `+task-<id>` in
 * here — but the prefix, the tag and the domain are the email module's
 * protocol. A client that assembles them itself is a second place the format
 * lives, and when it drifts the symptom is mail quietly going nowhere.
 *
 * WHEN THE LIST HAS NO ALIAS it says so and says where to make one, rather than
 * showing a plausible address that bounces. A dialog offering an address that
 * silently fails is worse than one that admits the feature is off.
 */

import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  toast,
} from '@rundesk/ui'
import { Copy, Mail } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

export function TaskEmailDialog({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  const query = useQuery({
    enabled: open,
    queryKey: ['task', taskId, 'email-address'],
    queryFn: () => api<{ address: string | null; listId: string | null }>(`/tasks/${taskId}/email-address`),
  })

  const address = query.data?.address ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="task-email-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {t('taskEmail.title')}
          </DialogTitle>
        </DialogHeader>

        {query.isPending ? (
          /* §2.9a — the shape of the address that is coming, not the word. */
          <div className="h-9 rounded border border-border bg-muted/30 animate-pulse" aria-busy="true" aria-live="polite" />
        ) : address ? (
          <>
            <p className="text-sm text-muted-foreground">{t('taskEmail.hint')}</p>
            <div className="mt-2 flex items-center gap-2">
              <code
                data-testid="task-email-address"
                className="min-w-0 flex-1 truncate rounded border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs"
              >
                {address}
              </code>
              <Button
                size="sm"
                variant="outline"
                data-testid="task-email-copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(address)
                    .then(() => toast.success(t('taskEmail.copied')))
                    .catch(() => toast.error(t('taskDetail.copyFailed')))
                }}
              >
                <Copy className="mr-1 h-3 w-3" />
                {t('common.copy')}
              </Button>
            </div>
          </>
        ) : (
          <div data-testid="task-email-unavailable" className="py-4">
            <p className="text-sm text-muted-foreground">{t('taskEmail.noAlias')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('taskEmail.noAliasHint')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
