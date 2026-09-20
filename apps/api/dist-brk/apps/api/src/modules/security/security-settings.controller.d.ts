import type { FastifyRequest } from 'fastify';
import { WorkspaceSecuritySettingsService } from './workspace-security-settings.service';
export declare class SecuritySettingsController {
    private readonly svc;
    constructor(svc: WorkspaceSecuritySettingsService);
    get(workspaceId: string, req: FastifyRequest): Promise<{
        currentIp: string;
        workspaceId: string | null;
        ipAllowlistEnabled: boolean;
        ipAllowlist: string[];
        ipAllowlistIncludeAdmins: boolean;
        sessionTimeoutMinutes: number;
        maxConcurrentSessions: number;
        lockoutEnabled: boolean;
        lockoutThreshold: number;
        lockoutDurationMinutes: number;
        requireStrongPasswords: boolean;
        blockBreachedPasswords: boolean;
    }>;
    update(workspaceId: string, user: {
        id: string;
    }, req: FastifyRequest, body: Record<string, unknown>): Promise<{
        currentIp: string;
        workspaceId: string | null;
        ipAllowlistEnabled: boolean;
        ipAllowlist: string[];
        ipAllowlistIncludeAdmins: boolean;
        sessionTimeoutMinutes: number;
        maxConcurrentSessions: number;
        lockoutEnabled: boolean;
        lockoutThreshold: number;
        lockoutDurationMinutes: number;
        requireStrongPasswords: boolean;
        blockBreachedPasswords: boolean;
    }>;
}
