import { PeopleService } from './people.service';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * Everything here is workspace-scoped and reads about one member. The panel
 * opens over whatever page you were on, so the profile itself is one request:
 * six round trips is six chances to render half a card.
 */
export declare class PeopleController {
    private people;
    constructor(people: PeopleService);
    profile(workspaceId: string, userId: string, user: CurrentUserPayload): Promise<{
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
    /** §G06 [06:00] — activity by ACTOR, which nothing could query before. */
    activity(workspaceId: string, userId: string, user: CurrentUserPayload, q?: string, limit?: string): Promise<{
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
     * §G05 [05:40] — "✦ Get StandUp": what this person has been doing.
     *
     * POST rather than GET because it may call a model, which costs money and
     * must not be issued by a cache warming a link or a browser prefetching one.
     * It reads nothing it does not own and writes nothing, so it is safe to
     * repeat — but "safe to repeat" and "free to repeat" are different claims.
     *
     * Always answers. With no model configured it returns the deterministic
     * summary, which is a real answer rather than a 503 — the same rule the daily
     * briefing follows, and the reason this can be tested on a box with no key.
     */
    standup(workspaceId: string, userId: string, user: CurrentUserPayload, body?: {
        days?: number;
    }): Promise<{
        text: string;
        data: import("./standup").StandupData;
        generated: boolean;
    }>;
    /** §G06 [06:22] — their dated tasks and the meetings they are in. */
    calendar(workspaceId: string, userId: string, user: CurrentUserPayload, from?: string, to?: string): Promise<{
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
     * §G06 [05:54] — their priorities.
     *
     * Readable by any colleague — "what are you actually doing today" is what a
     * teammate opens a profile to find out. The writes below are the owner's
     * only: a decision somebody else can edit is not a decision.
     */
    priorities(workspaceId: string, userId: string, user: CurrentUserPayload): Promise<{
        id: string;
        taskId: string | null;
        title: string;
        taskStatus: string | null;
        position: number;
        doneAt: Date | null;
        createdAt: Date;
    }[]>;
}
/**
 * The caller's own priorities. A separate controller because these are writes
 * about yourself and take no `:userId` — routing them under `/people/:userId`
 * would invite a client to pass somebody else's id and expect it to work.
 */
export declare class PrioritiesController {
    private people;
    constructor(people: PeopleService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<{
        id: string;
        taskId: string | null;
        title: string;
        taskStatus: string | null;
        position: number;
        doneAt: Date | null;
        createdAt: Date;
    }[]>;
    add(workspaceId: string, user: CurrentUserPayload, body: {
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
    setDone(priorityId: string, user: CurrentUserPayload, body: {
        done?: boolean;
    }): Promise<{
        id: string;
        userId: string;
        workspaceId: string;
        taskId: string | null;
        title: string | null;
        position: number;
        doneAt: Date | null;
        createdAt: Date;
    }>;
    remove(priorityId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    /** The whole order in one call — a drag produces one order, not N moves. */
    reorder(workspaceId: string, user: CurrentUserPayload, body: {
        ids?: string[];
    }): Promise<{
        id: string;
        taskId: string | null;
        title: string;
        taskStatus: string | null;
        position: number;
        doneAt: Date | null;
        createdAt: Date;
    }[]>;
}
