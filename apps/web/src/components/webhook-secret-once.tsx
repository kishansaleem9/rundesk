import { useState } from 'react'
import { Button } from '@rundesk/ui'
import { Check, Copy, KeyRound } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

/**
 * A WEBHOOK'S SIGNING SECRET, SHOWN THE ONE TIME THE SERVER GIVES IT OUT.
 *
 * The list and an edit answer without the secret — any member used to be able
 * to read every one — so the answer that creates a webhook is the only place it
 * exists outside the database. Both pages that make webhooks dropped that
 * answer, which made a secret nobody could ever read and a receiver that could
 * never check a signature. An edit cannot set one (`UpdateWebhookDto` has no
 * `secret`), so to replace a secret, delete the webhook and make it again.
 */
export function WebhookSecretOnce({ name, secret, onDone }: { name: string; secret: string; onDone: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard blocked — the secret is selectable for a manual copy. */
    }
  }
  return (
    <div data-testid="webhook-secret-once" role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 shrink-0 text-amber-600" />
        {t('webhooks.secretOnceTitle', { name })}
      </div>
      <p className="text-xs text-muted-foreground">{t('webhooks.secretOnceBody')}</p>
      <div className="flex items-center gap-2">
        <code data-testid="webhook-secret-value" className="flex-1 select-all break-all rounded bg-muted px-2 py-1.5 text-xs font-mono">
          {secret}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0">
          {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
          {copied ? t('webhooks.copied') : t('common.copy')}
        </Button>
      </div>
      <Button type="button" size="sm" data-testid="webhook-secret-done" onClick={onDone}>
        {t('webhooks.secretOnceDone')}
      </Button>
    </div>
  )
}
