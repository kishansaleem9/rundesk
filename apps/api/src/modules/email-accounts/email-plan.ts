import type { PlanId } from '../plans/plans.constants'

/**
 * WHAT A PLAN GIVES OF CLICKUP'S EMAIL (`found-9-oct/task-email-sends-from-the-server`).
 *
 * ClickUp (help centre, "Use Email in ClickUp", "Schedule comments and emails";
 * read through search excerpts, 9 and 12 October): Free Forever has one email
 * account with 100 uses; Unlimited one account with no cap; Business and above
 * two, with signatures and templates; scheduling an email is Unlimited and
 * above. Here Pro is ClickUp's Unlimited, and Enterprise, as every limit of it
 * is, has no cap. A use is an email sent from a linked account.
 */
export type EmailPlan = {
  /** Mailboxes the workspace may link; null for no cap. */
  accounts: number | null
  /** Emails each may send; null for no cap. */
  uses: number | null
  scheduling: boolean
  signaturesAndTemplates: boolean
}

export const EMAIL_PLANS: Record<PlanId, EmailPlan> = {
  free: { accounts: 1, uses: 100, scheduling: false, signaturesAndTemplates: false },
  pro: { accounts: 1, uses: null, scheduling: true, signaturesAndTemplates: false },
  business: { accounts: 2, uses: null, scheduling: true, signaturesAndTemplates: true },
  enterprise: { accounts: null, uses: null, scheduling: true, signaturesAndTemplates: true },
}

/** What is refused, in the words the composer and the settings show. */
export const EMAIL_PLAN_REFUSALS = {
  accounts: (plan: string, n: number) =>
    `${plan} includes ${n === 1 ? 'one email account' : `${n} email accounts`}, and this workspace has linked ${n === 1 ? 'it' : 'them'}. Remove one, or upgrade, to link another.`,
  uses: (plan: string, n: number) => `This email account has used its ${n} emails on ${plan}. Upgrade to keep sending from it.`,
  scheduling: (plan: string) => `Scheduling an email is on Pro and above; ${plan} sends it now.`,
  signaturesAndTemplates: (plan: string) => `Email signatures and templates are on Business and above, not ${plan}.`,
} as const
