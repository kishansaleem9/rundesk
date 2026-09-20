import { Strategy, type JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
/**
 * Dual JWT extractor (Plan §1.1): prefer the httpOnly `access_token` cookie
 * (browser sessions), then fall back to the `Authorization: Bearer` header
 * (API tokens, existing Bearer clients, the test suite). Exported so it can be
 * unit-tested directly without booting Passport.
 */
export declare const cookieOrBearerExtractor: JwtFromRequestFunction;
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    constructor(config: ConfigService);
    validate(payload: any): Promise<{
        id: any;
        email: any;
        role: any;
        flags: any;
        activeWorkspaceId: any;
    }>;
}
export {};
