import type { Db } from '@rundesk/db';
import { PlansService } from '../plans/plans.service';
/** The authenticated actor as seen by the service (from JwtAuthGuard). */
type Actor = {
    id: string;
    role?: string;
};
/**
 * SupportService (Plan §14.4) — the human support surface behind the AI help
 * center. Owns the ticket lifecycle (create → messages → status/priority/
 * assignee → resolve), the SLA policy + breach derivation, and the public
 * status page (components + incidents) with super-admin management.
 *
 * Access model for a ticket: its creator, any admin/manager of its workspace,
 * and any platform super_admin. Status-page reads are public; status-page
 * writes are super_admin-only.
 */
export declare class SupportService {
    private readonly db;
    private readonly plans;
    constructor(db: Db, plans: PlansService);
    /** The legacy priority-only SLA policy table (fallback when tier is unknown). */
    slaPolicy(): Record<import("@rundesk/db").SupportTicketPriority, {
        firstResponseHours: number;
        resolutionHours: number;
    }>;
    /** The full SLA commitments matrix (tier × priority) exposed for the UI/tests. */
    slaMatrix(): Record<"enterprise" | "free" | "pro" | "business", Record<import("@rundesk/db").SupportTicketPriority, import("./support.constants").SlaTarget>>;
    /**
     * Create a support ticket. Auto-stamps the SLA due dates from the workspace's
     * plan tier AND the priority (§14.4), and seeds the thread with the requester's
     * opening message. The creator must be a member of the target workspace (a
     * super_admin may file into any workspace). The ticket system is a paid feature
     * — a Free workspace is turned away with an upgrade prompt (super_admin bypasses
     * so platform staff can still file on any workspace's behalf).
     */
    createTicket(actor: Actor, input: {
        workspaceId?: string;
        subject?: string;
        body?: string;
        priority?: string;
        /** §G06 [07:30] — 'call' when this is a request to talk to a person. */
        kind?: string;
        /** Times the requester offered, ISO-8601. */
        requestedSlots?: string[];
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        createdById: string;
        priority: string;
        status: string;
        resolvedAt: Date | null;
        body: string;
        kind: "call" | "question";
        subject: string;
        requestedSlots: string[] | null;
        scheduledAt: Date | null;
        assignedToId: string | null;
        firstResponseAt: Date | null;
        firstResponseDueAt: Date;
        resolutionDueAt: Date;
    } & {
        slaBreached: boolean;
        firstResponseBreached: boolean;
        resolutionBreached: boolean;
    }>;
    /**
     * List tickets visible to the actor. A super_admin passing `scope=all` (or any
     * super_admin by default) sees every ticket; otherwise the actor sees tickets
     * they created plus every ticket in workspaces where they are an admin/manager.
     * Optional `status` / `priority` / `workspaceId` filters narrow the result.
     */
    listTickets(actor: Actor, filter?: {
        scope?: string;
        status?: string;
        priority?: string;
        workspaceId?: string;
    }): Promise<({
        id: string;
        workspaceId: string;
        createdById: string;
        subject: string;
        body: string;
        kind: "call" | "question";
        requestedSlots: string[] | null;
        scheduledAt: Date | null;
        status: string;
        priority: string;
        assignedToId: string | null;
        firstResponseAt: Date | null;
        resolvedAt: Date | null;
        firstResponseDueAt: Date;
        resolutionDueAt: Date;
        createdAt: Date;
        updatedAt: Date;
    } & {
        slaBreached: boolean;
        firstResponseBreached: boolean;
        resolutionBreached: boolean;
    })[]>;
    /** Fetch a ticket with its message thread. Access-checked. */
    getTicket(actor: Actor, ticketId: string): Promise<{
        messages: {
            id: string;
            ticketId: string;
            authorId: string;
            body: string;
            isStaff: boolean;
            createdAt: Date;
            authorName: string | null;
            authorEmail: string | null;
        }[];
        id: string;
        workspaceId: string;
        createdById: string;
        subject: string;
        body: string;
        kind: "call" | "question";
        requestedSlots: string[] | null;
        scheduledAt: Date | null;
        status: string;
        priority: string;
        assignedToId: string | null;
        firstResponseAt: Date | null;
        resolvedAt: Date | null;
        firstResponseDueAt: Date;
        resolutionDueAt: Date;
        createdAt: Date;
        updatedAt: Date;
        slaBreached: boolean;
        firstResponseBreached: boolean;
        resolutionBreached: boolean;
    }>;
    /**
     * Post a reply to a ticket. A staff reply (workspace admin/manager or
     * super_admin) stamps `first_response_at` if it is not already set. Any reply
     * bumps `updated_at` and re-opens a resolved/closed ticket into 'pending'.
     */
    addMessage(actor: Actor, ticketId: string, input: {
        body?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        authorId: string;
        body: string;
        ticketId: string;
        isStaff: boolean;
    }>;
    /**
     * Patch a ticket's status / priority / assignee. Requires staff access
     * (workspace admin/manager or super_admin) — a plain requester cannot mutate
     * ticket metadata. Resolving stamps `resolved_at`; re-opening clears it.
     */
    updateTicket(actor: Actor, ticketId: string, input: {
        status?: string;
        priority?: string;
        assignedToId?: string | null;
    }): Promise<{
        id: string;
        workspaceId: string;
        createdById: string;
        subject: string;
        body: string;
        kind: "call" | "question";
        requestedSlots: string[] | null;
        scheduledAt: Date | null;
        status: string;
        priority: string;
        assignedToId: string | null;
        firstResponseAt: Date | null;
        resolvedAt: Date | null;
        firstResponseDueAt: Date;
        resolutionDueAt: Date;
        createdAt: Date;
        updatedAt: Date;
    } & {
        slaBreached: boolean;
        firstResponseBreached: boolean;
        resolutionBreached: boolean;
    }>;
    /**
     * Public status-page payload: every component (ordered) + recent incidents,
     * plus an overall banner derived from the worst component/incident state.
     */
    getStatusPage(): Promise<{
        overall: "operational" | "degraded" | "partial_outage" | "major_outage";
        components: {
            id: string;
            name: string;
            status: string;
            position: number;
        }[];
        incidents: {
            id: string;
            title: string;
            body: string;
            impact: string;
            status: string;
            componentId: string | null;
            startedAt: Date;
            resolvedAt: Date | null;
            createdAt: Date;
        }[];
    }>;
    /** super_admin: create a status-page component. */
    createComponent(actor: Actor, input: {
        name?: string;
        status?: string;
        position?: number;
    }): Promise<{
        id: string;
        name: string;
        position: number;
        status: string;
    }>;
    /** super_admin: update a component's name / status / position. */
    updateComponent(actor: Actor, componentId: string, input: {
        name?: string;
        status?: string;
        position?: number;
    }): Promise<{
        id: string;
        name: string;
        status: string;
        position: number;
    }>;
    /** super_admin: delete a component. */
    deleteComponent(actor: Actor, componentId: string): Promise<{
        ok: boolean;
    }>;
    /** super_admin: post a new incident to the status page. */
    createIncident(actor: Actor, input: {
        title?: string;
        body?: string;
        impact?: string;
        status?: string;
        componentId?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        status: string;
        resolvedAt: Date | null;
        body: string;
        startedAt: Date;
        impact: string;
        componentId: string | null;
    }>;
    /** super_admin: update an incident (status/body/impact); resolving stamps resolvedAt. */
    updateIncident(actor: Actor, incidentId: string, input: {
        title?: string;
        body?: string;
        impact?: string;
        status?: string;
        componentId?: string | null;
    }): Promise<{
        id: string;
        title: string;
        body: string;
        impact: string;
        status: string;
        componentId: string | null;
        startedAt: Date;
        resolvedAt: Date | null;
        createdAt: Date;
    }>;
    /** Attach derived SLA-breach flags to a ticket row. */
    private decorateTicket;
    private overallStatus;
    private loadTicket;
    /** The workspaces where a user is an admin/manager (or nothing). */
    private staffedWorkspaceIds;
    /** True if the actor is support staff for the given workspace. */
    private isStaffFor;
    /** Ensure the actor may read/reply to a ticket: creator, workspace staff, or super_admin. */
    private assertTicketAccess;
    /**
     * §14.4 — the ticket system is restricted to paid tiers (Pro/Business/
     * Enterprise). A Free workspace gets a clean 403 with an upgrade message
     * instead of filing a ticket. super_admin (platform staff) bypasses. This is a
     * no-op for every existing workspace, which default to the enterprise tier.
     */
    private assertTicketingAllowed;
    /** Ensure the actor is a member of the workspace (super_admin bypasses). */
    private assertWorkspaceMember;
    private assertSuperAdmin;
}
export {};
