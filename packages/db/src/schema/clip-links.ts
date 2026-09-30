import { pgTable, text, timestamp, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * A CLIP'S LINK: one stable, unguessable token per clip, which the app route
 * `/clips/<token>` turns into a freshly signed playback URL on every view
 * (`resume-defects/resume-7`).
 *
 * Copy link and New tab handed out the signed storage URL itself, asked for a
 * day, and nothing said it would die. ClickUp's clip URL is "an unguessable,
 * randomized string of characters", anyone with it can watch, and a clip is
 * kept until it is deleted. A clip is still a storage object and nothing else
 * (`clips/clip-keys.ts`), so the link is keyed by the object's key: made the
 * first time somebody asks for it, the same one every time after, and deleted
 * with the clip. Section 4's clips table (`resume-defects/s4-clip-link`) is
 * where a clip's title and duration would move; this holds only the link.
 */
export const clipLinks = pgTable(
  'clip_links',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // `workspaces/<ws>/clips/<one safe segment>`, checked by shape before a row is made.
    storageKey:  text('storage_key').notNull(),
    // 24 random bytes, base64url: 32 characters.
    token:       text('token').notNull(),
    // Who asked for the link first. Not the recorder: that is the object's metadata.
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique:      uniqueIndex('clip_links_token_unique').on(t.token),
    storageKeyUnique: uniqueIndex('clip_links_storage_key_unique').on(t.storageKey),
    workspaceIdx:     index('clip_links_workspace_idx').on(t.workspaceId),
  }),
)
