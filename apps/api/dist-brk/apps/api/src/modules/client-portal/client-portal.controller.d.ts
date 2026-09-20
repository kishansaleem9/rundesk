import { ClientPortalService } from './client-portal.service';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * Admin management of client portals. Creating/listing is scoped to a project
 * and gated by ResourceMemberGuard (workspace membership + private-container
 * access resolved from :projectId). Update/delete carry only the portal id, so
 * the service re-derives the project and enforces the same access there.
 */
export declare class ClientPortalController {
    private readonly portals;
    constructor(portals: ClientPortalService);
    create(projectId: string, user: CurrentUserPayload, body: {
        name?: string | null;
        clientId?: string | null;
        showCompleted?: boolean;
    }): Promise<{
        id: string;
        projectId: string;
        clientId: string | null;
        token: string;
        url: string;
        name: string | null;
        isEnabled: boolean;
        showCompleted: boolean;
        createdById: string | null;
        createdAt: Date;
        lastViewedAt: Date | null;
    }>;
    list(projectId: string, user: CurrentUserPayload): Promise<{
        id: string;
        projectId: string;
        clientId: string | null;
        token: string;
        url: string;
        name: string | null;
        isEnabled: boolean;
        showCompleted: boolean;
        createdById: string | null;
        createdAt: Date;
        lastViewedAt: Date | null;
    }[]>;
    update(id: string, user: CurrentUserPayload, body: {
        name?: string | null;
        isEnabled?: boolean;
        showCompleted?: boolean;
    }): Promise<{
        id: string;
        projectId: string;
        clientId: string | null;
        token: string;
        url: string;
        name: string | null;
        isEnabled: boolean;
        showCompleted: boolean;
        createdById: string | null;
        createdAt: Date;
        lastViewedAt: Date | null;
    }>;
    remove(id: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
/**
 * Public, anonymous, token-only read. No auth guard — `/portal/<token>` works
 * for any client with the link. Returns only the linked project's client-safe
 * projection (see ClientPortalService.getPublicView).
 */
export declare class ClientPortalPublicController {
    private readonly portals;
    constructor(portals: ClientPortalService);
    getPublic(token: string): Promise<{
        portal: {
            name: string;
        };
        project: {
            name: string;
        };
        client: {
            name: string;
        } | null;
        workspace: {
            name: string;
            logoUrl: string | null;
            primaryColor: string | null;
            accentColor: string | null;
        };
        showCompleted: boolean;
        progress: {
            total: number;
            completed: number;
            percent: number;
        };
        tasks: import("./client-portal.service").ClientPortalTask[];
    }>;
}
