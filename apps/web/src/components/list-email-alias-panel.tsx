import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@rundesk/ui'
import { Check, Copy, Mail, RefreshCcw, Trash2, Webhook } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type Alias = {
  id: string
  listId: string
  localPart: string
  address: string
  defaultPriority: string
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

/**
 * Per-list inbound email panel. Lets the list owner mint, copy, rotate, or
 * revoke the address that turns inbound emails into tasks.
 */
export function ListEmailAliasPanel({
  listId,
  open,
  onOpenChange,
}: {
  listId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: alias, refetch } = useQuery({
    queryKey: ['list-email-alias', listId],
    queryFn: () => api<Alias | null>(`/lists/${listId}/inbound-email`),
    enabled: open,
  })

  const ensure = useMutation({
    mutationFn: () => api<Alias>(`/lists/${listId}/inbound-email`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-email-alias', listId] }),
  })

  const rotate = useMutation({
    mutationFn: () => api<Alias>(`/lists/${listId}/inbound-email/rotate`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-email-alias', listId] }),
  })

  const revoke = useMutation({
    mutationFn: () => api(`/lists/${listId}/inbound-email`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-email-alias', listId] }),
  })

  const { data: webhooks = [] } = useQuery({
    queryKey: ['list-inbound-webhooks', listId],
    queryFn: () => api<Array<{ id: string; name: string; token: string }>>(`/lists/${listId}/inbound-webhooks`),
    enabled: open,
  })
  const createWebhook = useMutation({
    mutationFn: () => api(`/lists/${listId}/inbound-webhooks`, { method: 'POST', body: { name: 'Inbound webhook' } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-inbound-webhooks', listId] }),
  })
  const deleteWebhook = useMutation({
    mutationFn: (id: string) => api(`/lists/${listId}/inbound-webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['list-inbound-webhooks', listId] }),
  })
  const webhookUrl = (token: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/inbound/webhook/${token}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient text-white shadow-sm">
              <Mail className="h-3.5 w-3.5" />
            </span>
            {t('listEmailAlias.title')}
          </DialogTitle>
          <DialogDescription>
            {t('listEmailAlias.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {alias ? (
            <AliasRow
              address={alias.address}
              onRotate={() => rotate.mutate()}
              onRevoke={() => revoke.mutate()}
              rotating={rotate.isPending}
              revoking={revoke.isPending}
            />
          ) : (
            <div className="rounded-md border border-dashed border-border/70 p-4 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">{t('listEmailAlias.noAddress')}</span>
              <Button size="sm" onClick={() => ensure.mutate()} disabled={ensure.isPending}>
                {ensure.isPending ? t('listEmailAlias.minting') : t('listEmailAlias.generateAddress')}
              </Button>
            </div>
          )}

          {alias && (
            <div className="rounded-md border border-border/50 bg-card/40 p-3 text-xs text-muted-foreground space-y-1">
              <div>
                {t('listEmailAlias.defaultPriority')} <span className="font-medium text-foreground">{alias.defaultPriority}</span>
              </div>
              {alias.lastUsedAt && (
                <div>
                  {t('listEmailAlias.lastReceived')} <span className="font-medium text-foreground">{new Date(alias.lastUsedAt).toLocaleString()}</span>
                </div>
              )}
              <div className="pt-1">
                {t('listEmailAlias.instructionsPrefix')}
                <code className="font-mono">list-…+task-&lt;id&gt;@</code>
                {t('listEmailAlias.instructionsSuffix')}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-border/60 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Webhook className="h-3.5 w-3.5" /> {t('listEmailAlias.inboundWebhook')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('listEmailAlias.webhookDescPrefix')}<code className="font-mono">{'{ title, description?, priority?, dueDate? }'}</code>{t('listEmailAlias.webhookDescSuffix')}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => createWebhook.mutate()} disabled={createWebhook.isPending}>
              {createWebhook.isPending ? t('listEmailAlias.creating') : t('listEmailAlias.newWebhook')}
            </Button>
          </div>
          {webhooks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              {t('listEmailAlias.noWebhooks')}
            </div>
          ) : (
            webhooks.map((w) => <WebhookRow key={w.id} url={webhookUrl(w.token)} onDelete={() => deleteWebhook.mutate(w.id)} />)
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void refetch()}>{t('listEmailAlias.refresh')}</Button>
          <Button onClick={() => onOpenChange(false)}>{t('listEmailAlias.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WebhookRow({ url, onDelete }: { url: string; onDelete: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-8 text-xs font-mono" />
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
        {copied ? t('listEmailAlias.copied') : t('listEmailAlias.copy')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-rose-600 hover:text-rose-700"
        onClick={onDelete}
        title={t('listEmailAlias.deleteWebhookTitle')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function AliasRow({
  address,
  onRotate,
  onRevoke,
  rotating,
  revoking,
}: {
  address: string
  onRotate: () => void
  onRevoke: () => void
  rotating: boolean
  revoking: boolean
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable; the input is already pre-selected
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={address}
        onFocus={(e) => e.currentTarget.select()}
        className="h-8 text-xs font-mono"
      />
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
        {copied ? t('listEmailAlias.copied') : t('listEmailAlias.copy')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={onRotate}
        disabled={rotating}
        title={t('listEmailAlias.rotateTitle')}
      >
        <RefreshCcw className={cn('h-3.5 w-3.5', rotating && 'animate-spin')} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-rose-600 hover:text-rose-700"
        onClick={onRevoke}
        disabled={revoking}
        title={t('listEmailAlias.revokeTitle')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
