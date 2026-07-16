import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PlansService } from './plans.service'
import { REQUIRE_PLAN_FEATURE } from './require-plan.decorator'
import type { PlanFeature } from './plans.constants'

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
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plans: PlansService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(REQUIRE_PLAN_FEATURE, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!feature) return true

    const req = ctx.switchToHttp().getRequest()
    const workspaceId: string | undefined =
      req.params?.workspaceId ?? req.body?.workspaceId ?? req.query?.workspaceId
    if (!workspaceId) return true // cannot determine a workspace → do not gate

    await this.plans.assertFeature(workspaceId, feature)
    return true
  }
}
