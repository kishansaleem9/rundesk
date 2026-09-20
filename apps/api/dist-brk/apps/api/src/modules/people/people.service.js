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
exports.PeopleService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const presence_service_1 = require("../presence/presence.service");
const ai_service_1 = require("../ai/ai.service");
const zone_1 = require("../../common/time/zone");
const calendar_accounts_service_1 = require("../calendar-sync/calendar-accounts.service");
const free_busy_1 = require("../calendar-sync/free-busy");
/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * > "Yeh meri PROFILE hai; yeh mujhe show karti hai ke meri ACTIVITY kya hai,
 * > meri EMAIL kya hai, mera TIME ZONE kya chal raha hai, main kis ki TEAM
 * > MEMBER hoon … meri PRIORITIES kya hain … COMMENTS … CALENDAR … aur yahan
 * > mujhe ORGANIZATION CHART show ho jayega"
 *
 * A full minute on one panel, and six of the 157 gaps live in it. What she
 * describes is not our `/app/profile`, which is an account-settings form —
 * password, sessions, 2FA, danger zone. Same word, different page.
 *
 * This module answers one question — *who is this person and what are they
 * working on* — for anybody in the workspace, about anybody in it.
 *
 * Most of the data already existed and was simply unreachable by actor:
 * activity was queryable by task, by project and workspace-wide but never by
 * who did it; the org chart was an indented text list inside Workspace
 * Settings → Members; timezone was stored, used for quiet hours, and never
 * selected by the roster read. Priorities are the only genuinely new thing,
 * because they are the only part that is a decision rather than a derivation.
 */
let PeopleService = class PeopleService {
    constructor(db, ai, 
    // §V2-14c — the calendars a person has marked as deciding when they are busy.
    calendarAccounts) {
        this.db = db;
        this.ai = ai;
        this.calendarAccounts = calendarAccounts;
    }
    /**
     * §G05 [05:40] — the standup, gathered and then written.
     *
     * Two steps kept apart on purpose. `getStandup` decides what is TRUE about
     * this person's work; the model only decides how to say it, and is handed
     * nothing but that. A summary generated from a free-text prompt would be
     * free to invent a task, and the person reading it has no way to tell.
     *
     * The data comes back alongside the prose for the same reason: the panel can
     * show the counts it is claiming, so a reader who doubts a sentence can look
     * at what it was written from.
     */
    async generateStandup(workspaceId, requesterId, userId, opts = {}) {
        const data = await this.getStandup(workspaceId, requesterId, userId, opts);
        const text = await this.ai.generateStandup(data, { userId: requesterId, workspaceId });
        return { text, data, generated: this.ai.isAvailable() };
    }
    /**
     * Both people must be in the workspace.
     *
     * A profile panel is a directory entry, so any colleague may open it — but
     * "any colleague" means exactly that, and the check is on the reader as well
     * as the subject. Without the second half, a member of workspace A could
     * read a profile from workspace B by guessing an id.
     */
    async assertBothMembers(workspaceId, requesterId, userId) {
        const rows = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.userId, [...new Set([requesterId, userId])])));
        const found = new Set(rows.map((r) => r.userId));
        if (!found.has(requesterId))
            throw new common_1.ForbiddenException('Workspace membership required');
        if (!found.has(userId))
            throw new common_1.NotFoundException('That person is not in this workspace');
    }
    /**
     * §G06 [05:43] — the panel's header and its three derived sections.
     *
     * One request rather than six. The panel opens over whatever you were doing,
     * so it has one moment to be useful; six round trips is six chances to show
     * a half-drawn card, which is the §2.9a complaint in miniature.
     */
    async getProfile(workspaceId, requesterId, userId) {
        await this.assertBothMembers(workspaceId, requesterId, userId);
        const [person] = await this.db
            .select({
            id: db_1.users.id,
            displayName: db_1.users.displayName,
            email: db_1.users.email,
            avatarUrl: db_1.users.avatarUrl,
            bio: db_1.users.bio,
            // §G06 [05:46] — "mera TIME ZONE kya chal raha hai".
            timezone: db_1.users.timezone,
            lastSeenAt: db_1.users.lastSeenAt,
            presenceStatus: db_1.users.presenceStatus,
            statusEmoji: db_1.users.statusEmoji,
            statusText: db_1.users.statusText,
            statusExpiresAt: db_1.users.statusExpiresAt,
            role: db_1.workspaceMembers.role,
            joinedAt: db_1.workspaceMembers.joinedAt,
            managerId: db_1.workspaceMembers.managerId,
        })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!person)
            throw new common_1.NotFoundException('That person is not in this workspace');
        // §G06 [05:43] — "main kis ki TEAM MEMBER hoon".
        const teams = await this.db
            .select({ id: db_1.workspaceGroups.id, name: db_1.workspaceGroups.name, alias: db_1.workspaceGroups.alias })
            .from(db_1.workspaceGroupMembers)
            .innerJoin(db_1.workspaceGroups, (0, drizzle_orm_1.eq)(db_1.workspaceGroups.id, db_1.workspaceGroupMembers.groupId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceGroupMembers.userId, userId), (0, drizzle_orm_1.eq)(db_1.workspaceGroups.workspaceId, workspaceId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.workspaceGroups.name));
        /*
         * §G06 [06:28] — "yahan mujhe ORGANIZATION CHART show ho jayega".
         *
         * One person's reporting line, not the whole tree: who they report to, and
         * who reports to them. The full chart is a different screen and already
         * exists in settings; what belongs on a person is their own line, and a
         * "No manager" answer when there isn't one — which is a fact worth
         * rendering rather than an empty space.
         */
        const manager = person.managerId
            ? (await this.db
                .select({
                id: db_1.users.id,
                displayName: db_1.users.displayName,
                avatarUrl: db_1.users.avatarUrl,
                role: db_1.workspaceMembers.role,
            })
                .from(db_1.workspaceMembers)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, person.managerId)))
                .limit(1))[0] ?? null
            : null;
        const reports = await this.db
            .select({
            id: db_1.users.id,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
            role: db_1.workspaceMembers.role,
        })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.managerId, userId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.users.displayName));
        /** One panel section's worth. Each bucket gets its own, never a shared page. */
        const BUCKET_LIMIT = 25;
        /**
         * Open work that is theirs, in this workspace. Shared by every bucket below.
         *
         * `isArchived` matters as much as `status`: deleting a task archives it
         * rather than removing the row (tasks.service.ts deleteTask), and this
         * clause was missing — so a task you deleted kept appearing on your profile
         * as due today, with no way to get rid of it. The createdUnassigned query
         * below always excluded archived rows; these did not.
         */
        const mine = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.ne)(db_1.tasks.status, 'done'), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false));
        const assignedColumns = {
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            priority: db_1.tasks.priority,
            dueDate: db_1.tasks.dueDate,
            listId: db_1.tasks.listId,
            listName: db_1.lists.name,
        };
        // What they are working on: open tasks assigned to them, soonest due first.
        const assigned = await this.db
            .select(assignedColumns)
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where(mine)
            // Nulls last: a task with a date is more urgent than one without, and
            // Postgres sorts NULL first ascending by default, which would put every
            // undated task above everything that is actually due.
            .orderBy((0, drizzle_orm_1.sql) `${db_1.tasks.dueDate} asc nulls last`)
            .limit(BUCKET_LIMIT);
        /*
         * §G05 [06:08–06:14] — the buckets she names, in her order:
         *
         * > "TODAY ke kya task hain, OVERDUE kaun se ho gaye the, NEXT kaun se
         * >  upcoming task mere paas aa sakte hain, kaun si aisi cheezein jo maine
         * >  CREATE ki hain par abhi tak maine kisi ko assign nahi kiya."
         *
         * The panel showed one flat "Working on" list, which answers none of the
         * four questions: what is due now, what is late, what is coming, and what
         * have I made that is still sitting on nobody.
         *
         * "Today" is today WHERE THEY ARE. A profile already shows their local
         * time for the same reason — a deadline is a fact about their day, not
         * about the server's, and a teammate eight hours away reading this panel
         * should see the same buckets they would.
         */
        const zone = person.timezone || 'UTC';
        const dayStart = (0, zone_1.startOfDayIn)(zone);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        /*
         * Each bucket is its OWN query, with its own limit.
         *
         * This used to fetch the 25 earliest-due assigned tasks and split that page
         * four ways in JavaScript. Sorting by due date ascending means the page
         * fills with the oldest overdue work first, so on any account with 25+
         * dated tasks — which is every real account after a few weeks — NEXT and
         * UNSCHEDULED were permanently empty. Not "sometimes short": structurally
         * unreachable, because the rows that would land in them are past the LIMIT
         * before the filter ever runs. Measured on a working account: 18 overdue +
         * 7 today = 25, with `next: 0` while upcoming work existed.
         *
         * A limit that hides a whole category reads exactly like "you have nothing
         * coming up", which is the one thing this panel must never say wrongly.
         */
        const bucketRows = (where, order) => this.db
            .select(assignedColumns)
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)(mine, where))
            .orderBy(order === 'asc' ? (0, drizzle_orm_1.asc)(db_1.tasks.dueDate) : (0, drizzle_orm_1.desc)(db_1.tasks.dueDate))
            .limit(BUCKET_LIMIT);
        // Half-open on both sides, matching the filters this replaced: a task due
        // at exactly midnight tomorrow is coming up, not due today.
        const [today, overdue, next, unscheduled] = await Promise.all([
            bucketRows((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(db_1.tasks.dueDate, dayStart), (0, drizzle_orm_1.lt)(db_1.tasks.dueDate, dayEnd)), 'asc'),
            // Newest miss first: the deadline you blew yesterday is the one you act
            // on, not the one from four months ago.
            bucketRows((0, drizzle_orm_1.lt)(db_1.tasks.dueDate, dayStart), 'desc'),
            // Soonest first: "what is coming" is answered from the near end.
            bucketRows((0, drizzle_orm_1.gte)(db_1.tasks.dueDate, dayEnd), 'asc'),
            // Undated work is neither late nor coming; it would otherwise vanish
            // from a panel built entirely out of date buckets.
            bucketRows((0, drizzle_orm_1.isNull)(db_1.tasks.dueDate), 'asc'),
        ]);
        /*
         * G05-4 [06:08] — the two she names that had no equivalent anywhere.
         *
         * DONE deliberately breaks the `mine` filter, which excludes finished work
         * — that is the point of the bucket: "what did I actually get done". Capped
         * and ordered by completion, so it is a recent record rather than an
         * archive nobody scrolls.
         *
         * DELEGATED is the mirror of createdUnassigned: things you made and handed
         * to somebody ELSE. Together they answer the accountability question in
         * both directions — what I passed on, and what I dropped.
         */
        const doneColumns = { ...assignedColumns, completedAt: db_1.tasks.completedAt };
        const [done, delegated] = await Promise.all([
            this.db
                .select(doneColumns)
                .from(db_1.taskAssignees)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.statusCategory, 'closed'), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false)))
                // Nulls last: a closed task with no completedAt is older bookkeeping,
                // not the most recent thing this person finished.
                .orderBy((0, drizzle_orm_1.sql) `${db_1.tasks.completedAt} desc nulls last`)
                .limit(BUCKET_LIMIT),
            this.db
                .select(assignedColumns)
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.createdById, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.ne)(db_1.tasks.status, 'done'), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), 
            // Somebody is on it, and it is not you — "I handed this over".
            // A task you created and kept is simply your own work.
            (0, drizzle_orm_1.sql) `exists (select 1 from ${db_1.taskAssignees} where ${db_1.taskAssignees.taskId} = ${db_1.tasks.id})`, (0, drizzle_orm_1.sql) `not exists (select 1 from ${db_1.taskAssignees} where ${db_1.taskAssignees.taskId} = ${db_1.tasks.id} and ${db_1.taskAssignees.userId} = ${userId})`))
                .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.createdAt))
                .limit(BUCKET_LIMIT),
        ]);
        const buckets = { today, overdue, next, unscheduled, done, delegated };
        /*
         * "Cheezein jo maine CREATE ki hain par abhi tak kisi ko assign nahi kiya"
         * — a separate question from anything above: these are tasks they made
         * that are sitting on nobody, which is exactly the pile that goes quiet.
         */
        const createdUnassigned = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            priority: db_1.tasks.priority,
            dueDate: db_1.tasks.dueDate,
            listId: db_1.tasks.listId,
            listName: db_1.lists.name,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.createdById, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.ne)(db_1.tasks.status, 'done'), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), 
        // Nobody on it at all — one assignee is enough to make it somebody's.
        (0, drizzle_orm_1.sql) `not exists (select 1 from ${db_1.taskAssignees} where ${db_1.taskAssignees.taskId} = ${db_1.tasks.id})`))
            /*
             * Newest first, not by due date.
             *
             * Sorting these by `dueDate asc nulls last` put every UNDATED unassigned
             * task behind every dated one — and "I made this and have not handed it
             * out yet" is overwhelmingly a task with no date on it, so the rows this
             * bucket exists to surface were the exact rows the limit cut off.
             */
            .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.createdAt))
            .limit(BUCKET_LIMIT);
        return {
            person: {
                ...person,
                // The same expiry rule every other reader applies.
                customStatus: presence_service_1.PresenceService.liveStatus(person),
                status: presence_service_1.PresenceService.resolveStatus(person.presenceStatus, person.lastSeenAt),
            },
            teams,
            reporting: { manager, reports },
            // Kept: other readers already depend on the flat list, and the buckets
            // below are a view OF it rather than a replacement for it.
            assignedTasks: assigned,
            taskBuckets: { ...buckets, createdUnassigned },
        };
    }
    /**
     * §G06 [06:00] — "jis jis task ko open kiya hoga, jis document pe kaam kiya
     * hoga — bas woh yahan pe show honge", with a search box on the feed.
     *
     * Activity was queryable by task, by project and workspace-wide, and never
     * by who did it — so the one question a profile panel exists to answer had
     * no query behind it. This is that query, scoped to the workspace so the
     * feed cannot leak a task from somewhere the reader has no business.
     */
    async getActivity(workspaceId, requesterId, userId, opts = {}) {
        await this.assertBothMembers(workspaceId, requesterId, userId);
        const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
        const q = opts.q?.trim();
        const conditions = [
            (0, drizzle_orm_1.eq)(db_1.taskActivity.actorId, userId),
            (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId),
        ];
        // The search icon on the frame's feed header. Matched against the task
        // title, which is the only text on an activity row a person would search.
        if (q)
            conditions.push((0, drizzle_orm_1.ilike)(db_1.tasks.title, `%${q}%`));
        const rows = await this.db
            .select({
            id: db_1.taskActivity.id,
            action: db_1.taskActivity.action,
            meta: db_1.taskActivity.meta,
            createdAt: db_1.taskActivity.createdAt,
            taskId: db_1.tasks.id,
            taskTitle: db_1.tasks.title,
            listId: db_1.tasks.listId,
            listName: db_1.lists.name,
            spaceId: db_1.spaces.id,
            projectId: db_1.projects.id,
        })
            .from(db_1.taskActivity)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskActivity.createdAt))
            .limit(limit);
        return rows;
    }
    /**
     * §G05 [05:40] — "✦ Get StandUp".
     *
     * What this person has been doing, on demand, from their profile. The daily
     * briefing answers the same shape of question about YOURSELF and is pushed
     * on a schedule; this is about somebody else and is pulled when you ask,
     * which is why it could not simply reuse it.
     *
     * Four buckets, scoped to this workspace. "Active" is read from the activity
     * log by ACTOR rather than from `tasks.updatedAt`: a task is updated when
     * anybody touches it, so an updatedAt window reports work this person did not
     * do — which, on a summary somebody's manager is reading, is the one error
     * worth going out of the way to avoid.
     *
     * Bounded on both sides. Each bucket is capped so a person with four hundred
     * tasks produces a paragraph rather than a page, and the window is clamped so
     * a caller cannot ask for a year of history in a request that is meant to
     * answer while a panel is open.
     */
    async getStandup(workspaceId, requesterId, userId, opts = {}) {
        await this.assertBothMembers(workspaceId, requesterId, userId);
        const days = Math.min(Math.max(Math.trunc(opts.days ?? 7) || 7, 1), 30);
        const now = new Date();
        const since = new Date(now.getTime() - days * 86_400_000);
        const CAP = 20;
        // Every bucket is a task in THIS workspace assigned to this person. The
        // join chain is the same one the activity feed uses; tasks reach a
        // workspace only through their list's project's space.
        const inWorkspace = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId));
        const columns = {
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            dueDate: db_1.tasks.dueDate,
            completedAt: db_1.tasks.completedAt,
        };
        const from = () => this.db
            .select(columns)
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId));
        const done = await from()
            .where((0, drizzle_orm_1.and)(inWorkspace, (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.eq)(db_1.tasks.statusCategory, 'closed'), (0, drizzle_orm_1.gte)(db_1.tasks.completedAt, since)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.completedAt))
            .limit(CAP);
        // Distinct, because a person who touched one task nine times has done one
        // thing. `select distinct` rather than a Set afterwards so the LIMIT counts
        // tasks rather than activity rows — the same post-limit trap that made
        // search return nothing earlier in this engagement.
        const active = await this.db
            .selectDistinct(columns)
            .from(db_1.taskActivity)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.taskAssignees, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, db_1.tasks.id), (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskActivity.actorId, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.taskActivity.createdAt, since), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.ne)(db_1.tasks.statusCategory, 'closed')))
            .limit(CAP);
        const overdue = await from()
            .where((0, drizzle_orm_1.and)(inWorkspace, (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.ne)(db_1.tasks.statusCategory, 'closed'), (0, drizzle_orm_1.lte)(db_1.tasks.dueDate, now)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.dueDate))
            .limit(CAP);
        const [person] = await this.db
            .select({ displayName: db_1.users.displayName, email: db_1.users.email })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1);
        return {
            displayName: person?.displayName || person?.email || '',
            days,
            done,
            active,
            overdue,
            blocked: await this.blockedTasks(workspaceId, userId, CAP),
        };
    }
    /**
     * Their open tasks that are waiting on another task which is also still open.
     *
     * The mirror of the briefing's `blockingTasks`, which asks the other
     * question — what of yours is holding somebody else up. A dependency row is
     * stored from either end (`blocks` or `blocked_by`), so which column names
     * the blocker depends on the row's type; getting that backwards produces a
     * list that looks entirely plausible and is exactly inverted.
     */
    async blockedTasks(workspaceId, userId, cap) {
        const blocker = (0, pg_core_1.alias)(db_1.tasks, 'standup_blocker');
        const blocked = (0, pg_core_1.alias)(db_1.tasks, 'standup_blocked');
        const rows = await this.db
            .selectDistinct({
            id: blocked.id,
            title: blocked.title,
            dueDate: blocked.dueDate,
            completedAt: blocked.completedAt,
        })
            .from(db_1.taskDependencies)
            .innerJoin(blocked, (0, drizzle_orm_1.sql) `${blocked.id} = case when ${db_1.taskDependencies.type} = 'blocks' then ${db_1.taskDependencies.relatedTaskId} else ${db_1.taskDependencies.taskId} end`)
            .innerJoin(blocker, (0, drizzle_orm_1.sql) `${blocker.id} = case when ${db_1.taskDependencies.type} = 'blocks' then ${db_1.taskDependencies.taskId} else ${db_1.taskDependencies.relatedTaskId} end`)
            .innerJoin(db_1.taskAssignees, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, blocked.id), (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId)))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, blocked.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.taskDependencies.type, ['blocks', 'blocked_by']), (0, drizzle_orm_1.ne)(blocked.statusCategory, 'closed'), (0, drizzle_orm_1.eq)(blocked.isArchived, false), 
        // Still open, or it is not blocking anything any more.
        (0, drizzle_orm_1.ne)(blocker.statusCategory, 'closed'), (0, drizzle_orm_1.eq)(blocker.isArchived, false)))
            .limit(cap);
        return rows;
    }
    /**
     * §G06 [06:22] — "CALENDAR — mera hi calendar show ho sakta hai".
     *
     * A person's own calendar, which did not exist as a surface: the only
     * calendar views were per-list, so there was no way to ask "what does this
     * week look like for them". Two sources, because two things occupy a day —
     * their dated tasks and the meetings they are in.
     *
     * Google/Outlook sync already writes into these same tables, so a synced
     * calendar shows up here without this module knowing anything about it.
     */
    async getCalendar(workspaceId, requesterId, userId, opts = {}) {
        await this.assertBothMembers(workspaceId, requesterId, userId);
        const from = opts.from ? new Date(opts.from) : new Date();
        const to = opts.to ? new Date(opts.to) : new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new common_1.BadRequestException('from/to must be valid dates');
        }
        if (to.getTime() < from.getTime())
            throw new common_1.BadRequestException('to must be after from');
        const dated = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            startDate: db_1.tasks.startDate,
            dueDate: db_1.tasks.dueDate,
            listId: db_1.tasks.listId,
        })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), 
        // A task counts as inside the window if either end of it is.
        (0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(db_1.tasks.dueDate, from), (0, drizzle_orm_1.lte)(db_1.tasks.dueDate, to)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(db_1.tasks.startDate, from), (0, drizzle_orm_1.lte)(db_1.tasks.startDate, to)))))
            .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.dueDate))
            .limit(200);
        const inRoom = await this.db
            .select({
            id: db_1.meetings.id,
            title: db_1.meetings.title,
            startsAt: db_1.meetings.startsAt,
            endsAt: db_1.meetings.endsAt,
            joinUrl: db_1.meetings.joinUrl,
        })
            .from(db_1.meetingAttendees)
            .innerJoin(db_1.meetings, (0, drizzle_orm_1.eq)(db_1.meetings.id, db_1.meetingAttendees.meetingId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.meetingAttendees.userId, userId), (0, drizzle_orm_1.eq)(db_1.meetings.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.meetings.startsAt, from), (0, drizzle_orm_1.lte)(db_1.meetings.startsAt, to)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.meetings.startsAt))
            .limit(200);
        /*
         * §V2-14c, frame `13:50` — "These calendars decide when you're busy."
         *
         * `meetings` stays exactly as it was, because the planner draws it with
         * titles for a colleague you are allowed to see. `busy` is the union of
         * that and any EXTERNAL calendar this person has marked as counting — and
         * it carries no titles at all, because a personal calendar says things
         * like "MRI results". You may know somebody is busy at three; you may not
         * know why.
         *
         * External windows are fetched best-effort: a Google outage, or a token
         * that needs re-granting, must not take out a colleague's whole calendar
         * view. When they cannot be fetched the answer is Rundesk's own time,
         * which is what it was before this existed.
         */
        const external = await this.calendarAccounts
            .externalBusyWindows(userId, workspaceId, from, to)
            .catch(() => []);
        const busy = (0, free_busy_1.mergeBusy)([
            ...(0, free_busy_1.toBusyWindows)(inRoom.map((m) => ({ start: m.startsAt, end: m.endsAt })), 'rundesk'),
            ...external,
        ]);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            tasks: dated,
            meetings: inRoom,
            busy,
        };
    }
    // ── Priorities ────────────────────────────────────────────────────────────
    /**
     * §G06 [05:54] — somebody's priorities.
     *
     * Readable by any colleague, because the panel is about a person and this is
     * the most interesting thing on it: "what are you actually doing today" is
     * the question a teammate opens a profile to answer. Writable only by the
     * person themselves — a priority is a decision, and a decision somebody else
     * can edit is not one.
     */
    async listPriorities(workspaceId, requesterId, userId) {
        await this.assertBothMembers(workspaceId, requesterId, userId);
        return this.db
            .select({
            id: db_1.userPriorities.id,
            taskId: db_1.userPriorities.taskId,
            // A pointed-at task shows the task's live title; a typed line shows
            // what was typed. Resolved here so the client never has to decide
            // which of two fields to render.
            title: (0, drizzle_orm_1.sql) `coalesce(${db_1.tasks.title}, ${db_1.userPriorities.title})`,
            taskStatus: db_1.tasks.status,
            position: db_1.userPriorities.position,
            doneAt: db_1.userPriorities.doneAt,
            createdAt: db_1.userPriorities.createdAt,
        })
            .from(db_1.userPriorities)
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.userPriorities.taskId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userPriorities.userId, userId), (0, drizzle_orm_1.eq)(db_1.userPriorities.workspaceId, workspaceId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.userPriorities.position), (0, drizzle_orm_1.asc)(db_1.userPriorities.createdAt));
    }
    async addPriority(workspaceId, userId, input) {
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace membership required');
        const title = input.title?.trim() || null;
        const taskId = input.taskId || null;
        if (!taskId && !title)
            throw new common_1.BadRequestException('A priority needs a task or a title');
        if (title && title.length > 200)
            throw new common_1.BadRequestException('Keep a priority under 200 characters');
        if (taskId) {
            // The task has to be in this workspace. Without the check a priority
            // could point at a task from somewhere else and render its title on a
            // panel the reader has no access to.
            const [found] = await this.db
                .select({ id: db_1.tasks.id })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
                .limit(1);
            if (!found)
                throw new common_1.NotFoundException('That task is not in this workspace');
        }
        // Appended, not prepended: a list you keep re-ordering from the top is a
        // list where the thing you added first sinks, which is backwards for
        // "these are the important ones, in order".
        const [last] = await this.db
            .select({ position: db_1.userPriorities.position })
            .from(db_1.userPriorities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userPriorities.userId, userId), (0, drizzle_orm_1.eq)(db_1.userPriorities.workspaceId, workspaceId)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.userPriorities.position))
            .limit(1);
        try {
            const [row] = await this.db
                .insert(db_1.userPriorities)
                .values({
                userId,
                workspaceId,
                taskId,
                title: taskId ? null : title,
                position: (last?.position ?? -1) + 1,
            })
                .returning();
            return row;
        }
        catch (err) {
            // Adding a task that is already on the list is somebody making sure.
            if (err?.code === '23505') {
                const [existing] = await this.db
                    .select()
                    .from(db_1.userPriorities)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userPriorities.userId, userId), (0, drizzle_orm_1.eq)(db_1.userPriorities.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.userPriorities.taskId, taskId)))
                    .limit(1);
                if (existing)
                    return existing;
            }
            throw err;
        }
    }
    /** Tick one off, or un-tick it. Only the owner. */
    async setPriorityDone(priorityId, userId, done) {
        const [row] = await this.db
            .update(db_1.userPriorities)
            .set({ doneAt: done ? new Date() : null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userPriorities.id, priorityId), (0, drizzle_orm_1.eq)(db_1.userPriorities.userId, userId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Priority not found');
        return row;
    }
    async removePriority(priorityId, userId) {
        const [row] = await this.db
            .delete(db_1.userPriorities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userPriorities.id, priorityId), (0, drizzle_orm_1.eq)(db_1.userPriorities.userId, userId)))
            .returning({ id: db_1.userPriorities.id });
        if (!row)
            throw new common_1.NotFoundException('Priority not found');
        return { ok: true };
    }
    /**
     * Re-order the whole list in one call.
     *
     * Whole-list rather than per-row moves: a drag produces one new order, and
     * sending it as a sequence of individual position writes is how two drags in
     * quick succession end up interleaved into an order nobody chose.
     */
    async reorderPriorities(workspaceId, userId, ids) {
        if (!Array.isArray(ids))
            throw new common_1.BadRequestException('ids must be an array');
        const owned = await this.db
            .select({ id: db_1.userPriorities.id })
            .from(db_1.userPriorities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userPriorities.userId, userId), (0, drizzle_orm_1.eq)(db_1.userPriorities.workspaceId, workspaceId)));
        const ownedIds = new Set(owned.map((r) => r.id));
        // Silently ignoring a foreign id would let a reorder half-apply; refusing
        // says which list the caller is actually looking at.
        const foreign = ids.filter((id) => !ownedIds.has(id));
        if (foreign.length > 0)
            throw new common_1.BadRequestException('Those priorities are not yours to reorder');
        for (const [index, id] of ids.entries()) {
            await this.db
                .update(db_1.userPriorities)
                .set({ position: index })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userPriorities.id, id), (0, drizzle_orm_1.eq)(db_1.userPriorities.userId, userId)));
        }
        return this.listPriorities(workspaceId, userId, userId);
    }
};
exports.PeopleService = PeopleService;
exports.PeopleService = PeopleService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, ai_service_1.AiService,
        calendar_accounts_service_1.CalendarAccountsService])
], PeopleService);
//# sourceMappingURL=people.service.js.map