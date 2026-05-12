import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, Switch, Badge, toast, cn } from '@rundesk/ui'
import { KeyRound, Copy, Plus, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { api, ApiError } from '../lib/api'

type SsoProvider = 'oidc' | 'saml'

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
            <h3 className="font-display text-lg font-semibold">Enterprise SSO</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Connect Okta, Azure AD, Google Workspace, or any SAML / OIDC IdP. JIT-provisioned
              members are added with the default role and audit-logged on every sign-in.
            </p>
          </div>
        </div>
      </Card>

      <OidcCard
        workspaceId={workspaceId}
        connection={oidc}
        onSaved={() => qc.invalidateQueries({ queryKey: ['sso-connections', workspaceId] })}
      />

      <SamlCard
        workspaceId={workspaceId}
        connection={saml}
        onSaved={() => qc.invalidateQueries({ queryKey: ['sso-connections', workspaceId] })}
      />

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
  const [displayName, setDisplayName] = useState(connection?.displayName ?? 'Workspace OIDC')
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
      toast.success('OIDC connection saved')
      setClientSecret('')
      onSaved()
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to save OIDC connection'
      toast.error(msg)
    },
  })

  const callbackUrl = `${window.location.origin}/api/v1/auth/sso/oidc/callback`

  return (
    <Card variant="glass" className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-display text-base font-semibold flex items-center gap-2">
            OpenID Connect (OIDC)
            {connection?.isEnabled && (
              <Badge variant="success" className="text-[9px] uppercase">Active</Badge>
            )}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            For Okta, Azure AD, Google Workspace, Auth0, Authentik, and most modern IdPs.
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} aria-label="Enable OIDC" />
      </div>

      <CalloutRow label="Redirect URI">
        <CopyableMono value={callbackUrl} />
      </CalloutRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Display name">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Okta" />
        </Field>
        <Field label="Issuer URL">
          <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://example.okta.com" />
        </Field>
        <Field label="Client ID">
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="0oab..." />
        </Field>
        <Field label="Client secret">
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={connection?.oidcClientSecret ? '•••••••• (set; replace to change)' : 'paste secret'}
          />
        </Field>
        <Field label="Scopes">
          <Input value={scopes} onChange={(e) => setScopes(e.target.value)} />
        </Field>
        <Field label="Enforce for email domain" hint="Optional. If set, users at this domain must sign in via SSO.">
          <Input value={enforceDomain} onChange={(e) => setEnforceDomain(e.target.value)} placeholder="example.com" />
        </Field>
        <Field label="Default role for JIT users">
          <select
            value={defaultRole}
            onChange={(e) => setDefaultRole(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-card text-sm"
          >
            <option value="member">Member</option>
            <option value="manager">Manager</option>
            <option value="guest">Guest</option>
          </select>
        </Field>
        <Field label="JIT provisioning" hint="Auto-create users on first SSO sign-in.">
          <label className="flex items-center gap-2 h-9 cursor-pointer">
            <Switch checked={jit} onCheckedChange={setJit} />
            <span className="text-sm">{jit ? 'Enabled' : 'Disabled'}</span>
          </label>
        </Field>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <p className="text-xs text-muted-foreground">
          {connection?.lastUsedAt
            ? `Last used ${new Date(connection.lastUsedAt).toLocaleString()}`
            : 'Not yet used'}
        </p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : connection ? 'Update' : 'Create'}
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
  const [displayName, setDisplayName] = useState(connection?.displayName ?? 'Workspace SAML')
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
      toast.success('SAML connection saved')
      setIdpCert('')
      onSaved()
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Failed to save SAML connection'
      toast.error(msg)
    },
  })

  return (
    <Card variant="glass" className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-display text-base font-semibold flex items-center gap-2">
            SAML 2.0
            {connection?.isEnabled && (
              <Badge variant="success" className="text-[9px] uppercase">Active</Badge>
            )}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            For traditional enterprise IdPs (ADFS, Ping, OneLogin, on-prem deployments).
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} aria-label="Enable SAML" />
      </div>

      <CalloutRow label="ACS / Reply URL">
        <CopyableMono value={acsUrl} />
      </CalloutRow>
      <CalloutRow label="SP Entity ID">
        <CopyableMono value={spEntityId || `rundesk:${workspaceId}`} />
      </CalloutRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Display name">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="SP Entity ID">
          <Input value={spEntityId} onChange={(e) => setSpEntityId(e.target.value)} />
        </Field>
        <Field label="IdP Entity ID">
          <Input value={idpEntityId} onChange={(e) => setIdpEntityId(e.target.value)} placeholder="https://idp.example.com/exk..." />
        </Field>
        <Field label="IdP SSO URL">
          <Input value={idpSsoUrl} onChange={(e) => setIdpSsoUrl(e.target.value)} placeholder="https://idp.example.com/app/.../sso/saml" />
        </Field>
        <div className="md:col-span-2">
          <Field label="IdP signing certificate (PEM)" hint={connection?.samlIdpCertificate ? `Currently: ${connection.samlIdpCertificate}` : 'Paste the X.509 certificate from your IdP'}>
            <textarea
              value={idpCert}
              onChange={(e) => setIdpCert(e.target.value)}
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-xs font-mono"
            />
          </Field>
        </div>
        <Field label="Enforce for email domain">
          <Input value={enforceDomain} onChange={(e) => setEnforceDomain(e.target.value)} placeholder="example.com" />
        </Field>
        <Field label="Default role for JIT users">
          <select
            value={defaultRole}
            onChange={(e) => setDefaultRole(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-card text-sm"
          >
            <option value="member">Member</option>
            <option value="manager">Manager</option>
            <option value="guest">Guest</option>
          </select>
        </Field>
        <Field label="JIT provisioning">
          <label className="flex items-center gap-2 h-9 cursor-pointer">
            <Switch checked={jit} onCheckedChange={setJit} />
            <span className="text-sm">{jit ? 'Enabled' : 'Disabled'}</span>
          </label>
        </Field>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <p className="text-xs text-muted-foreground">
          {connection?.lastUsedAt
            ? `Last used ${new Date(connection.lastUsedAt).toLocaleString()}`
            : 'Not yet used'}
        </p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : connection ? 'Update' : 'Create'}
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
  const [name, setName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const scimBase = `${window.location.origin}/api/v1/scim/v2`

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Token name required')
      return api<{ id: string; token: string; name: string; keyPrefix: string }>(
        `/workspaces/${workspaceId}/scim/tokens`,
        { method: 'POST', body: { name: name.trim() } },
      )
    },
    onSuccess: (resp) => {
      toast.success('SCIM token created')
      setNewToken(resp.token)
      setName('')
      onChanged()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create token')
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/scim/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Token revoked')
      onChanged()
    },
  })

  return (
    <Card variant="glass" className="p-5 space-y-4">
      <div>
        <h4 className="font-display text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> SCIM 2.0 provisioning
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate a long-lived bearer token to let your IdP provision and de-provision users
          automatically.
        </p>
      </div>

      <CalloutRow label="SCIM base URL">
        <CopyableMono value={scimBase} />
      </CalloutRow>

      <div className="flex items-end gap-2">
        <Field label="Token name" hint="Used for audit logs and revocation">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Okta provisioning"
            className="w-64"
          />
        </Field>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-1" /> {create.isPending ? 'Creating…' : 'Create token'}
        </Button>
      </div>

      {newToken && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Copy this token now. We will not show it again.
          </div>
          <CopyableMono value={newToken} className="mt-2" />
        </div>
      )}

      <div className="space-y-1">
        {tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No tokens issued yet.</p>
        ) : (
          tokens.map((t) => (
            <div
              key={t.id}
              className={cn(
                'flex items-center justify-between rounded-md border border-border/40 bg-card/60 px-3 py-2',
                t.revokedAt && 'opacity-60',
              )}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {t.name}
                  {t.revokedAt && <Badge variant="destructive" className="text-[9px]">Revoked</Badge>}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {t.keyPrefix}…  ·  {t.lastUsedAt
                    ? `last used ${new Date(t.lastUsedAt).toLocaleString()}`
                    : 'never used'}
                </div>
              </div>
              {!t.revokedAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Revoke token "${t.name}"?`)) revoke.mutate(t.id)
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
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <code className="flex-1 font-mono text-xs truncate">{value}</code>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => toast.success('Copied'))
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  )
}
