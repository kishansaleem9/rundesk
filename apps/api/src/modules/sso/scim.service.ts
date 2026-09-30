import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common'
import { and, asc, eq, type SQL } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { scimTokens, users, workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { sameEmail, storedAsTypedFirst } from '../../common/sql/same-email'
import { SecurityService } from '../security/security.service'
import { WorkspaceGroupsService } from '../workspace-groups/workspace-groups.service'

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
    private groups: WorkspaceGroupsService,
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

    let filterPredicate: SQL | undefined
    if (opts.filter) {
      // Minimal SCIM filter parser supporting: userName eq "x", emails eq "x", active eq true.
      // An email in any case (`found-30-sep/sign-in-reads-the-email-as-typed`).
      const userNameMatch = opts.filter.match(/userName\s+eq\s+"([^"]+)"/i)
      const emailMatch = opts.filter.match(/emails(?:\.value)?\s+eq\s+"([^"]+)"/i)
      const activeMatch = opts.filter.match(/active\s+eq\s+(true|false)/i)
      if (userNameMatch) filterPredicate = sameEmail(users.email, userNameMatch[1])
      else if (emailMatch) filterPredicate = sameEmail(users.email, emailMatch[1])
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

    // In any case, or an account stored with capitals got a second one beside it.
    let user = (
      await this.db
        .select()
        .from(users)
        .where(sameEmail(users.email, email))
        .orderBy(storedAsTypedFirst(users.email, email), asc(users.createdAt))
        .limit(1)
    )[0]
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
      totalResults: 2,
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
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
          name: 'Group',
          description: 'Workspace group (team) provisioning schema',
          attributes: [
            { name: 'displayName', type: 'string', required: true, mutability: 'readWrite' },
            { name: 'externalId', type: 'string', required: false, mutability: 'readWrite' },
            { name: 'members', type: 'complex', multiValued: true, mutability: 'readWrite' },
          ],
        },
      ],
    }
  }

  resourceTypes() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/Users',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'Group',
          name: 'Group',
          endpoint: '/Groups',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        },
      ],
    }
  }

  // ─── SCIM 2.0 Groups resource ────────────────────────────────────────────

  private toScimGroup(group: {
    id: string
    workspaceId: string
    name: string
    externalId: string | null
    createdAt: Date | null
    updatedAt: Date | null
    members: Array<{ userId: string; email?: string; displayName?: string | null }>
  }) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: group.id,
      externalId: group.externalId ?? undefined,
      displayName: group.name,
      members: group.members.map((m) => ({
        value: m.userId,
        display: m.displayName ?? m.email ?? m.userId,
        $ref: `/scim/v2/Users/${m.userId}`,
        type: 'User',
      })),
      meta: {
        resourceType: 'Group',
        created: group.createdAt?.toISOString?.() ?? new Date(0).toISOString(),
        lastModified: group.updatedAt?.toISOString?.() ?? new Date(0).toISOString(),
        location: `/scim/v2/Groups/${group.id}`,
      },
    }
  }

  async listGroups(
    workspaceId: string,
    opts: { startIndex?: number; count?: number; filter?: string } = {},
  ) {
    const startIndex = Math.max(1, opts.startIndex ?? 1)
    const count = Math.min(Math.max(opts.count ?? 50, 1), 200)

    // SCIM filter parser (minimal): displayName eq "x" / externalId eq "x"
    let search: string | undefined
    if (opts.filter) {
      const dn = opts.filter.match(/displayName\s+eq\s+"([^"]+)"/i)
      if (dn) search = dn[1]
    }

    const all = await this.groups.list(workspaceId, { search })
    const sliced = all.slice(startIndex - 1, startIndex - 1 + count)
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: all.length,
      startIndex,
      itemsPerPage: sliced.length,
      Resources: sliced.map((g) =>
        this.toScimGroup({
          id: g.id,
          workspaceId,
          name: g.name,
          externalId: g.externalId,
          createdAt: g.createdAt as Date | null,
          updatedAt: g.updatedAt as Date | null,
          members: g.members.map((m) => ({ userId: m.userId, email: m.email, displayName: m.displayName })),
        }),
      ),
    }
  }

  async getGroup(workspaceId: string, groupId: string) {
    const found = await this.groups.findByIdOrExternal(workspaceId, groupId)
    if (!found) throw new NotFoundException(`Group ${groupId} not found`)
    const full = await this.groups.get(workspaceId, found.id)
    return this.toScimGroup({
      id: full.id,
      workspaceId,
      name: full.name,
      externalId: full.externalId,
      createdAt: full.createdAt as Date | null,
      updatedAt: full.updatedAt as Date | null,
      members: full.members.map((m) => ({ userId: m.userId, email: m.email, displayName: m.displayName })),
    })
  }

  async createGroup(
    workspaceId: string,
    actorId: string | null,
    body: {
      displayName?: string
      externalId?: string | null
      members?: Array<{ value?: string }>
    },
  ) {
    if (!body.displayName) throw new BadRequestException('displayName is required')
    const memberIds = (body.members ?? []).map((m) => m.value).filter((v): v is string => !!v)
    const created = await this.groups.create(workspaceId, actorId, {
      name: body.displayName,
      externalId: body.externalId ?? null,
      memberIds,
    })
    return this.toScimGroup({
      id: created.id,
      workspaceId,
      name: created.name,
      externalId: created.externalId,
      createdAt: created.createdAt as Date | null,
      updatedAt: created.updatedAt as Date | null,
      members: created.members.map((m) => ({ userId: m.userId, email: m.email, displayName: m.displayName })),
    })
  }

  async replaceGroup(
    workspaceId: string,
    groupId: string,
    actorId: string | null,
    body: {
      displayName?: string
      externalId?: string | null
      members?: Array<{ value?: string }>
    },
  ) {
    const found = await this.groups.findByIdOrExternal(workspaceId, groupId)
    if (!found) throw new NotFoundException(`Group ${groupId} not found`)
    await this.groups.update(workspaceId, found.id, actorId, {
      name: body.displayName,
      externalId: body.externalId ?? null,
    })
    if (body.members !== undefined) {
      const memberIds = body.members.map((m) => m.value).filter((v): v is string => !!v)
      await this.groups.replaceMembers(workspaceId, found.id, actorId, memberIds)
    }
    return this.getGroup(workspaceId, found.id)
  }

  async patchGroup(
    workspaceId: string,
    groupId: string,
    actorId: string | null,
    patch: { Operations?: ScimPatchOp[] },
  ) {
    if (!patch.Operations || patch.Operations.length === 0) {
      throw new BadRequestException('PATCH body must contain Operations')
    }
    const found = await this.groups.findByIdOrExternal(workspaceId, groupId)
    if (!found) throw new NotFoundException(`Group ${groupId} not found`)

    for (const op of patch.Operations) {
      const opName = op.op.toLowerCase()
      const path = (op.path ?? '').toLowerCase()

      // Top-level attribute updates
      if (path === 'displayname' || path === 'externalid') {
        const field = path === 'displayname' ? 'name' : 'externalId'
        const value = opName === 'remove' ? null : String(op.value ?? '')
        await this.groups.update(workspaceId, found.id, actorId, {
          [field]: value,
        } as any)
        continue
      }

      // Members updates: add/replace/remove
      if (path === 'members' || path.startsWith('members')) {
        const incoming = Array.isArray(op.value) ? (op.value as any[]) : op.value ? [op.value] : []
        const memberIds = incoming
          .map((m: any) => (typeof m === 'string' ? m : m?.value))
          .filter((v): v is string => !!v)
        if (opName === 'add') {
          await this.groups.addMembers(workspaceId, found.id, actorId, memberIds)
        } else if (opName === 'replace') {
          await this.groups.replaceMembers(workspaceId, found.id, actorId, memberIds)
        } else if (opName === 'remove') {
          // Path may be `members[value eq "userId"]` — extract userId.
          const match = path.match(/value\s+eq\s+"([^"]+)"/i)
          if (match) {
            await this.groups.removeMember(workspaceId, found.id, actorId, match[1])
          } else if (memberIds.length > 0) {
            for (const id of memberIds) {
              await this.groups.removeMember(workspaceId, found.id, actorId, id)
            }
          } else {
            // No filter, no payload → clear all members
            await this.groups.replaceMembers(workspaceId, found.id, actorId, [])
          }
        }
        continue
      }

      // Full-payload replace with no path
      if (!path && op.value && typeof op.value === 'object') {
        const obj = op.value as any
        await this.replaceGroup(workspaceId, found.id, actorId, obj)
      }
    }

    return this.getGroup(workspaceId, found.id)
  }

  async deleteGroup(workspaceId: string, groupId: string, actorId: string | null) {
    const found = await this.groups.findByIdOrExternal(workspaceId, groupId)
    if (!found) throw new NotFoundException(`Group ${groupId} not found`)
    await this.groups.remove(workspaceId, found.id, actorId)
    return { ok: true }
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }
}
