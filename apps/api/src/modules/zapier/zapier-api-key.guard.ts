import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import * as crypto from 'crypto'
import { apiKeys } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

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
@Injectable()
export class ZapierApiKeyGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const raw = extractApiKey(req)
    if (!raw) throw new UnauthorizedException('Missing API key')

    const keyHash = crypto.createHash('sha256').update(raw).digest('hex')
    const [row] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isRevoked, false)))
      .limit(1)

    if (!row) throw new UnauthorizedException('Invalid API key')
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('API key has expired')
    }

    req.apiKey = row
    req.workspaceId = row.workspaceId
    req.user = { id: row.createdById, apiKeyId: row.id, scope: row.scope }

    // Best-effort usage bookkeeping — must never block or fail the request.
    void (async () => {
      try {
        await this.db
          .update(apiKeys)
          .set({ lastUsedAt: new Date(), requestCount: sql`${apiKeys.requestCount} + 1` })
          .where(eq(apiKeys.id, row.id))
      } catch {
        /* usage stats are best-effort */
      }
    })()

    return true
  }
}

function extractApiKey(req: { headers?: Record<string, unknown> }): string | null {
  const headers = req.headers ?? {}
  const auth = headers['authorization']
  if (typeof auth === 'string') {
    const match = /^bearer\s+(.+)$/i.exec(auth.trim())
    if (match) return match[1].trim()
  }
  const apiKeyHeader = headers['x-api-key']
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) return apiKeyHeader.trim()
  return null
}

export interface ZapierContext {
  workspaceId: string
  userId: string
  apiKey: unknown
}

/**
 * Pulls the workspace + user resolved by {@link ZapierApiKeyGuard} off the
 * request, so controllers stay free of raw request handling.
 */
export const ZapierCtx = createParamDecorator((_data: unknown, ctx: ExecutionContext): ZapierContext => {
  const req = ctx.switchToHttp().getRequest()
  return {
    workspaceId: req.workspaceId,
    userId: req.user?.id,
    apiKey: req.apiKey,
  }
})
