import { pgTable, text, timestamp, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { meetings } from './meetings'
import { userCalendarAccounts } from './calendar-accounts'

/**
 * THE AI NOTETAKER'S VISITS (`commit-log/log-39863ff-1`).
 *
 * ClickUp's AI Notetaker joins a Zoom, Google Meet or Teams meeting — sent by
 * its link, or to every meeting with one on the calendars a person tells it to
 * join — records it, and leaves notes and a transcript behind (its help centre,
 * "Use AI Notetaker to take notes and record meetings", through search
 * excerpts). Here the bot is a meeting-bot service's (Recall.ai's), and each
 * row is one visit: whose it is, the meeting, where the visit stands, and the
 * meeting record its notes became.
 *
 * `status`: scheduled → joining → waiting (a waiting room) → recording →
 * processing → writing (the notes are being written here) → done; or failed,
 * or cancelled. A calendar's meeting is visited once: (user, event) is unique,
 * so a visit cancelled stays cancelled rather than being scheduled again by
 * the next look at the calendar.
 */
export type NotetakerStatus =
  | 'scheduled'
  | 'joining'
  | 'waiting'
  | 'recording'
  | 'processing'
  | 'writing'
  | 'done'
  | 'failed'
  | 'cancelled'

export const notetakerBots = pgTable(
  'notetaker_bots',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Whose notetaker: who sent it, or whose calendar the meeting is on. Theirs alone to see and to call back. */
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    meetingUrl:  text('meeting_url').notNull(),
    platform:    text('platform').$type<'zoom' | 'google_meet' | 'teams'>().notNull(),
    /** The calendar event's title; null for a meeting sent by its link alone. */
    title:       text('title'),
    /** When it joins: the meeting's start, or null for now. */
    joinAt:      timestamp('join_at', { withTimezone: true }),
    endsAt:      timestamp('ends_at', { withTimezone: true }),
    calendarAccountId: uuid('calendar_account_id').references(() => userCalendarAccounts.id, { onDelete: 'set null' }),
    calendarEventId:   text('calendar_event_id'),
    /** The meeting-bot service's id for the bot; null until it has answered. */
    vendorBotId: text('vendor_bot_id'),
    status:      text('status').$type<NotetakerStatus>().notNull().default('scheduled'),
    /** Why it failed, or the service's last word on it. */
    statusDetail: text('status_detail'),
    /** The meeting record its notes and transcript became. */
    meetingId:   uuid('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt:  timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_notetaker_bots_owner').on(t.workspaceId, t.userId),
    index('idx_notetaker_bots_status').on(t.status),
    uniqueIndex('uq_notetaker_bots_event').on(t.userId, t.calendarEventId).where(sql`calendar_event_id is not null`),
  ],
)
