import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
type RequestWithCookies = FastifyRequest & {
    cookies?: Record<string, string | undefined>;
};
/**
 * Google / Microsoft social login (Plan §1.1). All three routes use @Res()
 * directly (no passthrough): the two flow routes issue 302 redirects and the
 * providers route returns a plain object the global interceptor envelopes.
 */
export declare class OAuthController {
    private readonly oauth;
    private readonly auth;
    private readonly config;
    constructor(oauth: OAuthService, auth: AuthService, config: ConfigService);
    private get secure();
    private get webBase();
    private stateCookieOptions;
    providers(): {
        google: boolean;
        microsoft: boolean;
    };
    start(provider: string, res: FastifyReply): void;
    callback(provider: string, code: string | undefined, state: string | undefined, providerError: string | undefined, req: RequestWithCookies, res: FastifyReply): Promise<void>;
}
export {};
