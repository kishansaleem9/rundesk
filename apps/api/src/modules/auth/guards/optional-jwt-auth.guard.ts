import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * THE SESSION IF THERE IS ONE, AND NOBODY IF THERE IS NOT.
 *
 * `JwtAuthGuard` refuses a request with no token, or a bad one, with 401. A
 * route anybody may call, whose answer depends on who is asking, needs the
 * other half: the same cookie-or-Bearer token read the same way (`JwtStrategy`),
 * and `request.user` left null when there is none, or when it does not verify,
 * so the handler decides. A clip's link is the first (`resume-defects/resume-7`):
 * anyone holding it may watch, unless the workspace blocks public sharing, and
 * then only its members may.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false): TUser {
    // An expired or forged token is nobody, not an error: the handler refuses
    // it the way it refuses a stranger, and says what would let them in.
    return (user || null) as TUser
  }
}
