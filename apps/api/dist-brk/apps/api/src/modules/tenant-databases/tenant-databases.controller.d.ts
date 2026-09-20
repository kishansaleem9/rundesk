import { TenantDatabasesService } from './tenant-databases.service';
import type { TenantDatabaseStatus } from './tenant-databases.service';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * §14.2 — super-admin operations surface for the dedicated-database registry.
 * Every handler is gated to `super_admin` (mirrors the org super-admin routes);
 * the raw connection string is only ever accepted on input, never returned.
 */
export declare class TenantDatabasesController {
    private readonly tenantDatabases;
    constructor(tenantDatabases: TenantDatabasesService);
    list(user: CurrentUserPayload): Promise<import("./tenant-databases.service").TenantDatabaseView[]>;
    upsert(organizationId: string, body: {
        connectionUrl: string;
        label?: string | null;
        status?: TenantDatabaseStatus;
    }, user: CurrentUserPayload): Promise<import("./tenant-databases.service").TenantDatabaseView>;
    test(organizationId: string, user: CurrentUserPayload): Promise<import("./tenant-databases.service").TestConnectionResult>;
    provision(organizationId: string, user: CurrentUserPayload): Promise<import("./tenant-databases.service").ProvisionSchemaResult>;
    schemaStatus(organizationId: string, user: CurrentUserPayload): Promise<import("./tenant-databases.service").SchemaStatusResult>;
    migrateData(organizationId: string, body: {
        dryRun?: boolean;
    }, user: CurrentUserPayload): Promise<import("./tenant-databases.service").MigrateOrgDataResult>;
    disable(organizationId: string, user: CurrentUserPayload): Promise<import("./tenant-databases.service").TenantDatabaseView | null>;
    remove(organizationId: string, user: CurrentUserPayload): Promise<{
        ok: true;
    }>;
}
