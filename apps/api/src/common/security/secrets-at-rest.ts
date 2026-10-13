import { Inject, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common'
import { and, eq, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import {
  emailAccounts,
  importGrants,
  oauthAccounts,
  secretBoxKey,
  ssoConnections,
  userCalendarAccounts,
  userSearchConnections,
  userTotpSecrets,
  webhooks,
  workspaceIntegrationConnections,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../database/database.module'

/**
 * WHAT IS LEFT IN THE CLEAR IS SEALED WHEN THE SERVER STARTS
 * (`found-13-oct/provider-grants-kept-in-the-clear`).
 *
 * Every provider token, TOTP secret, OIDC client secret and webhook secret is
 * written sealed once `TOKEN_ENCRYPTION_KEY` is set (`sealed-text.ts`). What was
 * kept before — a refresh token written once and never again — would stay in
 * the clear for as long as its grant lives, so at each start the server reads
 * every value of these columns not yet sealed and writes it back, which seals
 * it. Without the key it says so, once, instead.
 */
type Sealed = { name: string; table: PgTable; id: PgColumn; columns: Record<string, PgColumn> }

export const SEALED_COLUMNS: Sealed[] = [
  { name: 'email_accounts', table: emailAccounts, id: emailAccounts.id, columns: { accessToken: emailAccounts.accessToken, refreshToken: emailAccounts.refreshToken } },
  {
    name: 'workspace_integration_connections',
    table: workspaceIntegrationConnections,
    id: workspaceIntegrationConnections.id,
    columns: { accessToken: workspaceIntegrationConnections.accessToken, refreshToken: workspaceIntegrationConnections.refreshToken },
  },
  {
    name: 'user_calendar_accounts',
    table: userCalendarAccounts,
    id: userCalendarAccounts.id,
    columns: { accessToken: userCalendarAccounts.accessToken, refreshToken: userCalendarAccounts.refreshToken },
  },
  { name: 'import_grants', table: importGrants, id: importGrants.id, columns: { accessToken: importGrants.accessToken, refreshToken: importGrants.refreshToken } },
  {
    name: 'user_search_connections',
    table: userSearchConnections,
    id: userSearchConnections.id,
    columns: { accessToken: userSearchConnections.accessToken, refreshToken: userSearchConnections.refreshToken },
  },
  { name: 'oauth_accounts', table: oauthAccounts, id: oauthAccounts.id, columns: { accessToken: oauthAccounts.accessToken, refreshToken: oauthAccounts.refreshToken } },
  { name: 'user_totp_secrets', table: userTotpSecrets, id: userTotpSecrets.id, columns: { secret: userTotpSecrets.secret } },
  { name: 'sso_connections', table: ssoConnections, id: ssoConnections.id, columns: { oidcClientSecret: ssoConnections.oidcClientSecret } },
  { name: 'webhooks', table: webhooks, id: webhooks.id, columns: { secret: webhooks.secret } },
]

/** A kept value written before it was sealed: present, and not the box's. */
const inTheClear = (c: PgColumn): SQL => and(isNotNull(c), sql`${c} not like 'v1:%'`) as SQL

@Injectable()
export class SecretsAtRestService implements OnApplicationBootstrap {
  private readonly log = new Logger('SecretsAtRest')

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  onApplicationBootstrap() {
    if (!secretBoxKey()) {
      this.log.warn('TOKEN_ENCRYPTION_KEY is not set: provider tokens, TOTP secrets and webhook secrets are kept in the clear. Set it (32 bytes) to seal them.')
      return
    }
    // Off the start's path: a large table seals while the server already answers.
    void this.sealLeftovers()
      .then((n) => n > 0 && this.log.log(`sealed ${n} secret(s) kept in the clear`))
      .catch((err) => this.log.warn(`sealing kept secrets failed: ${err instanceof Error ? err.message : String(err)}`))
  }

  /** Each row whose secret is kept in the clear is written again, which seals it. How many were. */
  async sealLeftovers(batch = 200): Promise<number> {
    if (!secretBoxKey()) return 0
    let sealed = 0
    for (const t of SEALED_COLUMNS) {
      const cols = Object.values(t.columns)
      for (let round = 0; round < 1000; round++) {
        const rows = (await this.db
          .select({ id: t.id, ...t.columns })
          .from(t.table)
          .where(or(...cols.map(inTheClear)))
          .limit(batch)) as Array<Record<string, string | null>>
        if (rows.length === 0) break
        for (const row of rows) {
          const values = Object.fromEntries(Object.keys(t.columns).map((k) => [k, row[k]]))
          await this.db.update(t.table).set(values).where(eq(t.id, row.id as string))
          sealed += 1
        }
        if (rows.length < batch) break
      }
    }
    return sealed
  }
}

@Module({ providers: [SecretsAtRestService], exports: [SecretsAtRestService] })
export class SecretsAtRestModule {}
