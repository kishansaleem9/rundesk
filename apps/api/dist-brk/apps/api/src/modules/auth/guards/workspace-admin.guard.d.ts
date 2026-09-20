import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Db } from '@rundesk/db';
/**
 * Workspace-admin or super-admin only. Apply AFTER JwtAuthGuard.
 * Use this in place of WorkspaceMemberGuard for endpoints that mutate
 * workspace-level resources (members, integrations, webhooks, API keys,
 * feature flags, audit log access, etc.).
 */
export declare class WorkspaceAdminGuard implements CanActivate {
    private readonly db;
    constructor(db: Db);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
