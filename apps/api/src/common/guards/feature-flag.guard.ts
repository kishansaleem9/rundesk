import { Injectable, CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FEATURE_FLAG_KEY } from '../decorators/feature-flag.decorator'
import { FeatureFlagsService } from '../../modules/feature-flags/feature-flags.service'
import type { FlagKey } from '@rundesk/feature-flags'

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFlags = this.reflector.getAllAndOverride<FlagKey[]>(
      FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!requiredFlags?.length) return true

    const request = context.switchToHttp().getRequest()
    const user = request.user

    for (const flag of requiredFlags) {
      const enabled = await this.featureFlagsService.isEnabled(flag, {
        userId: user?.id,
        workspaceId: request.params?.workspaceId ?? user?.activeWorkspaceId,
        role: user?.role,
      })

      // Return 404 — feature does not exist when disabled
      if (!enabled) throw new NotFoundException()
    }

    return true
  }
}
