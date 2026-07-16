import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { ACCESS_TOKEN_COOKIE } from '../auth-cookies'

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
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: cookieOrBearerExtractor,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET'),
    })
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      flags: payload.flags,
      activeWorkspaceId: payload.workspaceId,
    }
  }
}
