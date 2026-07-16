import { LegalPageShell, LegalSection, LegalList } from '../components/legal-page-shell'

// Long-form legal copy is intentionally English-only (see LegalPageShell).
export function DpaPage() {
  return (
    <LegalPageShell
      title="Data Processing Addendum"
      updated="16 July 2026"
      lead="This Data Processing Addendum (DPA) forms part of the Terms of Service and applies where Rundesk processes personal data on a customer's behalf under data-protection law such as the EU/UK GDPR."
    >
      <LegalSection heading="1. Roles of the parties">
        <p>
          For personal data contained in Customer Content, the customer is the <strong>controller</strong> and Rundesk
          is the <strong>processor</strong>. Where the customer is itself a processor for a third party, Rundesk is a
          sub-processor. Rundesk processes personal data only to provide the service and on the customer&rsquo;s
          documented instructions, including as set out in the <a href="/terms">Terms of Service</a> and{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </LegalSection>

      <LegalSection heading="2. Definitions">
        <p>
          &ldquo;Personal data&rdquo;, &ldquo;processing&rdquo;, &ldquo;controller&rdquo;, &ldquo;processor&rdquo;, and
          &ldquo;data subject&rdquo; have the meanings given in applicable data-protection law. &ldquo;Sub-processor&rdquo;
          means any processor engaged by Rundesk to process personal data.
        </p>
      </LegalSection>

      <LegalSection heading="3. Scope and duration">
        <p>
          Rundesk processes personal data for the duration of the agreement and for the purpose of providing the
          service. The subject matter, nature, and purpose of processing, the categories of data subjects, and the
          types of personal data are described in the Annex below.
        </p>
      </LegalSection>

      <LegalSection heading="4. Processing instructions">
        <p>
          Rundesk will process personal data only on the customer&rsquo;s documented instructions, including with regard
          to international transfers, unless required to do otherwise by law — in which case Rundesk will inform the
          customer unless the law prohibits it.
        </p>
      </LegalSection>

      <LegalSection heading="5. Confidentiality">
        <p>
          Rundesk ensures that personnel authorized to process personal data are bound by confidentiality obligations
          and are granted access on a need-to-know basis.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security measures">
        <p>
          Rundesk maintains technical and organizational measures appropriate to the risk, including multi-tenant
          isolation, role-based access controls, audit logging, hashed credentials, and encrypted transport. These are
          described in detail on our <a href="/trust">Trust &amp; Security</a> page and form part of this DPA.
        </p>
      </LegalSection>

      <LegalSection heading="7. Sub-processing">
        <p>
          The customer authorizes Rundesk to engage the sub-processors listed in the Annex. Rundesk imposes
          data-protection obligations on each sub-processor no less protective than this DPA and remains responsible for
          their performance. Rundesk will give notice before adding or replacing a sub-processor so the customer may
          object on reasonable data-protection grounds.
        </p>
      </LegalSection>

      <LegalSection heading="8. Data subject requests">
        <p>
          Taking into account the nature of the processing, Rundesk assists the customer in responding to data-subject
          requests. The service provides self-service tools for access, portability, and erasure (data export and
          account deletion), and Rundesk will provide reasonable additional assistance where a request cannot be
          fulfilled through those tools.
        </p>
      </LegalSection>

      <LegalSection heading="9. Personal data breach">
        <p>
          Rundesk will notify the customer without undue delay after becoming aware of a personal-data breach affecting
          the customer&rsquo;s data, and will provide information reasonably required for the customer to meet its own
          notification obligations.
        </p>
      </LegalSection>

      <LegalSection heading="10. Assistance and impact assessments">
        <p>
          Rundesk will provide reasonable assistance with data-protection impact assessments and prior consultations
          with supervisory authorities, taking into account the information available to Rundesk.
        </p>
      </LegalSection>

      <LegalSection heading="11. International transfers">
        <p>
          Where processing involves transferring personal data outside the EEA, UK, or other restricted region, the
          parties rely on an appropriate transfer mechanism such as the Standard Contractual Clauses, which are
          incorporated by reference.
        </p>
      </LegalSection>

      <LegalSection heading="12. Return and deletion">
        <p>
          On termination, and at the customer&rsquo;s choice, Rundesk will delete or return the personal data it
          processes and delete existing copies, except where retention is required by law. Account holders can trigger
          erasure of their personal data directly from the product at any time.
        </p>
      </LegalSection>

      <LegalSection heading="13. Audits">
        <p>
          Rundesk makes available information reasonably necessary to demonstrate compliance with this DPA and, on
          reasonable notice and subject to confidentiality, will contribute to audits conducted by the customer or an
          independent auditor.
        </p>
      </LegalSection>

      <LegalSection heading="Annex — Details of processing">
        <p>
          <strong>Subject matter &amp; nature:</strong> hosting and processing of workspace content to provide a
          work-management platform (tasks, documents, chat, time tracking, reporting, automations, and related
          features).
        </p>
        <p>
          <strong>Categories of data subjects:</strong> the customer&rsquo;s users, collaborators, and any individuals
          referenced in Customer Content.
        </p>
        <p>
          <strong>Categories of personal data:</strong> identifiers (name, email), profile and authentication data,
          content authored by users, and usage/technical logs.
        </p>
        <p>
          <strong>Sub-processors:</strong>
        </p>
        <LegalList
          items={[
            'Cloud hosting and managed database infrastructure.',
            'Transactional email delivery.',
            'Large-language-model provider (AI features).',
            'Error monitoring and product analytics.',
            'Payment processor (paid plans).',
          ]}
        />
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          For DPA questions or to submit a signed copy, contact{' '}
          <a href="mailto:privacy@rundesk.com">privacy@rundesk.com</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
