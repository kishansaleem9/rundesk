import type { Db } from '@rundesk/db';
export declare class SecurityService {
    private db;
    constructor(db: Db);
    setupTotp(userId: string): Promise<{
        otpauthUrl: string;
        secret: string;
    }>;
    verifyAndActivateTotp(userId: string, code: string): Promise<{
        backupCodes: string[];
    }>;
    validateTotp(userId: string, code: string): Promise<boolean>;
    disableTotp(userId: string): Promise<void>;
    getTotpStatus(userId: string): Promise<{
        enabled: boolean;
    }>;
    listApiKeys(workspaceId: string): Promise<{
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
    createApiKey(workspaceId: string, userId: string, name: string, scope?: string, ipAddress?: string): Promise<{
        key: string;
        id: string;
        name: string;
        keyPrefix: string;
        scope: string;
        createdAt: Date;
    }>;
    private assertApiKeyOwnership;
    revokeApiKey(workspaceId: string, keyId: string, actorId?: string, ipAddress?: string): Promise<{
        ok: boolean;
    }>;
    deleteApiKey(workspaceId: string, keyId: string, actorId?: string, ipAddress?: string): Promise<{
        ok: boolean;
    }>;
    logAuditEvent(opts: {
        workspaceId?: string;
        actorId?: string;
        actorEmail?: string;
        action: string;
        resourceType?: string;
        resourceId?: string;
        description: string;
        metadata?: Record<string, string | number | boolean | null>;
        ipAddress?: string;
        userAgent?: string;
    }): Promise<void>;
    private auditFilters;
    getAuditLogs(workspaceId: string, opts?: {
        page?: number;
        limit?: number;
        action?: string;
        actionPrefix?: string;
        actionPrefixes?: string[];
        actorId?: string;
        from?: Date;
        to?: Date;
    }): Promise<{
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
    /** Export the (filtered) audit trail as a CSV string (Plan §13.3). */
    exportAuditLogsCsv(workspaceId: string, opts?: {
        action?: string;
        actionPrefix?: string;
        actionPrefixes?: string[];
        actorId?: string;
        from?: Date;
        to?: Date;
    }): Promise<string>;
}
