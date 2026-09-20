import { OpsService } from './ops.service';
import type { CurrentUserPayload } from '../tasks/types';
/**
 * §14.5 SaaS Ops Dashboard (Internal). Both routes are super-admin only — they
 * expose cross-tenant platform metrics. The gate mirrors OrganizationsController.
 */
export declare class OpsController {
    private readonly ops;
    constructor(ops: OpsService);
    metrics(user: CurrentUserPayload): Promise<import("./ops.service").OpsMetrics>;
    organizations(user: CurrentUserPayload): Promise<import("./ops.service").OpsOrgRow[]>;
}
