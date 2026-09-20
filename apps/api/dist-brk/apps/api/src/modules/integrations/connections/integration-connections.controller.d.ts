import type { FastifyReply } from 'fastify';
import { IntegrationConnectionsService } from './integration-connections.service';
export declare class IntegrationConnectionsController {
    private readonly svc;
    constructor(svc: IntegrationConnectionsService);
    list(workspaceId: string): Promise<{
        provider: string;
        status: string;
        health: string;
        scopes: string[];
        externalAccountEmail: string | null;
        tokenExpiresAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        connectedAt: Date;
        updatedAt: Date;
    }[]>;
    providers(): readonly ["github", "gitlab", "gcal", "google-drive", "outlook", "onedrive", "linear", "salesforce", "dropbox", "zoom"];
    providerStatus(): {
        provider: "zoom" | "google-drive" | "onedrive" | "github" | "gitlab" | "dropbox" | "gcal" | "outlook" | "linear" | "salesforce";
        available: boolean;
        reason?: string;
    }[];
    listAccessRequests(workspaceId: string): Promise<{
        provider: string;
        status: string;
        note: string | null;
        requestedById: string;
        createdAt: Date;
        updatedAt: Date;
        requesterName: string | null;
        requesterEmail: string | null;
    }[]>;
    requestAccess(workspaceId: string, user: any, provider: string, note?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        status: string;
        provider: string;
        note: string | null;
        requestedById: string;
    }>;
    setAccessRequestStatus(workspaceId: string, provider: string, body: {
        status: 'pending' | 'approved' | 'rejected';
        note?: string;
    }, user: any): Promise<{
        id: string;
        workspaceId: string;
        provider: string;
        requestedById: string;
        status: string;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    oauthStart(workspaceId: string, provider: string, user: any): Promise<{
        authUrl: string;
    }>;
    oauthCallback(provider: string, code: string, state: string, ip: string, reply: FastifyReply): Promise<never>;
    disconnect(workspaceId: string, provider: string, user: any): Promise<{
        ok: boolean;
    }>;
}
