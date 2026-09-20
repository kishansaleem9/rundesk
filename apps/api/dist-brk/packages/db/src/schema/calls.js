"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callTranscriptLinesRelations = exports.callRecordingsRelations = exports.callRecordings = exports.callTranscriptLines = exports.callParticipantsRelations = exports.callsRelations = exports.callParticipants = exports.calls = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const chat_1 = require("./chat");
const meetings_1 = require("./meetings");
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
exports.calls = (0, pg_core_1.pgTable)('calls', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    /** Where it was started from — "Every SyncUp has a thread" [20:31]. */
    channelId: (0, pg_core_1.uuid)('channel_id').references(() => chat_1.chatChannels.id, { onDelete: 'cascade' }),
    startedById: (0, pg_core_1.uuid)('started_by_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.text)('title'),
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null while live. The one column that says whether this call is happening. */
    endedAt: (0, pg_core_1.timestamp)('ended_at', { withTimezone: true }),
    /**
     * Recording is OFF unless someone turns it on, and turning it on announces
     * itself to everyone in the call. Consent is not a preference in two-party
     * jurisdictions, so it is not modelled as one: this column exists to be
     * shown, not to be quietly true.
     */
    recording: (0, pg_core_1.boolean)('recording').notNull().default(false),
    recordingStartedAt: (0, pg_core_1.timestamp)('recording_started_at', { withTimezone: true }),
    /** The record this call left behind, filled when it ends. */
    meetingId: (0, pg_core_1.uuid)('meeting_id').references(() => meetings_1.meetings.id, { onDelete: 'set null' }),
    /**
     * §2.8 gap 10 — where the recording lives while the call is still running.
     *
     * `meetings.recordingUrl` is the permanent home, but the meeting record
     * does not exist until the call ends, and an upload that finished before
     * then must not be homeless.
     */
    recordingStorageKey: (0, pg_core_1.text)('recording_storage_key'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // "Is there a live call in this channel" is the question the channel header
    // asks on every render, so it is the one that gets an index.
    (0, pg_core_1.index)('idx_calls_channel_live').on(t.channelId, t.endedAt),
    /*
     * At most ONE live call per channel — see 0111.
     *
     * This has to be declared HERE and not only in the migration. A fresh
     * database is created by `drizzle-kit push` from this file and the whole
     * migration journal is then marked applied (deploy/deploy.sh
     * bootstrap_fresh_schema, `pnpm db:setup`), so 0111's SQL never runs on a
     * new install. An index that lives only in a migration is an index that
     * every new deployment silently lacks — and start()'s
     * `onConflictDoNothing` is a no-op without it, which is exactly the race
     * it was written to close.
     */
    (0, pg_core_1.uniqueIndex)('uq_calls_one_live_per_channel')
        .on(t.channelId)
        .where((0, drizzle_orm_1.sql) `${t.endedAt} is null and ${t.channelId} is not null`),
    (0, pg_core_1.index)('idx_calls_workspace').on(t.workspaceId, t.startedAt),
]);
exports.callParticipants = (0, pg_core_1.pgTable)('call_participants', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    callId: (0, pg_core_1.uuid)('call_id').notNull().references(() => exports.calls.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: (0, pg_core_1.timestamp)('left_at', { withTimezone: true }),
    /**
     * Whether this person was present while recording was on. Kept per person
     * rather than inferred from timestamps, because "was I recorded" is a
     * question someone may ask months later and timestamps drift in meaning
     * when a recording is stopped and restarted.
     */
    wasRecorded: (0, pg_core_1.boolean)('was_recorded').notNull().default(false),
}, (t) => [
    // One row per person per call; rejoining reuses it rather than stacking.
    (0, pg_core_1.unique)('uq_call_participants_call_user').on(t.callId, t.userId),
    (0, pg_core_1.index)('idx_call_participants_call').on(t.callId),
]);
exports.callsRelations = (0, drizzle_orm_1.relations)(exports.calls, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.calls.workspaceId], references: [workspaces_1.workspaces.id] }),
    channel: one(chat_1.chatChannels, { fields: [exports.calls.channelId], references: [chat_1.chatChannels.id] }),
    startedBy: one(users_1.users, { fields: [exports.calls.startedById], references: [users_1.users.id] }),
    meeting: one(meetings_1.meetings, { fields: [exports.calls.meetingId], references: [meetings_1.meetings.id] }),
    participants: many(exports.callParticipants),
}));
exports.callParticipantsRelations = (0, drizzle_orm_1.relations)(exports.callParticipants, ({ one }) => ({
    call: one(exports.calls, { fields: [exports.callParticipants.callId], references: [exports.calls.id] }),
    user: one(users_1.users, { fields: [exports.callParticipants.userId], references: [users_1.users.id] }),
}));
/**
 * §2.8 gap 10 — the call's transcript, one utterance at a time.
 *
 *   "main record karoongi aur yeh aap ke khud hi NOTES bana ke dega"
 *   `[20:42]`
 *
 * A line per utterance, attributed to whoever said it. Attribution is the whole
 * reason this is a table rather than a text column on the call: "Hamda said
 * she would send the deck" is a useful note and "somebody said they would send
 * the deck" is not.
 *
 * Written live, so a call that crashes halfway still leaves the half it heard —
 * and so the notes at the end are written from something real rather than from
 * a recording nobody has transcribed yet.
 */
exports.callTranscriptLines = (0, pg_core_1.pgTable)('call_transcript_lines', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    callId: (0, pg_core_1.uuid)('call_id').notNull().references(() => exports.calls.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    text: (0, pg_core_1.text)('text').notNull(),
    saidAt: (0, pg_core_1.timestamp)('said_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // The only way this is ever read: everything for one call, in order.
    (0, pg_core_1.index)('call_transcript_lines_call_idx').on(t.callId, t.saidAt),
]);
/**
 * §2.8 — one piece of a call's recording.
 *
 * Recording is a toggle, so a call can be recorded, stopped for a private
 * aside, and recorded again. Each stop produces its own file. A single key on
 * the call meant the second upload overwrote the first and the earlier audio
 * stayed in storage with nothing pointing at it.
 *
 * Append-only. `position` orders them for playback and is not assumed
 * contiguous: a failed upload leaves a gap, and inventing one would
 * misrepresent what was actually captured.
 */
exports.callRecordings = (0, pg_core_1.pgTable)('call_recordings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    callId: (0, pg_core_1.uuid)('call_id').notNull().references(() => exports.calls.id, { onDelete: 'cascade' }),
    storageKey: (0, pg_core_1.text)('storage_key').notNull(),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('call_recordings_call_idx').on(t.callId, t.position),
    // Handing the same key in twice is a retry, not a second segment.
    (0, pg_core_1.unique)('uq_call_recordings_key').on(t.callId, t.storageKey),
    // And two segments cannot claim the same place in the order — see 0112.
    // Positions are not assumed contiguous (a failed upload leaves a gap), but
    // they are assumed to mean something, which requires them to be distinct.
    (0, pg_core_1.unique)('uq_call_recordings_position').on(t.callId, t.position),
]);
exports.callRecordingsRelations = (0, drizzle_orm_1.relations)(exports.callRecordings, ({ one }) => ({
    call: one(exports.calls, { fields: [exports.callRecordings.callId], references: [exports.calls.id] }),
}));
exports.callTranscriptLinesRelations = (0, drizzle_orm_1.relations)(exports.callTranscriptLines, ({ one }) => ({
    call: one(exports.calls, { fields: [exports.callTranscriptLines.callId], references: [exports.calls.id] }),
    user: one(users_1.users, { fields: [exports.callTranscriptLines.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=calls.js.map