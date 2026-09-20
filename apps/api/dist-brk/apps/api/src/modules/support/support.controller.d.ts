import { SupportService } from './support.service';
type Actor = {
    id: string;
    role?: string;
};
/**
 * Customer Support & Help Center (Plan §14.4). Ticket CRUD + the ticket-thread
 * conversation, plus super-admin management of the public status page
 * (components + incidents). Every route here requires authentication; access to
 * a specific ticket is enforced in the service (creator / workspace staff /
 * super_admin). The unauthenticated public status read lives in
 * PublicStatusController.
 */
export declare class SupportController {
    private readonly support;
    constructor(support: SupportService);
    createTicket(user: Actor, body: {
        workspaceId?: string;
        subject?: string;
        body?: string;
        priority?: string;
        /** §G06 [07:30] — 'call' turns this into a request to talk to a person. */
        kind?: string;
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
    listTickets(user: Actor, scope?: string, status?: string, priority?: string, workspaceId?: string): Promise<({
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
    getTicket(user: Actor, id: string): Promise<{
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
    addMessage(user: Actor, id: string, body: {
        body?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        authorId: string;
        body: string;
        ticketId: string;
        isStaff: boolean;
    }>;
    updateTicket(user: Actor, id: string, body: {
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
    createComponent(user: Actor, body: {
        name?: string;
        status?: string;
        position?: number;
    }): Promise<{
        id: string;
        name: string;
        position: number;
        status: string;
    }>;
    updateComponent(user: Actor, id: string, body: {
        name?: string;
        status?: string;
        position?: number;
    }): Promise<{
        id: string;
        name: string;
        status: string;
        position: number;
    }>;
    deleteComponent(user: Actor, id: string): Promise<{
        ok: boolean;
    }>;
    createIncident(user: Actor, body: {
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
    updateIncident(user: Actor, id: string, body: {
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
}
/**
 * Public status page (Plan §14.4). No auth — anyone can read the current
 * component health + recent incidents. Served at GET /api/v1/status.
 */
export declare class PublicStatusController {
    private readonly support;
    constructor(support: SupportService);
    getStatus(): Promise<{
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
}
export {};
