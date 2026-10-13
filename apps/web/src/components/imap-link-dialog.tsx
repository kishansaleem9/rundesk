/**
 * CLICKUP'S "SIGN IN WITH IMAP" (`found-12-oct/task-email-imap-unbuilt`).
 *
 * A mailbox that is neither Gmail nor Outlook is linked by its address, its
 * password (an app password where its provider wants one), its IMAP and SMTP
 * servers and ports, and whether they require SSL — the fields of ClickUp's
 * form, Yahoo's servers its example. The server signs in to both before it
 * keeps the mailbox, and says in the servers' own words why it would not.
 * Linking it again starts from the servers it has, never its password.
 */
import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, toast } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

export type ImapServers = { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; useSsl: boolean }
type Linked = { id: string; address: string }

export function ImapLinkDialog({
  workspaceId,
  open,
  onOpenChange,
  start,
  onLinked,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Linking again: the address and servers it has. */
  start?: { address: string; servers: ImapServers | null } | null
  onLinked?: (account: Linked) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [address, setAddress] = useState(start?.address ?? '')
  const [password, setPassword] = useState('')
  const [imapHost, setImapHost] = useState(start?.servers?.imapHost ?? '')
  const [imapPort, setImapPort] = useState(String(start?.servers?.imapPort ?? 993))
  const [smtpHost, setSmtpHost] = useState(start?.servers?.smtpHost ?? '')
  const [smtpPort, setSmtpPort] = useState(String(start?.servers?.smtpPort ?? 465))
  const [useSsl, setUseSsl] = useState(start?.servers?.useSsl ?? true)
  const [refusal, setRefusal] = useState<string | null>(null)
  const link = useMutation({
    mutationFn: () =>
      api<Linked>(`/workspaces/${workspaceId}/email-accounts/imap`, {
        method: 'POST',
        body: { address, password, imapHost, imapPort: Number(imapPort), smtpHost, smtpPort: Number(smtpPort), useSsl },
      }),
    onSuccess: async (account) => {
      setRefusal(null)
      setPassword('')
      toast.success(t('emailSettings.imapLinked', { address: account.address }))
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['email-settings', workspaceId] }),
        qc.invalidateQueries({ queryKey: ['task-email-setup'] }),
      ])
      onLinked?.(account)
      onOpenChange(false)
    },
    onError: (err) => setRefusal(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)),
  })
  const field = (label: string, input: ReactNode) => (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      {input}
    </label>
  )
  const ready = address.trim() && password && imapHost.trim() && smtpHost.trim() && imapPort.trim() && smtpPort.trim()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="imap-link-dialog">
        <DialogHeader>
          <DialogTitle>{t('emailSettings.imapTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready && !link.isPending) link.mutate()
          }}
        >
          {field(t('emailSettings.imapAddress'), <Input data-testid="imap-address" type="email" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} />)}
          {field(t('emailSettings.imapPassword'), <Input data-testid="imap-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />)}
          <p className="text-[11px] text-muted-foreground">{t('emailSettings.imapPasswordHint')}</p>
          {field(t('emailSettings.imapHost'), <Input data-testid="imap-imap-host" placeholder="imap.mail.yahoo.com" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />)}
          {field(t('emailSettings.imapPort'), <Input data-testid="imap-imap-port" inputMode="numeric" value={imapPort} onChange={(e) => setImapPort(e.target.value)} />)}
          {field(t('emailSettings.smtpHost'), <Input data-testid="imap-smtp-host" placeholder="smtp.mail.yahoo.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />)}
          {field(t('emailSettings.smtpPort'), <Input data-testid="imap-smtp-port" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />)}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" data-testid="imap-ssl" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} />
            {t('emailSettings.imapSsl')}
          </label>
          {refusal && (
            <p className="rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-700" data-testid="imap-refusal">
              {refusal}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              {t('emailSettings.cancel')}
            </Button>
            <Button type="submit" size="sm" data-testid="imap-link" disabled={!ready || link.isPending}>
              {link.isPending ? t('emailSettings.imapLinking') : t('emailSettings.imapLink')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
