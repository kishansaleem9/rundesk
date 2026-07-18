import { Injectable, Inject, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as bcrypt from 'bcryptjs'
import {
  users,
  oauthAccounts,
  sessions,
  workspaceMembers,
  workspaces,
  organizationMembers,
  organizations,
  tasks,
  taskAssignees,
  taskComments,
  timeEntries,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'

/** Locales the web app ships translations for (Plan §13). */
export const SUPPORTED_LOCALES = ['en', 'es', 'ar', 'ur'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/** UI theme preferences (Plan §13.1). 'system' follows the OS setting. */
export const THEME_VALUES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_VALUES)[number]

/** Image content types accepted for avatar uploads, mapped to a file extension. */
const AVATAR_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Hard cap on an uploaded avatar image (Plan §1.2). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly r2: R2Service,
  ) {}

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id))
    return user ?? null
  }

  async findByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    return user ?? null
  }

  async create(data: { email: string; displayName: string; passwordHash?: string; emailVerified?: boolean }) {
    const [user] = await this.db.insert(users).values(data).returning()
    return user
  }

  async updateProfile(
    userId: string,
    patch: { displayName?: string; bio?: string | null; timezone?: string; avatarUrl?: string | null; locale?: string; theme?: string },
  ) {
    if (patch.locale !== undefined && !SUPPORTED_LOCALES.includes(patch.locale as SupportedLocale)) {
      throw new BadRequestException(`Unsupported locale: ${patch.locale}`)
    }
    if (patch.theme !== undefined && !THEME_VALUES.includes(patch.theme as ThemePreference)) {
      throw new BadRequestException(`Unsupported theme: ${patch.theme}`)
    }
    // SECURITY: whitelist the self-editable profile columns. Spreading the raw
    // body let a caller mass-assign any users column — most critically `role`,
    // so `PATCH /users/me {role:"super_admin"}` escalated a member to platform
    // super-admin. Only copy the fields a user is allowed to change themselves.
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['displayName', 'bio', 'timezone', 'avatarUrl', 'locale', 'theme'] as const) {
      if (patch[key] !== undefined) set[key] = patch[key]
    }
    const [row] = await this.db
      .update(users)
      .set(set)
      .where(eq(users.id, userId))
      .returning()
    if (!row) throw new BadRequestException('User not found')
    return this.publicProfile(row)
  }

  /**
   * Presign a direct-to-R2 PUT for a user's avatar image (Plan §1.2). Mirrors
   * the clip/attachment presign flow: validate the image type + size, hand back
   * a short-lived upload URL plus the public URL the client stores via
   * PATCH /users/me. Keys live under `avatars/<userId>-<rand>.<ext>`.
   */
  async createAvatarUploadUrl(userId: string, body: { contentType: string; sizeBytes?: number }) {
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    const contentType = (body.contentType || '').toLowerCase()
    const ext = AVATAR_CONTENT_TYPES[contentType]
    if (!ext) {
      throw new BadRequestException('Only image files (PNG, JPEG, WebP, or GIF) are allowed')
    }
    if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > MAX_AVATAR_BYTES) {
      const mb = Math.round(MAX_AVATAR_BYTES / (1024 * 1024))
      throw new BadRequestException(`Avatar image exceeds the ${mb} MB limit`)
    }
    const key = `avatars/${userId}-${randomBytes(8).toString('hex')}.${ext}`
    const uploadUrl = await this.r2.presignPutObject(key, contentType, { uploadedby: userId })
    // Resolve the browser-facing URL the same way clips/attachments do; with a
    // public R2/CDN domain this is a stable URL suitable for persisting.
    const publicUrl = await this.r2.getObjectUrl(key)
    return { uploadUrl, publicUrl, storageKey: key }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters')
    const user = await this.findById(userId)
    if (!user) throw new BadRequestException('User not found')
    if (!user.passwordHash) throw new BadRequestException('Account uses SSO; set a password via reset flow')
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) throw new UnauthorizedException('Current password is incorrect')
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
    return { ok: true }
  }

  /**
   * GDPR data portability (Plan §14.6). Assemble a JSON bundle of everything we
   * hold that is personal to THIS user: their profile, their workspace/org
   * memberships, the tasks they authored or are assigned to, their comments, and
   * their time entries. Strictly scoped to the requesting user's own data —
   * secrets (password hash, OAuth tokens) are never included.
   */
  async exportUserData(userId: string) {
    const user = await this.findById(userId)
    if (!user) throw new BadRequestException('User not found')

    const [
      workspaceMemberships,
      orgMemberships,
      tasksCreated,
      tasksAssigned,
      comments,
      timeEntryRows,
      connectedAccounts,
    ] = await Promise.all([
      this.db
        .select({
          workspaceId: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          role: workspaceMembers.role,
          joinedAt: workspaceMembers.joinedAt,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(eq(workspaceMembers.userId, userId)),
      this.db
        .select({
          organizationId: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          role: organizationMembers.role,
          joinedAt: organizationMembers.joinedAt,
        })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
        .where(eq(organizationMembers.userId, userId)),
      this.db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status, createdAt: tasks.createdAt })
        .from(tasks)
        .where(eq(tasks.createdById, userId))
        .orderBy(desc(tasks.createdAt))
        .limit(5000),
      this.db
        .select({ taskId: tasks.id, title: tasks.title, assignedAt: taskAssignees.assignedAt })
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .where(eq(taskAssignees.userId, userId))
        .orderBy(desc(taskAssignees.assignedAt))
        .limit(5000),
      this.db
        .select({ id: taskComments.id, taskId: taskComments.taskId, body: taskComments.body, createdAt: taskComments.createdAt })
        .from(taskComments)
        .where(eq(taskComments.authorId, userId))
        .orderBy(desc(taskComments.createdAt))
        .limit(5000),
      this.db
        .select({
          id: timeEntries.id,
          taskId: timeEntries.taskId,
          startedAt: timeEntries.startedAt,
          endedAt: timeEntries.endedAt,
          durationSec: timeEntries.durationSec,
          description: timeEntries.description,
          isBillable: timeEntries.isBillable,
        })
        .from(timeEntries)
        .where(eq(timeEntries.userId, userId))
        .orderBy(desc(timeEntries.startedAt))
        .limit(5000),
      this.db
        .select({ provider: oauthAccounts.provider, connectedAt: oauthAccounts.createdAt })
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, userId)),
    ])

    return {
      format: 'rundesk.gdpr.export.v1',
      exportedAt: new Date().toISOString(),
      profile: this.publicProfile(user),
      memberships: { workspaces: workspaceMemberships, organizations: orgMemberships },
      tasks: { created: tasksCreated, assigned: tasksAssigned },
      comments,
      timeEntries: timeEntryRows,
      connectedAccounts,
      counts: {
        workspaces: workspaceMemberships.length,
        organizations: orgMemberships.length,
        tasksCreated: tasksCreated.length,
        tasksAssigned: tasksAssigned.length,
        comments: comments.length,
        timeEntries: timeEntryRows.length,
      },
    }
  }

  /**
   * GDPR right to erasure (Plan §14.6). Irreversibly anonymizes the account:
   * scrubs all PII from the users row, deletes sessions (revokes access), OAuth
   * links, task assignments and every workspace/org membership. Authored content
   * (tasks, comments, time entries) is retained but de-identified — the FKs point
   * at a scrubbed, de-membered row, preserving workspace integrity without
   * keeping the person identifiable.
   *
   * Safety guards (never orphan an org/workspace):
   *   - Requires typing the exact account email to confirm.
   *   - Refuses to delete the last active super admin.
   *   - Refuses to delete the last admin of any workspace (transfer admin first).
   */
  async deleteAccount(userId: string, confirmation: { confirmEmail?: string }): Promise<{
    ok: true
    anonymized: true
    userId: string
  }> {
    const user = await this.findById(userId)
    if (!user) throw new BadRequestException('User not found')

    // 1. Confirmation — the caller must retype their exact account email.
    const typed = (confirmation?.confirmEmail ?? '').trim().toLowerCase()
    if (!typed || typed !== user.email.toLowerCase()) {
      throw new BadRequestException('Type your account email exactly to confirm account deletion')
    }

    // 2. Never delete the last active super admin.
    if (user.role === 'super_admin') {
      const [{ c }] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, 'super_admin'), eq(users.isActive, true)))
      if (c <= 1) {
        throw new BadRequestException(
          'Cannot delete the last active super admin. Grant super admin to another account first.',
        )
      }
    }

    // 3. Never delete the last admin of a workspace — would orphan it.
    const adminOf = await this.db
      .select({ workspaceId: workspaceMembers.workspaceId, name: workspaces.name })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, 'workspace_admin' as any)))
    for (const ws of adminOf) {
      const [{ c }] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ws.workspaceId), eq(workspaceMembers.role, 'workspace_admin' as any)))
      if (c <= 1) {
        throw new BadRequestException(
          `You are the last admin of "${ws.name}". Transfer workspace admin to another member before deleting your account.`,
        )
      }
    }

    // 4. Irreversibly anonymize + revoke, atomically. The anonymized email is
    //    keyed by the user id so it stays unique even across many deletions.
    const anonEmail = `deleted+${userId}@deleted.rundesk.local`
    await this.db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, userId))
      await tx.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId))
      await tx.delete(taskAssignees).where(eq(taskAssignees.userId, userId))
      await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId))
      await tx.delete(organizationMembers).where(eq(organizationMembers.userId, userId))
      await tx
        .update(users)
        .set({
          email: anonEmail,
          displayName: 'Deleted User',
          bio: null,
          avatarUrl: null,
          passwordHash: null,
          timezone: 'UTC',
          locale: 'en',
          theme: 'system',
          isActive: false,
          emailVerified: false,
          lastSeenAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
    })

    return { ok: true, anonymized: true, userId }
  }

  publicProfile(user: typeof users.$inferSelect) {
    const { passwordHash, ...rest } = user
    void passwordHash
    return rest
  }
}
