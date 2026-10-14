import { pgTable, text, timestamp, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { tasks } from './tasks'

/**
 * A meeting that happened, rather than a link to one that was about to.
 *
 * Starting a meeting from a task already worked; what was missing was anything
 * left behind afterwards. Without a row here the AI could extract action items
 * from notes but had nowhere to keep the notes, who was there, or the recording
 * — so the loop ran and forgot.
 */
export const meetings = pgTable(
  'meetings',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    title:        text('title').notNull(),
    startsAt:     timestamp('starts_at', { withTimezone: true }),
    endsAt:       timestamp('ends_at', { withTimezone: true }),
    /** 'manual' covers a meeting held elsewhere and written up here; 'teams' a Teams meeting the AI Notetaker joined. */
    provider:     text('provider').$type<'zoom' | 'google_meet' | 'teams' | 'manual'>().notNull().default('manual'),
    joinUrl:      text('join_url'),
    recordingUrl: text('recording_url'),
    /*
   * §A6 [19:16–19:20] — the "Tags:" chips in the meeting-notes toolbar.
   *
   * Free labels somebody applies to their own notes, read only to filter.
   * Modelled as text[] after chat_message_saves.tags rather than as workspace
   * labels: those carry colours, an admin surface and a shared vocabulary,
   * which is a heavier promise than this needs.
   */
  tags:       text('tags').array().notNull().default([]),
  notes:        text('notes'),
    transcript:   text('transcript'),
    /** SET NULL: deleting the task must not delete the record of the conversation. */
    taskId:       uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdById:  uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meetings_workspace_idx').on(t.workspaceId),
    index('meetings_workspace_start_idx').on(t.workspaceId, t.startsAt),
    index('meetings_task_idx').on(t.taskId),
    // Made by 0127. Declared here as well: a database built by
    // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
    index('idx_meetings_tags').using('gin', t.tags),
  ],
)

/** Who was in the room. A member by id, or an outsider by name and email. */
export const meetingAttendees = pgTable(
  'meeting_attendees',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email:     text('email'),
    name:      text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meeting_attendees_meeting_idx').on(t.meetingId),
    // Partial: the outsider half of the table has no user_id to be unique on.
    uniqueIndex('uq_meeting_attendee_user').on(t.meetingId, t.userId).where(sql`${t.userId} is not null`),
  ],
)

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [meetings.workspaceId], references: [workspaces.id] }),
  task:      one(tasks, { fields: [meetings.taskId], references: [tasks.id] }),
  creator:   one(users, { fields: [meetings.createdById], references: [users.id] }),
  attendees: many(meetingAttendees),
}))

export const meetingAttendeesRelations = relations(meetingAttendees, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingAttendees.meetingId], references: [meetings.id] }),
  user:    one(users, { fields: [meetingAttendees.userId], references: [users.id] }),
}))
