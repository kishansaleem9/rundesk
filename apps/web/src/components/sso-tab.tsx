import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, Switch, Badge, toast, cn } from '@rundesk/ui'
import { KeyRound, Copy, Plus, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from './loading-skeletons'

type SsoProvider = 'oidc' | 'saml'

// Role dropdown options. `value` is the canonical role identifier persisted to
// the API; `labelKey` references an i18n catalog entry used only for display.
const ROLE_OPTIONS = [
  { value: 'member', labelKey: 'ssoTab.role.member' },
  { value: 'manager', labelKey: 'ssoTab.role.manager' },
  { value: 'guest', labelKey: 'ssoTab.role.guest' },
] as const

type SsoConnection = {
  id: string
  provider: SsoProvider
  displayName: string
  isEnabled: boolean
  enforceForDomain: string | null
  jitProvisioning: boolean
  defaultRole: string
  oidcIssuer: string | null
  oidcClientId: string | null
  oidcClientSecret: string | null
  oidcScopes: string | null
  samlIdpEntityId: string | null
  samlIdpSsoUrl: string | null
  samlIdpCertificate: string | null
  samlSpEntityId: string | null
  samlSignRequests: boolean
  attributeMapping: Record<string, string>
  lastUsedAt: string | null
  createdAt: string
}

type ScimToken = {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export function SsoTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const connectionsQ = useQuery({
    queryKey: ['sso-connections', workspaceId],
    queryFn: () => api<SsoConnection[]>(`/workspaces/${workspaceId}/sso`, { method: 'GET' }),
  })

  const tokensQ = useQuery({
    queryKey: ['scim-tokens', workspaceId],
    queryFn: () => api<ScimToken[]>(`/workspaces/${workspaceId}/scim/tokens`, { method: 'GET' }),
  })

  const oidc = useMemo(
    () => connectionsQ.data?.find((c) => c.provider === 'oidc') ?? null,
    [connectionsQ.data],
  )
  const saml = useMemo(
    () => connectionsQ.data?.find((c) => c.provider === 'saml') ?? null,
    [connectionsQ.data],
  )

  return (
    <div className="space-y-6">
      <Card variant="glass" className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">{t('ssoTab.title')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('ssoTab.subtitle')}
            </p>
          </div>
        </div>
      </Card>

      {/*
        THE FORMS ARE SEEDED FROM WHAT IS SAVED, SO THEY WAIT FOR IT. Each card
        copies its connection into its fields once, when it mounts; drawn
        before the connections had loaded, it copied nothing, and after a
        reload a saved connection showed as an empty form under an "Update"
        button — which saved those blanks over it. Keyed by the connection, so
        the first save (none → one) seeds the card afresh from the answer.
      */}
      {connectionsQ.isLoading ? (
        <InlineSkeleton />
      ) : connectionsQ.isError ? (
        <p className="text-xs text-destructive" data-testid="sso-load-failed">{t('ssoTab.loadFailed')}</p>
      ) : (
        <>
          <OidcCard
            key={oidc?.id ?? 'new'}
            workspaceId={workspaceId}
            connection={oidc}
            onSaved={() => qc.invalidateQueries({ queryKey: ['sso-connections', workspaceId] })}
          />

          <SamlCard
            key={saml?.id ?? 'new'}
            workspaceId={workspaceId}
            connection={saml}
            onSaved={() => qc.invalidateQueries({ queryKey: ['sso-connections', workspaceId] })}
          />
        </>
      )}

      <ScimSection
        workspaceId={workspaceId}
        tokens={tokensQ.data ?? []}
        onChanged={() => qc.invalidateQueries({ queryKey: ['scim-tokens', workspaceId] })}
      />
    </div>
  )
}

// ─── OIDC config card ───────────────────────────────────────────────────────

function OidcCard({
  workspaceId,
  connection,
  onSaved,
}: {
  workspaceId: string
  connection: SsoConnection | null
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(connection?.displayName ?? t('ssoTab.oidcDefaultName'))
  const [issuer, setIssuer] = useState(connection?.oidcIssuer ?? '')
  const [clientId, setClientId] = useState(connection?.oidcClientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [scopes, setScopes] = useState(connection?.oidcScopes ?? 'openid email profile')
  const [enforceDomain, setEnforceDomain] = useState(connection?.enforceForDomain ?? '')
  const [defaultRole, setDefaultRole] = useState(connection?.defaultRole ?? 'member')
  const [jit, setJit] = useState(connection?.jitProvisioning ?? true)
  const [isEnabled, setIsEnabled] = useState(connection?.isEnabled ?? false)

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        displayName,
        oidcIssuer: issuer || null,
        oidcClientId: clientId || null,
        oidcScopes: scopes || null,
        enforceForDomain: enforceDomain || null,
        defaultRole,
        jitProvisioning: jit,
        isEnabled,
      }
      if (clientSecret) payload.oidcClientSecret = clientSecret
      return api<SsoConnection>(`/workspaces/${workspaceId}/sso/oidc`, { method: 'PUT', body: payload })
    },
    onSuccess: () => {
      toast.success(t('ssoTab.oidcSaved'))
      setClientSecret('')
      onSaved()
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : t('ssoTab.oidcSaveFailed')
      toast.error(msg)
    },
  })

  const callbackUrl = `${window.location.origin}/api/v1/auth/sso/oidc/callback`

  return (
    <Card variant="glass" className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-display text-base font-semibold flex items-center gap-2">
            {t('ssoTab.oidcTitle')}
            {connection?.isEnabled && (
              <Badge variant="success" className="text-[9px] uppercase">{t('ssoTab.badgeActive')}</Badge>
            )}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('ssoTab.oidcSubtitle')}
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} aria-label={t('ssoTab.enableOidc')} />
      </div>

      <CalloutRow label={t('ssoTab.redirectUri')}>
        <CopyableMono value={callbackUrl} />
      </CalloutRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={t('ssoTab.displayName')}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Okta" />
        </Field>
        <Field label={t('ssoTab.issuerUrl')}>
          <Input data-testid="sso-oidc-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://example.okta.com" />
        </Field>
        <Field label={t('ssoTab.clientId')}>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="0oab..." />
        </Field>
        <Field label={t('ssoTab.clientSecret')}>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={connection?.oidcClientSecret ? t('ssoTab.secretSetPlaceholder') : t('ssoTab.secretPastePlaceholder')}
          />
        </Field>
        <Field label={t('ssoTab.scopes')}>
          <Input value={scopes} onChange={(e) => setScopes(e.target.value)} />
        </Field>
        <Field label={t('ssoTab.enforceForDomain')} hint={t('ssoTab.enforceForDomainHint')}>
          <Input value={enforceDomain} onChange={(e) => setEnforceDomain(e.target.value)} placeholder="example.com" />
        </Field>
        <Field label={t('ssoTab.defaultRoleJit')}>
          <select
            value={defaultRole}
            onChange={(e) => setDefaultRole(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-card text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </Field>
        <Field label={t('ssoTab.jitProvisioning')} hint={t('ssoTab.jitHint')}>
          <label className="flex items-center gap-2 h-9 cursor-pointer">
            <Switch checked={jit} onCheckedChange={setJit} />
            <span className="text-sm">{jit ? t('ssoTab.enabled') : t('ssoTab.disabled')}</span>
          </label>
        </Field>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <p className="text-xs text-muted-foreground">
          {connection?.lastUsedAt
            ? t('ssoTab.lastUsed', { date: new Date(connection.lastUsedAt).toLocaleString() })
            : t('ssoTab.notYetUsed')}
        </p>
        <Button data-testid="sso-oidc-save" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : connection ? t('ssoTab.update') : t('common.create')}
        </Button>
      </div>
    </Card>
  )
}

// ─── SAML config card ───────────────────────────────────────────────────────

function SamlCard({
  workspaceId,
  connection,
  onSaved,
}: {
  workspaceId: string
  connection: SsoConnection | null
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(connection?.displayName ?? t('ssoTab.samlDefaultName'))
  const [idpEntityId, setIdpEntityId] = useState(connection?.samlIdpEntityId ?? '')
  const [idpSsoUrl, setIdpSsoUrl] = useState(connection?.samlIdpSsoUrl ?? '')
  const [idpCert, setIdpCert] = useState('')
  const [spEntityId, setSpEntityId] = useState(connection?.samlSpEntityId ?? `rundesk:${workspaceId}`)
  const [enforceDomain, setEnforceDomain] = useState(connection?.enforceForDomain ?? '')
  const [defaultRole, setDefaultRole] = useState(connection?.defaultRole ?? 'member')
  const [jit, setJit] = useState(connection?.jitProvisioning ?? true)
  const [isEnabled, setIsEnabled] = useState(connection?.isEnabled ?? false)

  const acsUrl = `${window.location.origin}/api/v1/auth/sso/saml/callback`

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        displayName,
        samlIdpEntityId: idpEntityId || null,
        samlIdpSsoUrl: idpSsoUrl || null,
        samlSpEntityId: spEntityId || null,
        enforceForDomain: enforceDomain || null,
        defaultRole,
        jitProvisioning: jit,
        isEnabled,
      }
      if (idpCert) payload.samlIdpCertificate = idpCert
      return api<SsoConnection>(`/workspaces/${workspaceId}/sso/saml`, { method: 'PUT', body: payload })
    },
    onSuccess: () => {
      toast.success(t('ssoTab.samlSaved'))
      setIdpCert('')
      onSaved()
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : t('ssoTab.samlSaveFailed')
      toast.error(msg)
    },
  })

  return (
    <Card variant="glass" className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-display text-base font-semibold flex items-center gap-2">
            {t('ssoTab.samlTitle')}
            {connection?.isEnabled && (
              <Badge variant="success" className="text-[9px] uppercase">{t('ssoTab.badgeActive')}</Badge>
            )}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('ssoTab.samlSubtitle')}
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} aria-label={t('ssoTab.enableSaml')} />
      </div>

      <CalloutRow label={t('ssoTab.acsUrl')}>
        <CopyableMono value={acsUrl} />
      </CalloutRow>
      <CalloutRow label={t('ssoTab.spEntityId')}>
        <CopyableMono value={spEntityId || `rundesk:${workspaceId}`} />
      </CalloutRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={t('ssoTab.displayName')}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t('ssoTab.spEntityId')}>
          <Input value={spEntityId} onChange={(e) => setSpEntityId(e.target.value)} />
        </Field>
        <Field label={t('ssoTab.idpEntityId')}>
          <Input value={idpEntityId} onChange={(e) => setIdpEntityId(e.target.value)} placeholder="https://idp.example.com/exk..." />
        </Field>
        <Field label={t('ssoTab.idpSsoUrl')}>
          <Input value={idpSsoUrl} onChange={(e) => setIdpSsoUrl(e.target.value)} placeholder="https://idp.example.com/app/.../sso/saml" />
        </Field>
        <div className="md:col-span-2">
          <Field label={t('ssoTab.idpCertificate')} hint={connection?.samlIdpCertificate ? t('ssoTab.certCurrent', { cert: connection.samlIdpCertificate }) : t('ssoTab.certPaste')}>
            <textarea
              value={idpCert}
              onChange={(e) => setIdpCert(e.target.value)}
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-xs font-mono"
            />
          </Field>
        </div>
        <Field label={t('ssoTab.enforceForDomain')}>
          <Input value={enforceDomain} onChange={(e) => setEnforceDomain(e.target.value)} placeholder="example.com" />
        </Field>
        <Field label={t('ssoTab.defaultRoleJit')}>
          <select
            value={defaultRole}
            onChange={(e) => setDefaultRole(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-card text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </Field>
        <Field label={t('ssoTab.jitProvisioning')}>
          <label className="flex items-center gap-2 h-9 cursor-pointer">
            <Switch checked={jit} onCheckedChange={setJit} />
            <span className="text-sm">{jit ? t('ssoTab.enabled') : t('ssoTab.disabled')}</span>
          </label>
        </Field>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <p className="text-xs text-muted-foreground">
          {connection?.lastUsedAt
            ? t('ssoTab.lastUsed', { date: new Date(connection.lastUsedAt).toLocaleString() })
            : t('ssoTab.notYetUsed')}
        </p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : connection ? t('ssoTab.update') : t('common.create')}
        </Button>
      </div>
    </Card>
  )
}

// ─── SCIM token management ──────────────────────────────────────────────────

function ScimSection({
  workspaceId,
  tokens,
  onChanged,
}: {
  workspaceId: string
  tokens: ScimToken[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const scimBase = `${window.location.origin}/api/v1/scim/v2`

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('ssoTab.tokenNameRequired'))
      return api<{ id: string; token: string; name: string; keyPrefix: string }>(
        `/workspaces/${workspaceId}/scim/tokens`,
        { method: 'POST', body: { name: name.trim() } },
      )
    },
    onSuccess: (resp) => {
      toast.success(t('ssoTab.tokenCreated'))
      setNewToken(resp.token)
      setName('')
      onChanged()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('ssoTab.tokenCreateFailed'))
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/scim/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('ssoTab.tokenRevoked'))
      onChanged()
    },
  })

  return (
    <Card variant="glass" className="p-5 space-y-4">
      <div>
        <h4 className="font-display text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> {t('ssoTab.scimTitle')}
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('ssoTab.scimSubtitle')}
        </p>
      </div>

      <CalloutRow label={t('ssoTab.scimBaseUrl')}>
        <CopyableMono value={scimBase} />
      </CalloutRow>

      <div className="flex items-end gap-2">
        <Field label={t('ssoTab.tokenName')} hint={t('ssoTab.tokenNameHint')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('ssoTab.tokenNamePlaceholder')}
            className="w-64"
          />
        </Field>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-1" /> {create.isPending ? t('ssoTab.creating') : t('ssoTab.createToken')}
        </Button>
      </div>

      {newToken && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('ssoTab.copyTokenWarning')}
          </div>
          <CopyableMono value={newToken} className="mt-2" />
        </div>
      )}

      <div className="space-y-1">
        {tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{t('ssoTab.noTokens')}</p>
        ) : (
          tokens.map((token) => (
            <div
              key={token.id}
              className={cn(
                'flex items-center justify-between rounded-md border border-border/40 bg-card/60 px-3 py-2',
                token.revokedAt && 'opacity-60',
              )}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {token.name}
                  {token.revokedAt && <Badge variant="destructive" className="text-[9px]">{t('ssoTab.revoked')}</Badge>}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {token.keyPrefix}…  ·  {token.lastUsedAt
                    ? t('ssoTab.lastUsedLower', { date: new Date(token.lastUsedAt).toLocaleString() })
                    : t('ssoTab.neverUsed')}
                </div>
              </div>
              {!token.revokedAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(t('ssoTab.confirmRevoke', { name: token.name }))) revoke.mutate(token.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function CalloutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/40 bg-card/40 px-3 py-2 text-xs flex items-center gap-3">
      <span className="text-muted-foreground min-w-[120px] uppercase tracking-wider text-[10px]">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function CopyableMono({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <code className="flex-1 font-mono text-xs truncate">{value}</code>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => toast.success(t('ssoTab.copied')))
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  )
}
