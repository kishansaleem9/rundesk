/**
 * CLICKUP'S EMAIL SETTINGS (`found-9-oct/task-email-sends-from-the-server`).
 *
 * The mailboxes a task's email is sent from — each linked at its provider,
 * under a sender name, sendable from by whoever linked it and the teammates
 * they choose — and, on Business and above, a person's signatures and the
 * workspace's templates. A mailbox's consent comes back here, linked or with
 * the provider's words.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Textarea, cn, toast } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { linkMailbox, type EmailPlan, type EmailSignature, type EmailTemplate } from '../components/comment-email'

type AccountView = {
  id: string
  provider: 'gmail' | 'outlook'
  address: string
  senderName: string
  status: 'connected' | 'needs_reconnect'
  lastError: string | null
  uses: number
  usesLeft: number | null
  owner: { id: string; name: string }
  mine: boolean
  maySend: boolean
  mayRemove: boolean
  senders: string[] | null
}
type Overview = {
  plan: EmailPlan
  providers: { gmail: { available: boolean; reason?: string }; outlook: { available: boolean; reason?: string } }
  accounts: AccountView[]
  signatures: EmailSignature[]
  templates: Array<EmailTemplate & { createdById: string }>
  members: Array<{ id: string; name: string; email: string | null }>
}

const said = (err: unknown) => (err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))

function AccountRow({ account, members, workspaceId }: { account: AccountView; members: Overview['members']; workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(account.senderName)
  const [senders, setSenders] = useState<string[]>(account.senders ?? [])
  const refresh = () => qc.invalidateQueries({ queryKey: ['email-settings', workspaceId] })
  const save = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/email-accounts/${account.id}`, { method: 'PATCH', body: { senderName: name, senders } }),
    onSuccess: async () => {
      toast.success(t('emailSettings.saved'))
      await refresh()
    },
    onError: (err) => toast.error(said(err)),
  })
  const remove = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/email-accounts/${account.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err) => toast.error(said(err)),
  })
  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="email-account-row" data-account-id={account.id} data-provider={account.provider} data-status={account.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium" data-testid="email-account-address">{account.address}</span>
        <span className="text-xs text-muted-foreground">{account.provider === 'gmail' ? 'Gmail' : 'Outlook'}</span>
        <span className="text-xs text-muted-foreground">{t('emailSettings.owner', { name: account.owner.name })}</span>
        {account.usesLeft !== null && <span className="text-xs text-muted-foreground" data-testid="email-account-uses">{t('emailSettings.usesLeft', { n: account.usesLeft })}</span>}
        {account.mayRemove && (
          <Button size="sm" variant="outline" className="ml-auto" data-testid="email-account-remove" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t('emailSettings.remove')}
          </Button>
        )}
      </div>
      {account.status !== 'connected' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive" data-testid="email-account-reconnect">{t('emailSettings.needsReconnect', { error: account.lastError ?? '' })}</p>
          {account.mine && (
            <Button
              size="sm"
              variant="outline"
              data-testid="email-account-relink"
              onClick={() => void linkMailbox(workspaceId, account.provider).catch((err) => toast.error(said(err)))}
            >
              {t('emailSettings.relink')}
            </Button>
          )}
        </div>
      )}
      {account.mine && (
        <>
          <label className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 text-muted-foreground">{t('emailSettings.senderName')}</span>
            <Input data-testid="email-account-sender-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="text-xs">
            <p className="mb-1 text-muted-foreground">{t('emailSettings.whoMaySend')}</p>
            <div className="flex flex-wrap gap-3" data-testid="email-account-senders">
              {members
                .filter((m) => m.id !== account.owner.id)
                .map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      data-testid={`email-account-sender-${m.id}`}
                      checked={senders.includes(m.id)}
                      onChange={(e) => setSenders((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))}
                    />
                    {m.name}
                  </label>
                ))}
            </div>
          </div>
          <Button size="sm" data-testid="email-account-save" disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
            {t('emailSettings.save')}
          </Button>
        </>
      )}
    </div>
  )
}

function SignaturesTab({ data, workspaceId }: { data: Overview; workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const refresh = () => qc.invalidateQueries({ queryKey: ['email-settings', workspaceId] })
  const add = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/email-signatures`, { method: 'POST', body: { name, body, isDefault } }),
    onSuccess: async () => {
      setName('')
      setBody('')
      await refresh()
    },
    onError: (err) => toast.error(said(err)),
  })
  const del = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/email-signatures/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err) => toast.error(said(err)),
  })
  const makeDefault = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/email-signatures/${id}`, { method: 'PATCH', body: { isDefault: true } }),
    onSuccess: refresh,
    onError: (err) => toast.error(said(err)),
  })
  return (
    <div className="space-y-3">
      {data.signatures.map((s) => (
        <div key={s.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm" data-testid="email-signature-row" data-default={s.isDefault ? 'yes' : 'no'}>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{s.name}</p>
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{s.body}</pre>
          </div>
          {s.isDefault ? (
            <span className="text-xs text-accent">{t('emailSettings.signatureDefault')}</span>
          ) : (
            <Button size="sm" variant="outline" data-testid="email-signature-make-default" onClick={() => makeDefault.mutate(s.id)}>
              {t('emailSettings.signatureDefault')}
            </Button>
          )}
          <Button size="sm" variant="outline" data-testid="email-signature-delete" onClick={() => del.mutate(s.id)}>
            {t('emailSettings.delete')}
          </Button>
        </div>
      ))}
      <div className="space-y-2 rounded-md border border-dashed border-border p-3" data-testid="email-signature-form">
        <Input data-testid="email-signature-name" placeholder={t('emailSettings.signatureName')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Textarea data-testid="email-signature-body" placeholder={t('emailSettings.signatureBody')} value={body} onChange={(e) => setBody(e.target.value)} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" data-testid="email-signature-default" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          {t('emailSettings.signatureDefault')}
        </label>
        <Button size="sm" data-testid="email-signature-add" disabled={!name.trim() || !body.trim() || add.isPending} onClick={() => add.mutate()}>
          {t('emailSettings.addSignature')}
        </Button>
      </div>
    </div>
  )
}

function TemplatesTab({ data, workspaceId }: { data: Overview; workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [shared, setShared] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['email-settings', workspaceId] })
  const add = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/email-templates`, { method: 'POST', body: { name, subject: subject || undefined, body, shared } }),
    onSuccess: async () => {
      setName('')
      setSubject('')
      setBody('')
      setShared(false)
      await refresh()
    },
    onError: (err) => toast.error(said(err)),
  })
  const del = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/email-templates/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err) => toast.error(said(err)),
  })
  return (
    <div className="space-y-3">
      {data.templates.map((tpl) => (
        <div key={tpl.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm" data-testid="email-template-row" data-shared={tpl.shared ? 'yes' : 'no'}>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{tpl.name}</p>
            {tpl.subject && <p className="text-xs">{tpl.subject}</p>}
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{tpl.body}</pre>
          </div>
          {tpl.mine && (
            <Button size="sm" variant="outline" data-testid="email-template-delete" onClick={() => del.mutate(tpl.id)}>
              {t('emailSettings.delete')}
            </Button>
          )}
        </div>
      ))}
      <div className="space-y-2 rounded-md border border-dashed border-border p-3" data-testid="email-template-form">
        <Input data-testid="email-template-name" placeholder={t('emailSettings.templateName')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <Input data-testid="email-template-subject" placeholder={t('emailSettings.templateSubject')} value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} />
        <Textarea data-testid="email-template-body" placeholder={t('emailSettings.templateBody')} value={body} onChange={(e) => setBody(e.target.value)} />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" data-testid="email-template-shared" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t('emailSettings.templateShared')}
        </label>
        <Button size="sm" data-testid="email-template-add" disabled={!name.trim() || !body.trim() || add.isPending} onClick={() => add.mutate()}>
          {t('emailSettings.addTemplate')}
        </Button>
      </div>
    </div>
  )
}

export function EmailSettingsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/email' })
  const search = useSearch({ from: '/app/$workspaceId/email' })
  const navigate = useNavigate()
  const tab = search.tab ?? 'accounts'
  const overview = useQuery({
    queryKey: ['email-settings', workspaceId],
    queryFn: () => api<Overview>(`/workspaces/${workspaceId}/email-accounts`),
    retry: false,
  })
  const data = overview.data
  const planLine = useMemo(() => {
    if (!data) return ''
    const p = data.plan
    const accounts =
      p.accounts === null
        ? t('emailSettings.planAccountsUnlimited', { plan: p.label })
        : p.accounts === 1
          ? t('emailSettings.planAccountsOne', { plan: p.label })
          : t('emailSettings.planAccountsMany', { plan: p.label, n: p.accounts })
    return p.uses === null ? accounts : `${accounts} ${t('emailSettings.planUses', { n: p.uses })}`
  }, [data, t])
  const link = (provider: 'gmail' | 'outlook') => {
    void linkMailbox(workspaceId, provider).catch((err) => toast.error(said(err)))
  }
  const tabs: Array<{ id: 'accounts' | 'signatures' | 'templates'; label: string }> = [
    { id: 'accounts', label: t('emailSettings.tabAccounts') },
    { id: 'signatures', label: t('emailSettings.tabSignatures') },
    { id: 'templates', label: t('emailSettings.tabTemplates') },
  ]
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" data-testid="email-settings">
      <h1 className="text-xl font-semibold">{t('emailSettings.title')}</h1>
      {search.connected && !search.connectError && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700" data-testid="email-settings-connected">
          {t('emailSettings.connected', { provider: search.connected === 'gmail' ? 'Gmail' : 'Outlook' })}
        </p>
      )}
      {search.connectError && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-700" data-testid="email-settings-connect-error">
          {t('emailSettings.connectError', { error: search.connectError })}
        </p>
      )}
      {overview.isError && (
        <p className="text-sm text-destructive" data-testid="email-settings-refused">{said(overview.error)}</p>
      )}
      {data && (
        <>
          <div className="flex gap-1 border-b border-border" role="tablist">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                data-testid={`email-settings-tab-${x.id}`}
                className={cn('-mb-px border-b-2 px-3 py-1.5 text-sm', tab === x.id ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground')}
                onClick={() => void navigate({ to: '/app/$workspaceId/email', params: { workspaceId }, search: { tab: x.id } })}
              >
                {x.label}
              </button>
            ))}
          </div>
          {tab === 'accounts' && (
            <Card className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">{t('emailSettings.accountsIntro')}</p>
              <p className="text-xs text-muted-foreground" data-testid="email-settings-plan">{planLine}</p>
              <div className="flex flex-wrap gap-2">
                {(['gmail', 'outlook'] as const).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant="outline"
                    data-testid={`email-link-${p}`}
                    disabled={!data.providers[p].available}
                    title={data.providers[p].reason}
                    onClick={() => link(p)}
                  >
                    {p === 'gmail' ? t('emailSettings.linkGmail') : t('emailSettings.linkOutlook')}
                  </Button>
                ))}
              </div>
              {data.accounts.length === 0 && <p className="text-sm text-muted-foreground" data-testid="email-settings-none">{t('emailSettings.none')}</p>}
              {data.accounts.map((a) => (
                <AccountRow key={`${a.id}:${a.senderName}:${(a.senders ?? []).join(',')}`} account={a} members={data.members} workspaceId={workspaceId} />
              ))}
            </Card>
          )}
          {tab !== 'accounts' && !data.plan.signaturesAndTemplates && (
            <Card className="p-4 text-sm text-muted-foreground" data-testid="email-settings-locked">
              {t('emailSettings.lockedBusiness')}
            </Card>
          )}
          {tab === 'signatures' && data.plan.signaturesAndTemplates && (
            <Card className="p-4">
              <SignaturesTab data={data} workspaceId={workspaceId} />
            </Card>
          )}
          {tab === 'templates' && data.plan.signaturesAndTemplates && (
            <Card className="p-4">
              <TemplatesTab data={data} workspaceId={workspaceId} />
            </Card>
          )}
        </>
      )}
    </div>
  )
}
