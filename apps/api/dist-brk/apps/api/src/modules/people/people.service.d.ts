import type { Db } from '@rundesk/db';
import { AiService } from '../ai/ai.service';
import type { StandupData } from './standup';
import { CalendarAccountsService } from '../calendar-sync/calendar-accounts.service';
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
export declare class PeopleService {
    private db;
    private ai;
    private calendarAccounts;
    constructor(db: Db, ai: AiService, calendarAccounts: CalendarAccountsService);
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
    generateStandup(workspaceId: string, requesterId: string, userId: string, opts?: {
        days?: number;
    }): Promise<{
        text: string;
        data: StandupData;
        generated: boolean;
    }>;
    /**
     * Both people must be in the workspace.
     *
     * A profile panel is a directory entry, so any colleague may open it — but
     * "any colleague" means exactly that, and the check is on the reader as well
     * as the subject. Without the second half, a member of workspace A could
     * read a profile from workspace B by guessing an id.
     */
    private assertBothMembers;
    /**
     * §G06 [05:43] — the panel's header and its three derived sections.
     *
     * One request rather than six. The panel opens over whatever you were doing,
     * so it has one moment to be useful; six round trips is six chances to show
     * a half-drawn card, which is the §2.9a complaint in miniature.
     */
    getProfile(workspaceId: string, requesterId: string, userId: string): Promise<{
        person: {
            customStatus: {
                emoji: string | null;
                text: string | null;
                expiresAt: string | null;
            } | null;
            status: import("../presence/presence.service").PresenceStatus;
            id: string;
            displayName: string;
            email: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            joinedAt: Date;
            managerId: string | null;
        };
        teams: {
            id: string;
            name: string;
            alias: string | null;
        }[];
        reporting: {
            manager: {
                id: string;
                displayName: string;
                avatarUrl: string | null;
                role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            } | null;
            reports: {
                id: string;
                displayName: string;
                avatarUrl: string | null;
                role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            }[];
        };
        assignedTasks: {
            id: string;
            title: string;
            status: string;
            priority: "urgent" | "high" | "normal" | "low";
            dueDate: Date | null;
            listId: string;
            listName: string;
        }[];
        taskBuckets: {
            createdUnassigned: {
                id: string;
                title: string;
                status: string;
                priority: "urgent" | "high" | "normal" | "low";
                dueDate: Date | null;
                listId: string;
                listName: string;
            }[];
            today: {
                id: string;
                title: string;
                status: string;
                priority: "urgent" | "high" | "normal" | "low";
                dueDate: Date | null;
                listId: string;
                listName: string;
            }[];
            overdue: {
                id: string;
                title: string;
                status: string;
                priority: "urgent" | "high" | "normal" | "low";
                dueDate: Date | null;
                listId: string;
                listName: string;
            }[];
            next: {
                id: string;
                title: string;
                status: string;
                priority: "urgent" | "high" | "normal" | "low";
                dueDate: Date | null;
                listId: string;
                listName: string;
            }[];
            unscheduled: {
                id: string;
                title: string;
                status: string;
                priority: "urgent" | "high" | "normal" | "low";
                dueDate: Date | null;
                listId: string;
                listName: string;
            }[];
            done: {
                completedAt: Date | null;
                id: string;
                title: string;
                status: string;
                priority: "urgent" | "high" | "normal" | "low";
                dueDate: Date | null;
                listId: string;
                listName: string;
            }[];
            delegated: {
                id: string;
                title: string;
                status: string;
                priority: "urgent" | "high" | "normal" | "low";
                dueDate: Date | null;
                listId: string;
                listName: string;
            }[];
        };
    }>;
    /**
     * §G06 [06:00] — "jis jis task ko open kiya hoga, jis document pe kaam kiya
     * hoga — bas woh yahan pe show honge", with a search box on the feed.
     *
     * Activity was queryable by task, by project and workspace-wide, and never
     * by who did it — so the one question a profile panel exists to answer had
     * no query behind it. This is that query, scoped to the workspace so the
     * feed cannot leak a task from somewhere the reader has no business.
     */
    getActivity(workspaceId: string, requesterId: string, userId: string, opts?: {
        q?: string;
        limit?: number;
    }): Promise<{
        id: string;
        action: "created" | "updated" | "deleted" | "archived" | "restored" | "status_changed" | "priority_changed" | "assigned" | "unassigned" | "commented" | "label_added" | "label_removed" | "due_date_changed" | "dependency_added" | "dependency_removed" | "checklist_item_toggled" | "checklist_item_added" | "attachment_added" | "attachment_removed" | "subtask_added" | "moved" | "merged_in" | "merged_away";
        meta: Record<string, unknown> | null;
        createdAt: Date;
        taskId: string;
        taskTitle: string;
        listId: string;
        listName: string;
        spaceId: string;
        projectId: string;
    }[]>;
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
    getStandup(workspaceId: string, requesterId: string, userId: string, opts?: {
        days?: number;
    }): Promise<StandupData>;
    /**
     * Their open tasks that are waiting on another task which is also still open.
     *
     * The mirror of the briefing's `blockingTasks`, which asks the other
     * question — what of yours is holding somebody else up. A dependency row is
     * stored from either end (`blocks` or `blocked_by`), so which column names
     * the blocker depends on the row's type; getting that backwards produces a
     * list that looks entirely plausible and is exactly inverted.
     */
    private blockedTasks;
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
    getCalendar(workspaceId: string, requesterId: string, userId: string, opts?: {
        from?: string;
        to?: string;
    }): Promise<{
        from: string;
        to: string;
        tasks: {
            id: string;
            title: string;
            status: string;
            startDate: Date | null;
            dueDate: Date | null;
            listId: string;
        }[];
        meetings: {
            id: string;
            title: string;
            startsAt: Date | null;
            endsAt: Date | null;
            joinUrl: string | null;
        }[];
        busy: import("../calendar-sync/free-busy").BusyWindow[];
    }>;
    /**
     * §G06 [05:54] — somebody's priorities.
     *
     * Readable by any colleague, because the panel is about a person and this is
     * the most interesting thing on it: "what are you actually doing today" is
     * the question a teammate opens a profile to answer. Writable only by the
     * person themselves — a priority is a decision, and a decision somebody else
     * can edit is not one.
     */
    listPriorities(workspaceId: string, requesterId: string, userId: string): Promise<{
        id: string;
        taskId: string | null;
        title: string;
        taskStatus: string | null;
        position: number;
        doneAt: Date | null;
        createdAt: Date;
    }[]>;
    addPriority(workspaceId: string, userId: string, input: {
        taskId?: string | null;
        title?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        position: number;
        title: string | null;
        taskId: string | null;
        userId: string;
        doneAt: Date | null;
    }>;
    /** Tick one off, or un-tick it. Only the owner. */
    setPriorityDone(priorityId: string, userId: string, done: boolean): Promise<{
        id: string;
        userId: string;
        workspaceId: string;
        taskId: string | null;
        title: string | null;
        position: number;
        doneAt: Date | null;
        createdAt: Date;
    }>;
    removePriority(priorityId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Re-order the whole list in one call.
     *
     * Whole-list rather than per-row moves: a drag produces one new order, and
     * sending it as a sequence of individual position writes is how two drags in
     * quick succession end up interleaved into an order nobody chose.
     */
    reorderPriorities(workspaceId: string, userId: string, ids: string[]): Promise<{
        id: string;
        taskId: string | null;
        title: string;
        taskStatus: string | null;
        position: number;
        doneAt: Date | null;
        createdAt: Date;
    }[]>;
}
