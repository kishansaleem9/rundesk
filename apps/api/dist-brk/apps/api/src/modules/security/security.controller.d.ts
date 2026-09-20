import { SecurityService } from './security.service';
export declare class TotpController {
    private readonly svc;
    constructor(svc: SecurityService);
    status(user: any): Promise<{
        enabled: boolean;
    }>;
    setup(user: any): Promise<{
        otpauthUrl: string;
        secret: string;
    }>;
    verify(user: any, body: {
        code: string;
    }): Promise<{
        backupCodes: string[];
    }>;
    disable(user: any): Promise<{
        ok: boolean;
    }>;
}
export declare class ApiKeysController {
    private readonly svc;
    constructor(svc: SecurityService);
    list(workspaceId: string): Promise<{
        id: string;
        name: string;
        keyPrefix: string;
        scope: string;
        isRevoked: boolean;
        lastUsedAt: Date | null;
        requestCount: number;
        expiresAt: Date | null;
        createdAt: Date;
    }[]>;
    create(workspaceId: string, user: any, body: {
        name: string;
        scope?: string;
    }, ip: string): Promise<{
        key: string;
        id: string;
        name: string;
        keyPrefix: string;
        scope: string;
        createdAt: Date;
    }>;
    revoke(workspaceId: string, keyId: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
    delete(workspaceId: string, keyId: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
}
export declare class AuditLogsController {
    private readonly svc;
    constructor(svc: SecurityService);
    list(workspaceId: string, page?: string, limit?: string, action?: string, actionPrefix?: string, actionPrefixes?: string, actorId?: string, from?: string, to?: string): Promise<{
        id: string;
        workspaceId: string | null;
        actorId: string | null;
        actorEmail: string | null;
        action: string;
        resourceType: string | null;
        resourceId: string | null;
        description: string;
        metadata: Record<string, string | number | boolean | null> | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
    }[]>;
    export(workspaceId: string, action?: string, actionPrefix?: string, actionPrefixes?: string, actorId?: string, from?: string, to?: string): Promise<string>;
}
