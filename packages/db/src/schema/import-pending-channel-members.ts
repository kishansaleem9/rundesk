import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'
import { chatChannels } from './chat'
import { clickupImportJobs } from './clickup-import-jobs'

/**
 * A CHAT CHANNEL'S PLACE KEPT FOR SOMEBODY INVITED (`found-14-oct/clickup-import-rest-unimported`).
 *
 * An import brings a ClickUp Workspace's channels and direct messages with the
 * people who were in them. Somebody the run invited is not a member yet, and a
 * channel's member is a member, so their place in it is held here by the
 * address the invitation went to, and made theirs when they accept it
 * (`InvitationsService.claim`), as their held tasks and time are
 * (`import_pending_assignees`, `import_pending_time_entries`). A private
 * channel or a direct message is read only by its members, so without this the
 * people it was between would never see it. A channel deleted meanwhile takes
 * its rows with it.
 */
export const importPendingChannelMembers = pgTable(
  'import_pending_channel_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Lower case, as the invitation keeps it. */
    email: text('email').notNull(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => clickupImportJobs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    once: unique('uq_import_pending_channel_members').on(t.workspaceId, t.email, t.channelId),
    byEmail: index('idx_import_pending_channel_members_email').on(t.workspaceId, t.email),
  }),
)
