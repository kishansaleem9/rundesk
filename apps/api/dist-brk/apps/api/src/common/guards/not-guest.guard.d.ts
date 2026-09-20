import { CanActivate, ExecutionContext } from '@nestjs/common';
/**
 * Blocks users whose global role is 'guest'. Apply AFTER JwtAuthGuard on
 * endpoints that guests may not use (e.g. AI agents, Plan §3.3). Guests can
 * still view/comment through the resource-level guards.
 */
export declare class NotGuestGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean;
}
