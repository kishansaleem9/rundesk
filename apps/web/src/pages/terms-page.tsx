import { LegalPageShell, LegalSection, LegalList } from '../components/legal-page-shell'

// Long-form legal copy is intentionally English-only (see LegalPageShell).
export function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      updated="16 July 2026"
      lead="These Terms govern your access to and use of Rundesk. By creating an account or using the service, you agree to them."
    >
      <LegalSection heading="1. Agreement">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) are a legal agreement between you (or the organization you
          represent) and Rundesk. If you use Rundesk on behalf of an organization, you represent that you have
          authority to bind it. If you do not agree, do not use the service.
        </p>
      </LegalSection>

      <LegalSection heading="2. The service">
        <p>
          Rundesk provides a hosted work-management platform including tasks and projects, documents, chat, time
          tracking, goals, reporting, automations, and related features. We may add, change, or remove features over
          time; we will not materially reduce the core functionality of a paid plan during a paid term without notice.
        </p>
      </LegalSection>

      <LegalSection heading="3. Accounts and security">
        <LegalList
          items={[
            'You must provide accurate registration details and keep them current.',
            'You are responsible for activity under your account and for keeping your credentials confidential.',
            'We recommend enabling two-factor authentication and using a strong, unique password.',
            'Notify us promptly at security@rundesk.com if you suspect unauthorized access.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            'Break the law or infringe others&rsquo; rights when using Rundesk.',
            'Upload malware or attempt to gain unauthorized access to the service or other tenants&rsquo; data.',
            'Probe, scan, or load-test the service except as expressly permitted in writing.',
            'Resell, sublicense, or provide the service to third parties outside your organization without permission.',
            'Use the service to store or transmit content that is unlawful, harassing, or harmful.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Your content">
        <p>
          You retain all rights to the content you and your team submit to Rundesk (&ldquo;Customer Content&rdquo;). You
          grant us a limited licence to host, process, and display Customer Content solely to operate and support the
          service, including through the sub-processors listed in our{' '}
          <a href="/privacy">Privacy Policy</a>. You are responsible for having the necessary rights to your content and
          for its lawful use.
        </p>
      </LegalSection>

      <LegalSection heading="6. Plans, billing, and trials">
        <LegalList
          items={[
            'Paid plans are billed in advance on a recurring basis through our payment processor; fees are non-refundable except where required by law.',
            'Free plans and trials are provided as-is and may have usage limits; we may modify or discontinue them.',
            'You are responsible for applicable taxes. We may change pricing on renewal with prior notice.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. Third-party integrations">
        <p>
          Rundesk can connect to third-party services you choose to enable. Your use of those services is governed by
          their own terms, and we are not responsible for them. Disabling an integration stops future data exchange
          with it.
        </p>
      </LegalSection>

      <LegalSection heading="8. Intellectual property">
        <p>
          Rundesk and its software, trademarks, and documentation are owned by us and our licensors. Except for the
          rights expressly granted to you to use the service, no other rights are granted.
        </p>
      </LegalSection>

      <LegalSection heading="9. Confidentiality">
        <p>
          Each party may access non-public information of the other. Each party will protect the other&rsquo;s
          confidential information with reasonable care and use it only to perform under these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="10. Warranties and disclaimers">
        <p>
          We provide the service with reasonable skill and care. Except as expressly stated, the service is provided{' '}
          <strong>&ldquo;as is&rdquo;</strong> and <strong>&ldquo;as available&rdquo;</strong> without warranties of any
          kind, whether express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement, to the maximum extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection heading="11. Limitation of liability">
        <p>
          To the maximum extent permitted by law, neither party is liable for indirect, incidental, special,
          consequential, or punitive damages, or for lost profits or data. Each party&rsquo;s aggregate liability
          arising out of these Terms is limited to the amounts you paid for the service in the twelve months before the
          event giving rise to the claim.
        </p>
      </LegalSection>

      <LegalSection heading="12. Term and termination">
        <p>
          These Terms apply while you use the service. You may stop using Rundesk and delete your account at any time.
          We may suspend or terminate access if you materially breach these Terms or to protect the service. On
          termination you may export your data for a reasonable period (see <a href="/privacy">Privacy Policy</a>),
          after which it may be deleted.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to these Terms">
        <p>
          We may update these Terms from time to time. If we make material changes, we will update the date above and
          provide reasonable notice. Continued use after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="14. Governing law">
        <p>
          These Terms are governed by the laws of the jurisdiction in which Rundesk is established, without regard to
          conflict-of-laws rules. The specific governing law and venue should be finalized with counsel for your
          deployment.
        </p>
      </LegalSection>

      <LegalSection heading="15. Contact">
        <p>
          Questions about these Terms? Email <a href="mailto:legal@rundesk.com">legal@rundesk.com</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
