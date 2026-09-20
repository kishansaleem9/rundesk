import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Db } from '@rundesk/db';
/**
 * Guard that verifies the authenticated user belongs to the workspace
 * referenced by the `:workspaceId` path parameter. Caches the membership
 * row on `request.workspaceMember` for downstream consumers.
 *
 * Use after JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
 */
export declare class WorkspaceMemberGuard implements CanActivate {
    private readonly db;
    constructor(db: Db);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
