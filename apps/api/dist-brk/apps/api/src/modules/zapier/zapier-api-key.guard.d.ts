import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Db } from '@rundesk/db';
/**
 * Authenticates Zapier (and any programmatic) requests with a workspace API key
 * — the SAME `api_keys` records issued from Settings → Security (`rd_live_…`),
 * created/revoked by {@link ../security/security.service SecurityService}. We
 * reuse that existing key store: no new table, no migration.
 *
 * The Zapier REST-Hook routes have no `:workspaceId` path param, so the caller's
 * workspace has to come from the credential itself — and an API key is bound to
 * exactly one workspace, which is why it is the right mechanism here (a raw JWT
 * session token is not scoped to a single workspace).
 *
 * The key may be presented either as `Authorization: Bearer <key>` (Zapier's
 * default for API-key auth) or `X-API-Key: <key>`. On success we attach:
 *   req.apiKey       – the full api_keys row
 *   req.workspaceId  – the key's workspace
 *   req.user         – { id: <createdById>, … } so `@CurrentUser()` keeps working
 */
export declare class ZapierApiKeyGuard implements CanActivate {
    private readonly db;
    constructor(db: Db);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
export interface ZapierContext {
    workspaceId: string;
    userId: string;
    apiKey: unknown;
}
/**
 * Pulls the workspace + user resolved by {@link ZapierApiKeyGuard} off the
 * request, so controllers stay free of raw request handling.
 */
export declare const ZapierCtx: (...dataOrPipes: unknown[]) => ParameterDecorator;
