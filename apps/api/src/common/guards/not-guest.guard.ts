import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'

/**
 * Blocks users whose global role is 'guest'. Apply AFTER JwtAuthGuard on
 * endpoints that guests may not use (e.g. AI agents, Plan §3.3). Guests can
 * still view/comment through the resource-level guards.
 */
@Injectable()
export class NotGuestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest()
    if (!req.user?.id) throw new ForbiddenException('Not authenticated')
    if (req.user.role === 'guest') throw new ForbiddenException('Guests cannot use this feature')
    return true
  }
}
