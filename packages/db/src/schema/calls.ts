import { pgTable, text, timestamp, uuid, boolean, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { chatChannels } from './chat'
import { meetings } from './meetings'

/**
 * §2.8 SyncUp — calls inside the app, `[19:16–21:15]`.
 *
 * A call is a live thing; a meeting is the record it leaves behind. They are
 * separate rows on purpose: `meetings` already exists and already carries
 * notes, attendees, action items and a recording URL, so a call that ends
 * should FILL one rather than inventing a parallel history nobody can search.
 *
 * Signalling is peer-to-peer over the Socket.io gateway Rundesk already runs.
 * No media passes through the server, which is why this needs no SFU and no
 * third-party service — and also why it is honest about its limits: beyond a
 * handful of people, or on a network that needs TURN, it will say so rather
 * than half-work.
 */
export const calls = pgTable(
  'calls',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Where it was started from — "Every SyncUp has a thread" [20:31]. */
    channelId:   uuid('channel_id').references(() => chatChannels.id, { onDelete: 'cascade' }),
    startedById: uuid('started_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title:       text('title'),
    startedAt:   timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null while live. The one column that says whether this call is happening. */
    endedAt:     timestamp('ended_at', { withTimezone: true }),
    /**
     * Recording is OFF unless someone turns it on, and turning it on announces
     * itself to everyone in the call. Consent is not a preference in two-party
     * jurisdictions, so it is not modelled as one: this column exists to be
     * shown, not to be quietly true.
     */
    recording:   boolean('recording').notNull().default(false),
    recordingStartedAt: timestamp('recording_started_at', { withTimezone: true }),
    /** The record this call left behind, filled when it ends. */
    meetingId:   uuid('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "Is there a live call in this channel" is the question the channel header
    // asks on every render, so it is the one that gets an index.
    index('idx_calls_channel_live').on(t.channelId, t.endedAt),
    index('idx_calls_workspace').on(t.workspaceId, t.startedAt),
  ],
)

export const callParticipants = pgTable(
  'call_participants',
  {
    id:       uuid('id').primaryKey().defaultRandom(),
    callId:   uuid('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
    userId:   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt:   timestamp('left_at', { withTimezone: true }),
    /**
     * Whether this person was present while recording was on. Kept per person
     * rather than inferred from timestamps, because "was I recorded" is a
     * question someone may ask months later and timestamps drift in meaning
     * when a recording is stopped and restarted.
     */
    wasRecorded: boolean('was_recorded').notNull().default(false),
  },
  (t) => [
    // One row per person per call; rejoining reuses it rather than stacking.
    unique('uq_call_participants_call_user').on(t.callId, t.userId),
    index('idx_call_participants_call').on(t.callId),
  ],
)

export const callsRelations = relations(calls, ({ one, many }) => ({
  workspace:   one(workspaces, { fields: [calls.workspaceId], references: [workspaces.id] }),
  channel:     one(chatChannels, { fields: [calls.channelId], references: [chatChannels.id] }),
  startedBy:   one(users, { fields: [calls.startedById], references: [users.id] }),
  meeting:     one(meetings, { fields: [calls.meetingId], references: [meetings.id] }),
  participants: many(callParticipants),
}))

export const callParticipantsRelations = relations(callParticipants, ({ one }) => ({
  call: one(calls, { fields: [callParticipants.callId], references: [calls.id] }),
  user: one(users, { fields: [callParticipants.userId], references: [users.id] }),
}))
