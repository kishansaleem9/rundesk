import { LegalPageShell, LegalSection, LegalList } from '../components/legal-page-shell'
import { ShieldAlert } from 'lucide-react'

// Every measure described here maps to functionality implemented in this
// codebase. Claims are deliberately conservative — we describe what the product
// actually does (e.g. credentials are hashed, not "encrypted secrets"), and we
// state our SOC 2 status honestly as in-progress rather than certified.
export function TrustPage() {
  return (
    <LegalPageShell
      title="Trust & Security"
      updated="16 July 2026"
      lead="Security is built into how Rundesk is architected. This page describes the protections that are actually implemented in the product today."
      templateNotice={false}
    >
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-800 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">Honest status:</strong> Rundesk is <strong>working toward SOC 2 Type II</strong>{' '}
          and is <strong>not yet certified</strong>. We describe our roadmap below rather than claiming a certification we
          do not hold.
        </p>
      </div>

      <LegalSection heading="Multi-tenant isolation">
        <p>
          Every workspace&rsquo;s data is scoped to its tenant at the application layer: queries are constrained by
          workspace, and each request runs with a pinned tenant context. As defense-in-depth, PostgreSQL{' '}
          <strong>row-level security</strong> is enabled on the core tenant tables (including workspaces, tasks,
          projects, chat, and audit logs) with policies that confine rows to the active workspace.
        </p>
      </LegalSection>

      <LegalSection heading="Authentication &amp; sessions">
        <LegalList
          items={[
            'Passwords are hashed with bcrypt (never stored in plaintext).',
            'Sessions use httpOnly cookies, so access and refresh tokens are not readable by page JavaScript.',
            'Refresh tokens rotate on every use and idle sessions expire, limiting the value of a stolen token.',
            'A double-submit CSRF token protects state-changing requests.',
            'Two-factor authentication (TOTP) is available, with one-time backup codes stored hashed.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="Account protection controls">
        <p>Workspace admins can enforce login-security policy, backed by the following implemented controls:</p>
        <LegalList
          items={[
            'Brute-force lockout after a configurable number of failed attempts.',
            'A strong-password requirement, with optional blocking of known-breached passwords (checked via a k-anonymity range query).',
            'An optional IP allowlist for workspace access.',
            'Concurrent-session limits that revoke the oldest sessions beyond the cap.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="Single sign-on &amp; provisioning">
        <p>
          Rundesk supports OAuth 2.0 / OpenID Connect single sign-on with Google and Microsoft, and SCIM-based group
          provisioning for managing membership from your identity provider. SSO and SCIM are available on the Enterprise
          plan.
        </p>
      </LegalSection>

      <LegalSection heading="Credential &amp; API-key storage">
        <p>
          Secrets are never stored in reversible plaintext. Passwords and TOTP backup codes are hashed with bcrypt, and
          API keys are stored as SHA-256 hashes — only a short, non-secret prefix is ever displayed. API keys are
          scope-limited (read-only, read-write, or admin) and can be revoked at any time.
        </p>
      </LegalSection>

      <LegalSection heading="Audit logging">
        <p>
          Security-relevant events are recorded in a per-workspace audit trail, capturing the actor, action, affected
          resource, IP address, and user agent — supporting investigation and accountability.
        </p>
      </LegalSection>

      <LegalSection heading="Your data: export &amp; erasure">
        <p>
          You control your data. From <strong>Profile &rarr; Privacy &amp; data</strong> you can export a
          machine-readable copy of your personal data (GDPR portability) and permanently delete your account, which
          anonymizes your personal information while preserving your team&rsquo;s records (right to erasure).
        </p>
      </LegalSection>

      <LegalSection heading="Encryption in transit">
        <p>All traffic between your browser and Rundesk is served over HTTPS/TLS.</p>
      </LegalSection>

      <LegalSection heading="Compliance &amp; roadmap">
        <LegalList
          items={[
            <>
              <strong>SOC 2 Type II</strong> — in progress. We are building toward an independent audit and are not yet
              certified.
            </>,
            <>
              <strong>GDPR</strong> — the product ships self-service data export and erasure and we offer a{' '}
              <a href="/dpa">Data Processing Addendum</a> for customers who need one.
            </>,
            <>
              <strong>Sub-processors</strong> — disclosed in our <a href="/privacy">Privacy Policy</a> and DPA.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Reporting a vulnerability">
        <p>
          Found a security issue? We appreciate responsible disclosure. Email{' '}
          <a href="mailto:security@rundesk.com">security@rundesk.com</a> and we will investigate promptly.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
