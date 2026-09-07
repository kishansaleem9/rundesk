import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * §G10 [12:16–12:20] — "someone asked for access to something".
 *
 * The `access_requested` notification kind has existed since the enum was
 * written, and was only ever emitted for FEATURE requests. Somebody who hit a
 * doc, list or space they could not see had no way to ask for it.
 *
 * Shaped after `featureFlagRequests`, and read for exactly one question: has
 * this person asked for this object lately. That is the de-dup, and it is
 * deliberately read from the ASKS rather than from the notifications they
 * produced — a notification row only exists for a recipient with in-app
 * switched on, so counting rows let an email-only owner be re-mailed on every
 * press.
 */
export const contentAccessRequests = pgTable(
  'content_access_requests',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // Kept in step with `object_shares.object_type` — a request for access is a
    // request for a share, so anything shareable has to be requestable.
    objectType:  text('object_type')
      .$type<'space' | 'folder' | 'project' | 'list' | 'task' | 'doc' | 'channel' | 'dashboard' | 'view'>()
      .notNull(),
    objectId:    uuid('object_id').notNull(),
    requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('content_access_requests_recent_idx').on(
      t.workspaceId, t.objectType, t.objectId, t.requesterId, t.createdAt,
    ),
  ],
)
