import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Db } from '@rundesk/db';
/**
 * Enforces workspace membership for resources nested under a space / project /
 * list / task (which don't carry a `workspaceId` param). Apply AFTER
 * JwtAuthGuard on controllers/routes that read or create those resources but
 * have no other authorization — otherwise any authenticated user could reach
 * another workspace's data by guessing IDs (broken tenant isolation).
 *
 * Resolves the owning workspace from whichever of workspaceId / spaceId /
 * projectId / listId / taskId is present (param first, then body), then checks
 * the caller is a member. super_admin bypasses, matching the other guards.
 */
export declare class ResourceMemberGuard implements CanActivate {
    private readonly db;
    constructor(db: Db);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
    private resolveResource;
    private resolveByKind;
}
