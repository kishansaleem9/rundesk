import { CanActivate, ExecutionContext } from '@nestjs/common';
export type CsrfRequest = {
    method?: string;
    headers?: Record<string, unknown>;
    cookies?: Record<string, string | undefined>;
};
/**
 * Double-submit CSRF decision (pure + unit-testable).
 *
 * Enforced ONLY for cookie-authenticated, state-changing requests:
 *   1. Safe methods (GET/HEAD/OPTIONS) are always allowed — never mutate state.
 *   2. Bearer-authenticated requests (Authorization header present) are exempt:
 *      a cross-site attacker cannot attach that header, so they can't be CSRF'd.
 *   3. Requests carrying NEITHER an `access_token` NOR a `refresh_token` cookie
 *      are not cookie-authenticated, so there is nothing for CSRF to protect.
 *      The refresh_token cookie counts too: cookie-auth refresh/logout present
 *      only a refresh_token, and those state-changing calls must be protected.
 *   4. Otherwise the `X-CSRF-Token` header MUST be present and equal (in
 *      constant time) to the `csrf_token` cookie.
 */
export declare function isCsrfRequestAllowed(req: CsrfRequest): boolean;
/**
 * Global guard that applies {@link isCsrfRequestAllowed} to HTTP requests.
 * Registered via APP_GUARD in AppModule.
 */
export declare class CsrfGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
