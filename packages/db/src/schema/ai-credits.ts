import { pgTable, uuid, text, integer, timestamp, date, index, primaryKey, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * AI CREDITS BOUGHT (`commit-log/log-3943965-1`, `ledger-rows/row-869`).
 *
 * ClickUp: an admin adds credits from the AI dashboard — a suggested amount or
 * a custom one — and checks out; credits are a tenth of a cent each, sold in
 * $10 packs of 10,000. A purchase is `pending` from its checkout until the
 * payment provider says it was paid, and counts only then — toward the month
 * it was paid in, as a month's credits do not roll over.
 */
export const aiCreditPurchases = pgTable(
  'ai_credit_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    credits: integer('credits').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** `pending` until the provider confirms the payment, then `paid`. */
    status: text('status').notNull().default('pending'),
    /** The provider's checkout session, which its webhook names. */
    checkoutSessionId: text('checkout_session_id').unique(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_ai_credit_purchases_workspace').on(t.workspaceId, t.paidAt),
    check('ai_credit_purchases_status_check', sql`${t.status} IN ('pending', 'paid')`),
    check('ai_credit_purchases_credits_check', sql`${t.credits} > 0`),
  ],
)

export const aiCreditPurchasesRelations = relations(aiCreditPurchases, ({ one }) => ({
  workspace: one(workspaces, { fields: [aiCreditPurchases.workspaceId], references: [workspaces.id] }),
}))

/**
 * A FREE PLAN'S USES OF A PAID FEATURE (`ledger-rows/row-788`).
 *
 * ClickUp gives its Free plan a number of uses of some paid features; they add
 * up over the workspace's life, never reset, and once spent the feature is
 * refused — nothing made with it is lost. A use here is a member's day with
 * the feature: the plan guard writes one row the first time a member uses it
 * on a day, so a view that refreshes, or a second export, takes no other use.
 */
export const planFeatureUses = pgTable(
  'plan_feature_uses',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The UTC day of the use. */
    day: date('day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.feature, t.userId, t.day], name: 'plan_feature_uses_pkey' })],
)
