"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meetingAttendeesRelations = exports.meetingsRelations = exports.meetingAttendees = exports.meetings = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const tasks_1 = require("./tasks");
/**
 * A meeting that happened, rather than a link to one that was about to.
 *
 * Starting a meeting from a task already worked; what was missing was anything
 * left behind afterwards. Without a row here the AI could extract action items
 * from notes but had nowhere to keep the notes, who was there, or the recording
 * — so the loop ran and forgot.
 */
exports.meetings = (0, pg_core_1.pgTable)('meetings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.text)('title').notNull(),
    startsAt: (0, pg_core_1.timestamp)('starts_at', { withTimezone: true }),
    endsAt: (0, pg_core_1.timestamp)('ends_at', { withTimezone: true }),
    /** 'manual' covers a meeting held elsewhere and written up here. */
    provider: (0, pg_core_1.text)('provider').$type().notNull().default('manual'),
    joinUrl: (0, pg_core_1.text)('join_url'),
    recordingUrl: (0, pg_core_1.text)('recording_url'),
    /*
   * §A6 [19:16–19:20] — the "Tags:" chips in the meeting-notes toolbar.
   *
   * Free labels somebody applies to their own notes, read only to filter.
   * Modelled as text[] after chat_message_saves.tags rather than as workspace
   * labels: those carry colours, an admin surface and a shared vocabulary,
   * which is a heavier promise than this needs.
   */
    tags: (0, pg_core_1.text)('tags').array().notNull().default([]),
    notes: (0, pg_core_1.text)('notes'),
    transcript: (0, pg_core_1.text)('transcript'),
    /** SET NULL: deleting the task must not delete the record of the conversation. */
    taskId: (0, pg_core_1.uuid)('task_id').references(() => tasks_1.tasks.id, { onDelete: 'set null' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('meetings_workspace_idx').on(t.workspaceId),
    (0, pg_core_1.index)('meetings_workspace_start_idx').on(t.workspaceId, t.startsAt),
    (0, pg_core_1.index)('meetings_task_idx').on(t.taskId),
]);
/** Who was in the room. A member by id, or an outsider by name and email. */
exports.meetingAttendees = (0, pg_core_1.pgTable)('meeting_attendees', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    meetingId: (0, pg_core_1.uuid)('meeting_id').notNull().references(() => exports.meetings.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_1.users.id, { onDelete: 'cascade' }),
    email: (0, pg_core_1.text)('email'),
    name: (0, pg_core_1.text)('name'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('meeting_attendees_meeting_idx').on(t.meetingId),
    // Partial: the outsider half of the table has no user_id to be unique on.
    (0, pg_core_1.uniqueIndex)('uq_meeting_attendee_user').on(t.meetingId, t.userId).where((0, drizzle_orm_1.sql) `${t.userId} is not null`),
]);
exports.meetingsRelations = (0, drizzle_orm_1.relations)(exports.meetings, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.meetings.workspaceId], references: [workspaces_1.workspaces.id] }),
    task: one(tasks_1.tasks, { fields: [exports.meetings.taskId], references: [tasks_1.tasks.id] }),
    creator: one(users_1.users, { fields: [exports.meetings.createdById], references: [users_1.users.id] }),
    attendees: many(exports.meetingAttendees),
}));
exports.meetingAttendeesRelations = (0, drizzle_orm_1.relations)(exports.meetingAttendees, ({ one }) => ({
    meeting: one(exports.meetings, { fields: [exports.meetingAttendees.meetingId], references: [exports.meetings.id] }),
    user: one(users_1.users, { fields: [exports.meetingAttendees.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=meetings.js.map