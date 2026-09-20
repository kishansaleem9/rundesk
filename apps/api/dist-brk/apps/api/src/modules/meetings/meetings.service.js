"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingsService = void 0;
exports.normalizeMeetingTags = normalizeMeetingTags;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const public_user_1 = require("../../common/permissions/public-user");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const origin_1 = require("../../common/task-types/origin");
const ai_service_1 = require("../ai/ai.service");
const r2_service_1 = require("../../common/storage/r2.service");
const tasks_service_1 = require("../tasks/tasks.service");
const MAX_TITLE = 300;
/**
 * Meeting records.
 *
 * Starting a meeting from a task already worked; nothing was kept afterwards.
 * This is the record — who was there, what was said, where the recording is —
 * so the notes the AI can already read have somewhere to live, and the action
 * items it extracts can be turned into real tasks against a real meeting.
 */
/**
 * §A6 [19:16–19:20] — the tags on a meeting note, cleaned once.
 *
 * Trimmed, de-duplicated case-insensitively (so "Standup" and "standup" are one
 * chip, not two that look identical in the toolbar), blanks dropped, and
 * bounded. A tag list is chips on a filter bar: a hundred of them, or one
 * three-thousand characters long, is not a filter any more.
 */
function normalizeMeetingTags(value) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const out = [];
    for (const raw of value) {
        if (typeof raw !== 'string')
            continue;
        const tag = raw.trim().slice(0, 40);
        if (!tag)
            continue;
        const key = tag.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(tag);
        if (out.length >= 20)
            break;
    }
    return out;
}
let MeetingsService = class MeetingsService {
    constructor(db, ai, tasksService, r2) {
        this.db = db;
        this.ai = ai;
        this.tasksService = tasksService;
        this.r2 = r2;
    }
    /**
     * §2.8 gap 10 — turn a stored recording pointer into something playable.
     *
     * `recordingUrl` holds two different things and always has: a URL somebody
     * pasted in (a Zoom link, a Drive file), and — since calls started leaving
     * recordings behind — a storage key for a file we hold ourselves.
     *
     * They are safely told apart because a storage key has no scheme. That
     * matters because signing is not optional here: R2 signed URLs last fifteen
     * minutes, so a signed URL written into this column is a dead link before
     * the meeting notes have been read once. The key is what is durable; the URL
     * is made fresh on the way out, exactly as chat attachments already do.
     */
    async playableRecording(stored) {
        if (!stored)
            return null;
        if (stored.includes('://'))
            return stored;
        if (!this.r2.configured)
            return stored;
        return this.r2.getObjectUrl(stored).catch(() => null);
    }
    /**
     * §2.8 — every piece of a call's recording, playable, per meeting.
     *
     * Recording is a toggle: a call can be recorded, stopped for a private aside
     * and recorded again, and each stop produces its own file. `call_recordings`
     * has kept all of them since 0111, but nothing ever read that table — the
     * meeting still showed the single key on `meetings.recordingUrl`, so the
     * second and later pieces were bytes in storage that no route, no service
     * and no screen could reach. This is the read the table was made for.
     *
     * Reached through the call rather than through the meeting, because that is
     * the direction the link points (`calls.meeting_id`), and it means a piece
     * that finishes uploading AFTER the call ended still joins its record with
     * no backfill of its own.
     */
    async recordingsFor(meetingIds) {
        const byMeeting = new Map();
        if (!meetingIds.length)
            return byMeeting;
        const rows = await this.db
            .select({ meetingId: db_1.calls.meetingId, storageKey: db_1.callRecordings.storageKey })
            .from(db_1.callRecordings)
            .innerJoin(db_1.calls, (0, drizzle_orm_1.eq)(db_1.calls.id, db_1.callRecordings.callId))
            .where((0, drizzle_orm_1.inArray)(db_1.calls.meetingId, meetingIds))
            .orderBy((0, drizzle_orm_1.asc)(db_1.calls.meetingId), (0, drizzle_orm_1.asc)(db_1.callRecordings.position));
        for (const r of rows) {
            if (!r.meetingId)
                continue;
            const playable = await this.playableRecording(r.storageKey);
            if (!playable)
                continue;
            const list = byMeeting.get(r.meetingId) ?? [];
            list.push(playable);
            byMeeting.set(r.meetingId, list);
        }
        return byMeeting;
    }
    /**
     * A meeting on its way out: the recording pointer signed, and every piece of
     * a call recording alongside it.
     *
     * `recordingUrl` stays exactly what it was — the one link a meeting has
     * always had, whether pasted in or captured here — so nothing that reads it
     * changes meaning. `recordings` is the whole of what was captured, in order,
     * and is empty for a meeting that was never a call.
     */
    async withRecordings(rows) {
        const bySegment = await this.recordingsFor(rows.map((r) => r.id));
        return Promise.all(rows.map(async (r) => ({
            ...r,
            recordingUrl: await this.playableRecording(r.recordingUrl),
            recordings: bySegment.get(r.id) ?? [],
        })));
    }
    async assertMember(workspaceId, userId) {
        const [m] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!m)
            throw new common_1.ForbiddenException('Workspace membership required');
        return m;
    }
    /** Scoped by workspace, so an id from another tenant reads as missing. */
    async load(workspaceId, meetingId) {
        const [row] = await this.db
            .select()
            .from(db_1.meetings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.meetings.id, meetingId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Meeting not found');
        const [withSegments] = await this.withRecordings([row]);
        return withSegments;
    }
    async attendeesFor(meetingIds) {
        if (!meetingIds.length)
            return new Map();
        const rows = await this.db
            .select({
            id: db_1.meetingAttendees.id,
            meetingId: db_1.meetingAttendees.meetingId,
            email: db_1.meetingAttendees.email,
            name: db_1.meetingAttendees.name,
            user: public_user_1.PUBLIC_USER_COLUMNS,
        })
            .from(db_1.meetingAttendees)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.meetingAttendees.userId))
            .where((0, drizzle_orm_1.inArray)(db_1.meetingAttendees.meetingId, meetingIds));
        const byMeeting = new Map();
        for (const r of rows) {
            const list = byMeeting.get(r.meetingId) ?? [];
            // A member row carries a user; an outsider carries only name/email.
            list.push({ id: r.id, name: r.user?.displayName ?? r.name, email: r.user?.email ?? r.email, user: r.user?.id ? r.user : null });
            byMeeting.set(r.meetingId, list);
        }
        return byMeeting;
    }
    async list(workspaceId, userId, opts = {}) {
        await this.assertMember(workspaceId, userId);
        /*
         * §A6 [19:16–19:20] — filtered in SQL, not after the limit.
         *
         * This caps at 200. Fetching 200 and then filtering by tag in the client
         * would make a tag on the 201st meeting unreachable — the same shape as
         * the forward modal's ten-item cap, where narrowing after slicing put the
         * thing you searched for permanently out of reach.
         */
        const tag = opts.tag?.trim();
        const rows = await this.db
            .select()
            .from(db_1.meetings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), opts.taskId ? (0, drizzle_orm_1.eq)(db_1.meetings.taskId, opts.taskId) : undefined, tag ? (0, drizzle_orm_1.sql) `${db_1.meetings.tags} @> ARRAY[${tag}]::text[]` : undefined))
            // Newest first, and meetings with no start time fall back to when the
            // record was made rather than sorting to the bottom forever.
            .orderBy((0, drizzle_orm_1.desc)(db_1.meetings.startsAt), (0, drizzle_orm_1.desc)(db_1.meetings.createdAt))
            .limit(200);
        const attendees = await this.attendeesFor(rows.map((r) => r.id));
        /*
         * Signed HERE too, not only in load().
         *
         * The meetings page renders its Recording link straight from this list, and
         * a recording captured in a SyncUp is stored as a bare storage key. Handed
         * out unsigned it is not a URL at all — the browser resolves it against the
         * current page and the link 404s. Only the single-meeting read signed it,
         * so the one place recordings are actually browsed was the one place they
         * did not work.
         */
        const withRecordings = await this.withRecordings(rows);
        return withRecordings.map((r) => ({ ...r, attendees: attendees.get(r.id) ?? [] }));
    }
    /**
     * §2.8 — the "Upcoming Meetings" block, with a Join pill and a countdown.
     *
     * Split on the SERVER against `now()` rather than filtered in the browser:
     * a client clock that is wrong — a laptop woken from sleep, a machine in the
     * wrong timezone — would move a meeting between "upcoming" and "past" with
     * nothing to say it had, and the person would simply not be told about a call
     * that is about to start.
     */
    async upcoming(workspaceId, userId, now = new Date()) {
        await this.assertMember(workspaceId, userId);
        const rows = await this.db
            .select()
            .from(db_1.meetings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.meetings.startsAt, now)))
            // Soonest first: the one about to start is the one being looked for.
            .orderBy((0, drizzle_orm_1.asc)(db_1.meetings.startsAt))
            .limit(10);
        const attendees = await this.attendeesFor(rows.map((r) => r.id));
        const withRecordings = await this.withRecordings(rows);
        return withRecordings.map((r) => ({ ...r, attendees: attendees.get(r.id) ?? [] }));
    }
    /**
     * §2.8 — what the meetings ask-box answers from.
     *
     * Notes are truncated per meeting rather than the list being cut short: a
     * question like "what did I miss this week" is answered badly by three
     * meetings in full and wrongly by none of the others.
     */
    async recentForAi(workspaceId, userId, limit = 20) {
        await this.assertMember(workspaceId, userId);
        const rows = await this.db
            .select({
            id: db_1.meetings.id,
            title: db_1.meetings.title,
            startsAt: db_1.meetings.startsAt,
            notes: db_1.meetings.notes,
            createdAt: db_1.meetings.createdAt,
        })
            .from(db_1.meetings)
            .where((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.meetings.startsAt), (0, drizzle_orm_1.desc)(db_1.meetings.createdAt))
            .limit(limit);
        const attendees = await this.attendeesFor(rows.map((r) => r.id));
        return rows.map((r) => ({
            ...r,
            notes: r.notes ? r.notes.slice(0, 1200) : null,
            attendees: (attendees.get(r.id) ?? [])
                .map((a) => a.name ?? a.email ?? 'someone'),
        }));
    }
    /**
     * §2.8 — the ask-box. The membership check and the read live here; the AI
     * only sees records this person is already allowed to see.
     */
    async ask(workspaceId, userId, question) {
        const asked = (question ?? '').trim();
        if (!asked)
            throw new common_1.BadRequestException('Ask something about your meetings');
        const context = await this.recentForAi(workspaceId, userId);
        return this.ai.askAboutMeetings(asked, context, { userId, workspaceId });
    }
    async get(workspaceId, meetingId, userId) {
        await this.assertMember(workspaceId, userId);
        const row = await this.load(workspaceId, meetingId);
        const attendees = await this.attendeesFor([row.id]);
        return { ...row, attendees: attendees.get(row.id) ?? [] };
    }
    async create(workspaceId, userId, body) {
        await this.assertMember(workspaceId, userId);
        const title = (body.title ?? '').trim();
        if (!title)
            throw new common_1.BadRequestException('title is required');
        if (title.length > MAX_TITLE)
            throw new common_1.BadRequestException(`title must be ${MAX_TITLE} characters or fewer`);
        if (body.taskId)
            await this.assertTaskInWorkspace(workspaceId, body.taskId);
        const [row] = await this.db
            .insert(db_1.meetings)
            .values({
            workspaceId,
            title,
            startsAt: body.startsAt ? new Date(body.startsAt) : null,
            endsAt: body.endsAt ? new Date(body.endsAt) : null,
            provider: body.provider ?? 'manual',
            joinUrl: body.joinUrl ?? null,
            recordingUrl: body.recordingUrl ?? null,
            notes: body.notes ?? null,
            taskId: body.taskId ?? null,
            createdById: userId,
            tags: normalizeMeetingTags(body.tags),
        })
            .returning();
        // The organiser is an attendee — a meeting nobody attended is a mistake,
        // not a record.
        const ids = [...new Set([userId, ...(body.attendeeIds ?? [])])];
        await this.setAttendees(workspaceId, row.id, ids);
        return this.get(workspaceId, row.id, userId);
    }
    async assertTaskInWorkspace(workspaceId, taskId) {
        const [t] = await this.db
            .select({ id: db_1.tasks.id })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
            .limit(1);
        if (!t)
            throw new common_1.NotFoundException('Task not found in this workspace');
    }
    /** Replace the member attendee set. Outsiders are added separately. */
    async setAttendees(workspaceId, meetingId, userIds) {
        if (!userIds.length)
            return;
        const members = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.userId, userIds)));
        const valid = members.map((m) => m.userId);
        if (!valid.length)
            return;
        await this.db
            .insert(db_1.meetingAttendees)
            .values(valid.map((uid) => ({ meetingId, userId: uid })))
            .onConflictDoNothing();
    }
    async update(workspaceId, meetingId, userId, body) {
        await this.assertMember(workspaceId, userId);
        await this.load(workspaceId, meetingId);
        const set = { updatedAt: new Date() };
        // Absent means "leave the tags alone"; an empty array means "remove them
        // all", which is a real answer. Conflating the two is how a clear becomes
        // impossible — the defect this repo already fixed on nav favourites.
        if (body.tags !== undefined)
            set.tags = normalizeMeetingTags(body.tags);
        if (body.title !== undefined) {
            const t = body.title.trim();
            if (!t)
                throw new common_1.BadRequestException('title cannot be empty');
            set.title = t.slice(0, MAX_TITLE);
        }
        for (const k of ['notes', 'transcript', 'recordingUrl']) {
            if (body[k] !== undefined)
                set[k] = body[k];
        }
        if (body.startsAt !== undefined)
            set.startsAt = body.startsAt ? new Date(body.startsAt) : null;
        if (body.endsAt !== undefined)
            set.endsAt = body.endsAt ? new Date(body.endsAt) : null;
        await this.db
            .update(db_1.meetings)
            .set(set)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.meetings.id, meetingId)));
        return this.get(workspaceId, meetingId, userId);
    }
    async remove(workspaceId, meetingId, userId) {
        await this.assertMember(workspaceId, userId);
        await this.load(workspaceId, meetingId);
        await this.db.delete(db_1.meetings).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.meetings.id, meetingId)));
        return { ok: true };
    }
    async addAttendee(workspaceId, meetingId, userId, body) {
        await this.assertMember(workspaceId, userId);
        await this.load(workspaceId, meetingId);
        if (body.userId) {
            await this.setAttendees(workspaceId, meetingId, [body.userId]);
        }
        else {
            const email = (body.email ?? '').trim();
            if (!email)
                throw new common_1.BadRequestException('userId or email is required');
            await this.db.insert(db_1.meetingAttendees).values({ meetingId, email, name: (body.name ?? '').trim() || null });
        }
        return this.get(workspaceId, meetingId, userId);
    }
    async removeAttendee(workspaceId, meetingId, attendeeId, userId) {
        await this.assertMember(workspaceId, userId);
        await this.load(workspaceId, meetingId);
        const [row] = await this.db
            .delete(db_1.meetingAttendees)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetingAttendees.meetingId, meetingId), (0, drizzle_orm_1.eq)(db_1.meetingAttendees.id, attendeeId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Attendee not found');
        return { ok: true };
    }
    /**
     * What two people share: the meetings they both attended, and the open tasks
     * either of them is assigned to.
     *
     * This is what sits behind a DM's Calendar and Tasks tabs. A DM is the one
     * place where "what are we both on?" is the actual question, and answering it
     * needed no new storage — meetings know their attendees and tasks know their
     * assignees, so it is two joins rather than a new concept.
     */
    async sharedWith(workspaceId, otherUserId, userId) {
        await this.assertMember(workspaceId, userId);
        if (otherUserId === userId)
            throw new common_1.BadRequestException('Pick someone other than yourself');
        const other = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, otherUserId)))
            .limit(1);
        if (!other.length)
            throw new common_1.NotFoundException('That person is not in this workspace');
        // Meetings both of us attended: two passes over the attendee table rather
        // than a self-join, which keeps the "both" condition obvious.
        const mine = await this.db
            .select({ meetingId: db_1.meetingAttendees.meetingId })
            .from(db_1.meetingAttendees)
            .innerJoin(db_1.meetings, (0, drizzle_orm_1.eq)(db_1.meetings.id, db_1.meetingAttendees.meetingId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.meetingAttendees.userId, userId)));
        const theirs = await this.db
            .select({ meetingId: db_1.meetingAttendees.meetingId })
            .from(db_1.meetingAttendees)
            .where((0, drizzle_orm_1.eq)(db_1.meetingAttendees.userId, otherUserId));
        const theirSet = new Set(theirs.map((r) => r.meetingId));
        const bothIds = [...new Set(mine.map((r) => r.meetingId))].filter((id) => theirSet.has(id));
        const sharedMeetings = bothIds.length
            ? await this.db
                .select({
                id: db_1.meetings.id,
                title: db_1.meetings.title,
                startsAt: db_1.meetings.startsAt,
                endsAt: db_1.meetings.endsAt,
                provider: db_1.meetings.provider,
                recordingUrl: db_1.meetings.recordingUrl,
            })
                .from(db_1.meetings)
                .where((0, drizzle_orm_1.inArray)(db_1.meetings.id, bothIds))
                .orderBy((0, drizzle_orm_1.desc)(db_1.meetings.startsAt), (0, drizzle_orm_1.desc)(db_1.meetings.createdAt))
                .limit(100)
            : [];
        // Open tasks either of us is assigned to, scoped to this workspace and to
        // what the caller is allowed to see.
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, userId);
        const visible = await (0, item_visibility_1.taskVisibilityFilter)(this.db, userId, isManager);
        const sharedTasks = await this.db
            .selectDistinctOn([db_1.tasks.id], {
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            dueDate: db_1.tasks.dueDate,
            listId: db_1.tasks.listId,
            assigneeId: db_1.taskAssignees.userId,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.taskAssignees, (0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, db_1.tasks.id))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), 
        // Still open — the tab answers "what are we both on?", and everything
        // we ever finished together is a different, much longer question.
        (0, drizzle_orm_1.ne)(db_1.tasks.statusCategory, 'closed'), (0, drizzle_orm_1.inArray)(db_1.taskAssignees.userId, [userId, otherUserId]), visible))
            .limit(100);
        return { meetings: sharedMeetings, tasks: sharedTasks };
    }
    /**
     * Pull action items out of this meeting's notes.
     *
     * The extraction already existed but had no meeting to read from, so the
     * caller had to paste the notes in and the result belonged to nothing. With
     * `createIn` the items become real tasks in a list, which is the half that
     * makes the loop close.
     */
    async extractActionItems(workspaceId, meetingId, userId, opts = {}) {
        await this.assertMember(workspaceId, userId);
        const meeting = await this.load(workspaceId, meetingId);
        const source = (meeting.notes ?? '').trim() || (meeting.transcript ?? '').trim();
        if (!source)
            throw new common_1.BadRequestException('This meeting has no notes or transcript to read');
        if (!this.ai.isAvailable())
            throw new common_1.BadRequestException('AI features are not configured');
        const extracted = await this.ai.extractTasksFromNotes(source, { userId, workspaceId });
        const items = Array.isArray(extracted)
            ? extracted
            : extracted?.tasks ?? [];
        if (!opts.createIn)
            return { items, created: [] };
        // Creating them is what turns a summary into work someone will see.
        // Every one carries where it came from — appended rather than used as a
        // fallback, or an item the AI described loses the link to the call and
        // "which meeting was this from?" stops having an answer.
        const origin = `From meeting: ${meeting.title}`;
        /*
         * §V2-04 — and say it on the task itself, not only in its description.
         *
         * `[03:26]` names MEETING NOTE as a task type: the type is where a task
         * came from. The line appended above is prose a person has to read; this is
         * what the type filter and the list badge can see.
         *
         * Resolved once rather than per item — the type cannot change mid-loop, and
         * a meeting can yield a dozen action items.
         */
        const meetingTypeId = await (0, origin_1.taskTypeIdForOrigin)(this.db, workspaceId, 'meeting');
        const created = [];
        for (const item of items) {
            const title = (item?.title ?? '').trim();
            if (!title)
                continue;
            const described = (item.description ?? '').trim();
            const task = await this.tasksService.createTask({
                listId: opts.createIn,
                title,
                description: described ? `${described}\n\n${origin}` : origin,
                createdById: userId,
                taskTypeId: meetingTypeId,
            });
            // createTask can return null when the list rejects the write; skip
            // rather than reporting a task that was never made.
            if (task?.id)
                created.push({ id: task.id, title: task.title });
        }
        return { items, created };
    }
};
exports.MeetingsService = MeetingsService;
exports.MeetingsService = MeetingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, ai_service_1.AiService,
        tasks_service_1.TasksService,
        r2_service_1.R2Service])
], MeetingsService);
//# sourceMappingURL=meetings.service.js.map