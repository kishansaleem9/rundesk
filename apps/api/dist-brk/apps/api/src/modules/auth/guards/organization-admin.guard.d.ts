import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Db } from '@rundesk/db';
export declare class OrganizationAdminGuard implements CanActivate {
    private readonly db;
    constructor(db: Db);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
