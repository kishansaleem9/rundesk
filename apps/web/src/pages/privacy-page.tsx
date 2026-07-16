import { LegalPageShell, LegalSection, LegalList } from '../components/legal-page-shell'

// Long-form legal copy is intentionally English-only (see LegalPageShell).
export function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      updated="16 July 2026"
      lead="This Privacy Policy explains what personal data Rundesk collects, why we collect it, how we use and share it, and the rights you have over it."
    >
      <LegalSection heading="1. Who we are">
        <p>
          Rundesk (&ldquo;Rundesk&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides a collaborative work-management
          platform for tasks, docs, chat, and reporting. When your employer or team provides Rundesk to you, that
          organization is the <strong>controller</strong> of the content in its workspace and Rundesk acts as a{' '}
          <strong>processor</strong> on its behalf; for account-level data we describe below, Rundesk is the controller.
        </p>
      </LegalSection>

      <LegalSection heading="2. Data we collect">
        <LegalList
          items={[
            <>
              <strong>Account data</strong> — your name, email address, password (stored only as a hash), profile
              photo, language and theme preferences, and, if enabled, two-factor authentication settings.
            </>,
            <>
              <strong>Workspace content</strong> — the tasks, comments, documents, chat messages, files, time entries,
              and other material you and your team create in Rundesk.
            </>,
            <>
              <strong>Usage &amp; device data</strong> — log data such as IP address, browser and device type, pages
              viewed, and timestamps, used to operate, secure, and improve the service.
            </>,
            <>
              <strong>Cookies &amp; local storage</strong> — used to keep you signed in, remember preferences, and
              understand aggregate usage (see section 5).
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. How we use your data">
        <LegalList
          items={[
            'Provide, maintain, and secure the service and your account.',
            'Authenticate you and protect against fraud, abuse, and unauthorized access.',
            'Send service, security, and administrative communications.',
            'Understand how Rundesk is used so we can fix problems and improve features.',
            'Comply with legal obligations and enforce our Terms of Service.',
          ]}
        />
        <p>
          Where required by law, we rely on a lawful basis for each purpose — typically performance of our contract with
          you, our legitimate interests in operating a secure service, your consent (for optional cookies), or
          compliance with a legal obligation.
        </p>
      </LegalSection>

      <LegalSection heading="4. AI features">
        <p>
          Some features use a third-party large-language-model provider to generate summaries, suggestions, and
          answers from the workspace content you submit to them. Content sent for these features is processed only to
          return a result to you and is not used by us to train foundation models.
        </p>
      </LegalSection>

      <LegalSection heading="5. Cookies">
        <p>
          We use strictly-necessary cookies to keep you signed in and protect requests (for example, session and CSRF
          cookies), and preference and analytics storage to remember your choices and measure aggregate usage. On your
          first visit a banner lets you <strong>Accept</strong> or <strong>Decline</strong> non-essential cookies; your
          choice is stored on your device and can be changed by clearing site data. Strictly-necessary cookies cannot
          be switched off because the service will not function without them.
        </p>
      </LegalSection>

      <LegalSection heading="6. Sub-processors">
        <p>We rely on a small set of vendors to run Rundesk. They act only on our instructions and under contract:</p>
        <LegalList
          items={[
            'Cloud hosting and managed database infrastructure.',
            'Transactional email delivery (for verification, notifications, and password resets).',
            'A large-language-model provider that powers AI features.',
            'Error monitoring and product analytics.',
            'A payment processor for paid plans (card details are handled by the processor, not stored by Rundesk).',
          ]}
        />
        <p>
          A current list of sub-processors is maintained in our <a href="/dpa">Data Processing Addendum</a>. We give
          notice of material changes so customers can object where they have the right to.
        </p>
      </LegalSection>

      <LegalSection heading="7. How we share data">
        <p>
          We do not sell your personal data. We share it only with the sub-processors above, with other members of your
          workspace as inherent to a collaboration tool, when you direct us to (for example, an integration you
          connect), or where required by law or to protect rights and safety.
        </p>
      </LegalSection>

      <LegalSection heading="8. Data retention">
        <p>
          We keep account and workspace data for as long as your account or workspace is active, and thereafter only as
          needed to comply with legal obligations, resolve disputes, and enforce agreements. When you delete your
          account, we anonymize your personal data as described in section 9.
        </p>
      </LegalSection>

      <LegalSection heading="9. Your rights">
        <p>
          Depending on where you live (including under the EU/UK GDPR), you have the right to access, correct, delete,
          restrict, or object to the processing of your personal data, and to data portability. Rundesk supports these
          directly in the product:
        </p>
        <LegalList
          items={[
            <>
              <strong>Access &amp; portability</strong> — export a machine-readable JSON copy of your personal data
              from <strong>Profile &rarr; Privacy &amp; data</strong>.
            </>,
            <>
              <strong>Erasure</strong> — permanently delete and anonymize your account from the same screen; authored
              content is de-identified so your team&rsquo;s records stay intact without keeping you identifiable.
            </>,
            <>
              <strong>Rectification</strong> — update your profile details at any time from your account settings.
            </>,
          ]}
        />
        <p>
          You can also exercise these rights, or withdraw consent, by contacting us at{' '}
          <a href="mailto:privacy@rundesk.com">privacy@rundesk.com</a>. You have the right to lodge a complaint with
          your local data-protection authority.
        </p>
      </LegalSection>

      <LegalSection heading="10. International transfers">
        <p>
          Rundesk may process data in countries other than your own. Where we transfer personal data across borders, we
          use appropriate safeguards such as the European Commission&rsquo;s Standard Contractual Clauses.
        </p>
      </LegalSection>

      <LegalSection heading="11. Security">
        <p>
          We apply technical and organizational measures to protect your data, including tenant isolation, hashed
          credentials, audit logging, and encrypted transport. Read the details on our{' '}
          <a href="/trust">Trust &amp; Security</a> page.
        </p>
      </LegalSection>

      <LegalSection heading="12. Children">
        <p>
          Rundesk is a workplace tool and is not directed to children. We do not knowingly collect personal data from
          anyone under 16.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be signalled by updating the date above
          and, where appropriate, by additional notice.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact">
        <p>
          Questions about this policy or your data? Email{' '}
          <a href="mailto:privacy@rundesk.com">privacy@rundesk.com</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
