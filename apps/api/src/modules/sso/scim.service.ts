import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { scimTokens, users, workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { SecurityService } from '../security/security.service'

type ScimNameInput = {
  givenName?: string
  familyName?: string
  formatted?: string
}

type ScimEmailInput = { value?: string; primary?: boolean }

type ScimUserInput = {
  userName?: string
  displayName?: string
  active?: boolean
  emails?: ScimEmailInput[]
  name?: ScimNameInput
}

type ScimPatchOp = {
  op: 'add' | 'replace' | 'Add' | 'Replace' | 'remove' | 'Remove'
  path?: string
  value?: unknown
}

@Injectable()
export class ScimService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private security: SecurityService,
  ) {}

  // ─── Token management ────────────────────────────────────────────────────

  async listTokens(workspaceId: string) {
    const rows = await this.db
      .select({
        id: scimTokens.id,
        name: scimTokens.name,
        keyPrefix: scimTokens.keyPrefix,
        createdById: scimTokens.createdById,
        lastUsedAt: scimTokens.lastUsedAt,
        expiresAt: scimTokens.expiresAt,
        revokedAt: scimTokens.revokedAt,
        createdAt: scimTokens.createdAt,
      })
      .from(scimTokens)
      .where(eq(scimTokens.workspaceId, workspaceId))
    return rows
  }

  async createToken(
    workspaceId: string,
    actorId: string,
    input: { name: string; expiresAt?: Date | null },
  ) {
    const raw = `scim_${randomBytes(24).toString('base64url')}`
    const hash = this.hash(raw)
    const prefix = raw.slice(0, 12)
    const [row] = await this.db
      .insert(scimTokens)
      .values({
        workspaceId,
        name: input.name,
        tokenHash: hash,
        keyPrefix: prefix,
        createdById: actorId,
        expiresAt: input.expiresAt ?? null,
      })
      .returning()
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'scim.token_created',
      resourceType: 'scim_token',
      resourceId: row.id,
      description: `Created SCIM token "${input.name}"`,
      metadata: { keyPrefix: prefix },
    })
    return { ...row, tokenHash: undefined, token: raw }
  }

  async revokeToken(workspaceId: string, tokenId: string, actorId: string) {
    const [existing] = await this.db
      .select()
      .from(scimTokens)
      .where(and(eq(scimTokens.id, tokenId), eq(scimTokens.workspaceId, workspaceId)))
      .limit(1)
    if (!existing) throw new NotFoundException('SCIM token not found')
    await this.db
      .update(scimTokens)
      .set({ revokedAt: new Date() })
      .where(eq(scimTokens.id, tokenId))
    await this.security.logAuditEvent({
      workspaceId,
      actorId,
      action: 'scim.token_revoked',
      resourceType: 'scim_token',
      resourceId: tokenId,
      description: `Revoked SCIM token "${existing.name}"`,
      metadata: { keyPrefix: existing.keyPrefix },
    })
    return { ok: true }
  }

  // ─── Authentication for SCIM requests ────────────────────────────────────

  /**
   * Validate a bearer token from the Authorization header and return the
   * workspace it grants access to. Updates lastUsedAt on each successful
   * validation.
   */
  async authenticate(rawToken: string | undefined): Promise<string> {
    if (!rawToken || !rawToken.startsWith('scim_')) {
      throw new UnauthorizedException('SCIM bearer token required')
    }
    const hash = this.hash(rawToken)
    const [row] = await this.db
      .select()
      .from(scimTokens)
      .where(eq(scimTokens.tokenHash, hash))
      .limit(1)
    if (!row) throw new UnauthorizedException('Invalid SCIM token')
    if (row.revokedAt) throw new UnauthorizedException('SCIM token has been revoked')
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new UnauthorizedException('SCIM token has expired')
    }
    await this.db
      .update(scimTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(scimTokens.id, row.id))
    return row.workspaceId
  }

  // ─── SCIM 2.0 Users resource ─────────────────────────────────────────────

  /**
   * Map a workspace member row to a SCIM 2.0 Users resource representation.
   */
  private toScimUser(row: {
    user: typeof users.$inferSelect
    membership: typeof workspaceMembers.$inferSelect
  }) {
    const [givenName, ...rest] = (row.user.displayName ?? '').split(' ')
    const familyName = rest.join(' ')
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: row.user.id,
      userName: row.user.email,
      displayName: row.user.displayName ?? row.user.email,
      active: row.user.isActive,
      name: {
        givenName,
        familyName,
        formatted: row.user.displayName ?? row.user.email,
      },
      emails: [
        {
          value: row.user.email,
          primary: true,
          type: 'work',
        },
      ],
      meta: {
        resourceType: 'User',
        created: row.user.createdAt?.toISOString?.() ?? new Date(0).toISOString(),
        lastModified: row.user.updatedAt?.toISOString?.() ?? new Date(0).toISOString(),
        location: `/scim/v2/Users/${row.user.id}`,
      },
    }
  }

  async listUsers(
    workspaceId: string,
    opts: { startIndex?: number; count?: number; filter?: string } = {},
  ) {
    const startIndex = Math.max(1, opts.startIndex ?? 1)
    const count = Math.min(Math.max(opts.count ?? 50, 1), 200)
    const offset = startIndex - 1

    let filterPredicate: ReturnType<typeof eq> | undefined
    if (opts.filter) {
      // Minimal SCIM filter parser supporting: userName eq "x", emails eq "x", active eq true
      const userNameMatch = opts.filter.match(/userName\s+eq\s+"([^"]+)"/i)
      const emailMatch = opts.filter.match(/emails(?:\.value)?\s+eq\s+"([^"]+)"/i)
      const activeMatch = opts.filter.match(/active\s+eq\s+(true|false)/i)
      if (userNameMatch) filterPredicate = eq(users.email, userNameMatch[1].toLowerCase())
      else if (emailMatch) filterPredicate = eq(users.email, emailMatch[1].toLowerCase())
      else if (activeMatch) filterPredicate = eq(users.isActive, activeMatch[1] === 'true')
    }

    const rows = await this.db
      .select({ user: users, membership: workspaceMembers })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        filterPredicate
          ? and(eq(workspaceMembers.workspaceId, workspaceId), filterPredicate)
          : eq(workspaceMembers.workspaceId, workspaceId),
      )
      .limit(count)
      .offset(offset)

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: rows.length,
      startIndex,
      itemsPerPage: rows.length,
      Resources: rows.map((r) => this.toScimUser(r)),
    }
  }

  async getUser(workspaceId: string, userId: string) {
    const [row] = await this.db
      .select({ user: users, membership: workspaceMembers })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.id, userId)))
      .limit(1)
    if (!row) throw new NotFoundException(`User ${userId} not found in workspace`)
    return this.toScimUser(row)
  }

  async createUser(workspaceId: string, actorId: string | null, input: ScimUserInput) {
    const email = (input.userName ?? input.emails?.[0]?.value ?? '').toLowerCase()
    if (!email) throw new BadRequestException('userName or primary email is required')
    const displayName =
      input.displayName ??
      input.name?.formatted ??
      [input.name?.givenName, input.name?.familyName].filter(Boolean).join(' ').trim() ??
      email

    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    if (!workspace) throw new NotFoundException('Workspace not found')

    let user = (await this.db.select().from(users).where(eq(users.email, email)).limit(1))[0]
    let isNewUser = false
    if (!user) {
      const [created] = await this.db
        .insert(users)
        .values({
          email,
          displayName: displayName || email,
          passwordHash: null,
          emailVerified: true,
          isActive: input.active !== false,
        })
        .returning()
      user = created
      isNewUser = true
    } else if (input.active === false && user.isActive) {
      await this.db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, user.id))
      user.isActive = false
    } else if (input.active === true && !user.isActive) {
      await this.db.update(users).set({ isActive: true, updatedAt: new Date() }).where(eq(users.id, user.id))
      user.isActive = true
    }

    const [membership] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
      .limit(1)

    if (membership) {
      // SCIM contract: re-creating an existing user should be idempotent —
      // return the existing record rather than 409. The IdP usually retries
      // creates after a connection blip.
      return this.toScimUser({ user, membership })
    }

    const [created] = await this.db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: user.id, role: 'member' })
      .returning()

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'scim.user_created',
      resourceType: 'user',
      resourceId: user.id,
      description: `SCIM provisioned ${user.email}${isNewUser ? '' : ' (existing user added to workspace)'}`,
      metadata: { email: user.email, isNewUser },
    })

    return this.toScimUser({ user, membership: created })
  }

  async replaceUser(
    workspaceId: string,
    userId: string,
    actorId: string | null,
    input: ScimUserInput,
  ) {
    const [row] = await this.db
      .select({ user: users, membership: workspaceMembers })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.id, userId)))
      .limit(1)
    if (!row) throw new NotFoundException(`User ${userId} not found in workspace`)

    const displayName =
      input.displayName ??
      input.name?.formatted ??
      [input.name?.givenName, input.name?.familyName].filter(Boolean).join(' ').trim()

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
    if (displayName && displayName !== row.user.displayName) updates.displayName = displayName
    if (typeof input.active === 'boolean' && input.active !== row.user.isActive) {
      updates.isActive = input.active
    }
    if (input.userName && input.userName.toLowerCase() !== row.user.email) {
      updates.email = input.userName.toLowerCase()
    }
    if (Object.keys(updates).length > 1) {
      await this.db.update(users).set(updates).where(eq(users.id, userId))
    }

    // If the IdP toggled active=false, also remove the workspace membership
    // (matching the existing removeMember flow). Reactivation via active=true
    // happens on the user row and the next create call will re-add membership.
    if (input.active === false) {
      await this.db
        .delete(workspaceMembers)
        .where(eq(workspaceMembers.id, row.membership.id))
      await this.security.logAuditEvent({
        workspaceId,
        actorId: actorId ?? undefined,
        action: 'scim.user_deactivated',
        resourceType: 'user',
        resourceId: userId,
        description: `SCIM deactivated ${row.user.email}`,
        metadata: { email: row.user.email },
      })
      // Return the updated user row even though membership is gone — caller
      // shouldn't try to re-fetch in workspace context after a deactivate.
      const [refreshed] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
      return this.toScimUser({ user: refreshed ?? row.user, membership: row.membership })
    } else {
      await this.security.logAuditEvent({
        workspaceId,
        actorId: actorId ?? undefined,
        action: 'scim.user_updated',
        resourceType: 'user',
        resourceId: userId,
        description: `SCIM updated ${row.user.email}`,
        metadata: {
          email: row.user.email,
          fields: Object.keys(updates).filter((k) => k !== 'updatedAt').join(','),
        },
      })
    }

    return this.getUser(workspaceId, userId)
  }

  async patchUser(
    workspaceId: string,
    userId: string,
    actorId: string | null,
    patch: { Operations?: ScimPatchOp[] },
  ) {
    if (!patch.Operations || patch.Operations.length === 0) {
      throw new BadRequestException('PATCH body must contain Operations')
    }
    const partial: ScimUserInput = {}
    for (const op of patch.Operations) {
      const opName = op.op.toLowerCase()
      if (opName !== 'add' && opName !== 'replace' && opName !== 'remove') continue
      const path = op.path?.toLowerCase()
      const value = op.value as any
      if (path === 'active') {
        partial.active = opName === 'remove' ? false : Boolean(value)
      } else if (path === 'username') {
        partial.userName = String(value ?? '')
      } else if (path === 'displayname') {
        partial.displayName = String(value ?? '')
      } else if (!path && value && typeof value === 'object') {
        // Bulk replace with no path — merge top-level keys
        Object.assign(partial, value)
      }
    }
    return this.replaceUser(workspaceId, userId, actorId, partial)
  }

  async deleteUser(workspaceId: string, userId: string, actorId: string | null) {
    const [row] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!row) throw new NotFoundException(`User ${userId} not found in workspace`)

    await this.db.delete(workspaceMembers).where(eq(workspaceMembers.id, row.id))

    await this.security.logAuditEvent({
      workspaceId,
      actorId: actorId ?? undefined,
      action: 'scim.user_deleted',
      resourceType: 'user',
      resourceId: userId,
      description: `SCIM removed user ${userId}`,
    })
    return { ok: true }
  }

  serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Long-lived bearer token issued in workspace SCIM settings',
        },
      ],
    }
  }

  schemas() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 1,
      Resources: [
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:User',
          name: 'User',
          description: 'Workspace user provisioning schema',
          attributes: [
            { name: 'userName', type: 'string', required: true, mutability: 'readWrite', uniqueness: 'server' },
            { name: 'displayName', type: 'string', required: false, mutability: 'readWrite' },
            { name: 'active', type: 'boolean', required: false, mutability: 'readWrite' },
          ],
        },
      ],
    }
  }

  resourceTypes() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 1,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/Users',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        },
      ],
    }
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }
}
