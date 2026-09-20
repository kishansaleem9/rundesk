import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlansService } from './plans.service';
/**
 * Enforces `@RequirePlan(feature)` (Plan §14.1). Resolves the workspace id from
 * the route param, request body, or query string, then asks PlansService whether
 * that workspace's plan includes the feature — throwing 403 if not.
 *
 * Fail-open by design in two cases so it can NEVER break existing behavior:
 *   1. No `@RequirePlan` metadata on the handler/class  → allow.
 *   2. No workspace id resolvable from the request      → allow (can't gate).
 *
 * For an enterprise workspace every feature is enabled, so this is always a
 * no-op there — which is every existing workspace by default.
 */
export declare class PlanFeatureGuard implements CanActivate {
    private readonly reflector;
    private readonly plans;
    constructor(reflector: Reflector, plans: PlansService);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
