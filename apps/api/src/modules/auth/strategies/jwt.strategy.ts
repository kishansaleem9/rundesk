import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import type { Db } from '@rundesk/db'
import { ACCESS_TOKEN_COOKIE } from '../auth-cookies'
import { DB_TOKEN } from '../../../common/database/database.module'
import { sessionIsLive } from '../../../common/security/live-session'

/**
 * Dual JWT extractor (Plan §1.1): prefer the httpOnly `access_token` cookie
 * (browser sessions), then fall back to the `Authorization: Bearer` header
 * (API tokens, existing Bearer clients, the test suite). Exported so it can be
 * unit-tested directly without booting Passport.
 */
export const cookieOrBearerExtractor: JwtFromRequestFunction = (req) => {
  const fromCookie = (req as { cookies?: Record<string, string> })?.cookies?.[ACCESS_TOKEN_COOKIE]
  if (fromCookie) return fromCookie
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    // Guards run before the tenant interceptor, so this is the shared
    // cluster, where every session is written (sign-in has no workspace yet).
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {
    super({
      jwtFromRequest: cookieOrBearerExtractor,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET'),
    })
  }

  /*
   * A SIGNATURE IS NOT A SESSION (`found-30-sep/revoked-sessions-keep-their-access-tokens`):
   * a token whose session is revoked, expired or gone, or that names none, is
   * refused at once (`sessionIsLive`), where it read for the rest of its
   * fifteen minutes. `OptionalJwtAuthGuard` reads such a token as nobody.
   */
  async validate(payload: any) {
    if (!(await sessionIsLive(this.db, payload))) throw new UnauthorizedException('Session ended')
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      flags: payload.flags,
      activeWorkspaceId: payload.workspaceId,
      // Which of the person's sessions this request is: the sessions list and a
      // password change ask it (`found-30-sep/the-callers-session-is-named-by-its-refresh-token`).
      sid: typeof payload.sid === 'string' ? payload.sid : undefined,
    }
  }
}
