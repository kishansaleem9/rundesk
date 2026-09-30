import { Injectable, Inject, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { ACCENT_PALETTE } from '@rundesk/feature-flags'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { passwords } from '../../common/security/password-hash'
import { hashRefreshToken } from '../../common/security/refresh-token'
import { sameEmail, storedAsTypedFirst } from '../../common/sql/same-email'
import { WorkspaceSecuritySettingsService } from '../security/workspace-security-settings.service'
import {
  users,
  userNotepads,
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
import { isValidTimeZone } from '../../common/time/zone'
import { R2Service } from '../../common/storage/r2.service'
import { isPublicImagePath, publicImagePath } from '../../common/storage/public-images.controller'

/** Locales the web app ships translations for (Plan §13). */
export const SUPPORTED_LOCALES = ['en', 'es', 'ar', 'ur'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/** UI theme preferences (Plan §13.1). 'system' follows the OS setting. */
export const THEME_VALUES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_VALUES)[number]

/** Date / time / week-start display preferences (Plan §1.2). 'system' follows the browser locale. */
export const DATE_FORMAT_VALUES = ['system', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'] as const
export type DateFormatPreference = (typeof DATE_FORMAT_VALUES)[number]
export const TIME_FORMAT_VALUES = ['system', '12h', '24h'] as const
export type TimeFormatPreference = (typeof TIME_FORMAT_VALUES)[number]
export const WEEK_START_VALUES = ['sunday', 'monday', 'saturday'] as const
export type WeekStartPreference = (typeof WEEK_START_VALUES)[number]

/**
 * §1.5 / §6 — every top-bar control a member governs.
 *
 * Search and the user menu are deliberately absent: one is the primary way to
 * find anything and the other is how you reach this setting, so hiding either
 * would be a trap. Everything else is the member's call —
 * "yeh option jo hai woh humare members ke paas hona chahiye".
 *
 * §6 [07:55–08:03] — every tool a member can pin to the top bar.
 *
 * She lists what she pins: "yeh task creation ka option hai, yeh timing ka
 * option, yeh document ka, yeh Loom ka, yeh voice recordings ka, yeh
 * whiteboards ka, aur yeh dashboard ka option hai." The first five entries
 * below are the chrome that was already there; the rest are hers.
 *
 * The complaint this answers is [08:29]: "as compared to hum limited de dein
 * ke okay, theek hai, something ke hum ne rakha hai aur woh us ko choose karna
 * parega." A short list we picked is the thing she was objecting to, so adding
 * to this list is how the answer stays answered.
 */
export const TOPBAR_ITEMS = [
  'notifications', 'theme', 'timer', 'ai', 'create',
  // §6 frame 087_0535 — "Personal Tools": Notepad sits among these, pinnable.
  'notepad',
  'docs', 'clips', 'recordings', 'whiteboards', 'dashboards',
] as const
export type TopbarItem = (typeof TOPBAR_ITEMS)[number]

/**
 * What a member who has never opened the picker gets.
 *
 * Deliberately small. The point of pinning is that the bar holds what *you*
 * reach for, and a bar preloaded with ten icons has made the choice for you
 * again — just with a longer list.
 */
export const DEFAULT_PINNED: TopbarItem[] = ['create', 'timer', 'theme']

/**
 * §1.3 [10:13] — the surfaces whose SECOND-level panel can be collapsed.
 *
 * "yeh DOUBLE NAVIGATION rakhi hui hai… kyunke yeh SPACE leta hai." Chat's
 * channel list and Docs' tree are the two columns that stack against the
 * workspace sidebar and make her point.
 *
 * A whitelist rather than "whatever the client sends", for the same reason
 * TOPBAR_ITEMS is one: `panels_collapsed` is jsonb, and an unchecked object
 * from a request body is a place to park arbitrary data on a user's row.
 */
export const COLLAPSIBLE_PANELS = ['chat', 'docs'] as const
export type CollapsiblePanel = (typeof COLLAPSIBLE_PANELS)[number]

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
    private readonly securitySettings: WorkspaceSecuritySettingsService,
  ) {}

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id))
    return user ?? null
  }

  /**
   * The account with this email, in any case (`sameEmail`,
   * `found-30-sep/sign-in-reads-the-email-as-typed`): sign-in, sign-up's check
   * that the email is free, forgot-password and the verification link's resend
   * all read it through here. Of two accounts differing only in case, the one
   * stored as typed, then the older.
   */
  async findByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(sameEmail(users.email, email))
      .orderBy(storedAsTypedFirst(users.email, email), asc(users.createdAt))
      .limit(1)
    return user ?? null
  }

  async create(data: { email: string; displayName: string; passwordHash?: string; emailVerified?: boolean }) {
    const [user] = await this.db.insert(users).values(data).returning()
    return user
  }

  async updateProfile(
    userId: string,
    patch: {
      displayName?: string
      bio?: string | null
      timezone?: string
      timezoneChangeNotice?: boolean
      avatarUrl?: string | null
      locale?: string
      theme?: string
      dateFormat?: string
      timeFormat?: string
      weekStart?: string
      topbarHidden?: string[]
      topbarPinned?: string[]
      /** §1.3 — the sidebar collapse, as a preference of the person. */
      sidebarCollapsed?: boolean
      /** §1.3 [10:13] — the second-level panels, collapsed per surface. */
      panelsCollapsed?: Record<string, boolean>
      /** §G06 [07:03] — high-contrast text and borders. */
      highContrast?: boolean
      accentColor?: string | null
    },
  ) {
    if (patch.locale !== undefined && !SUPPORTED_LOCALES.includes(patch.locale as SupportedLocale)) {
      throw new BadRequestException(`Unsupported locale: ${patch.locale}`)
    }
    if (patch.theme !== undefined && !THEME_VALUES.includes(patch.theme as ThemePreference)) {
      throw new BadRequestException(`Unsupported theme: ${patch.theme}`)
    }
    if (patch.dateFormat !== undefined && !DATE_FORMAT_VALUES.includes(patch.dateFormat as DateFormatPreference)) {
      throw new BadRequestException(`Unsupported date format: ${patch.dateFormat}`)
    }
    if (patch.timeFormat !== undefined && !TIME_FORMAT_VALUES.includes(patch.timeFormat as TimeFormatPreference)) {
      throw new BadRequestException(`Unsupported time format: ${patch.timeFormat}`)
    }
    if (patch.weekStart !== undefined && !WEEK_START_VALUES.includes(patch.weekStart as WeekStartPreference)) {
      throw new BadRequestException(`Unsupported week start: ${patch.weekStart}`)
    }
    if (patch.topbarHidden !== undefined) {
      // Validate every entry rather than storing what arrived: this is a jsonb
      // column, so an unvalidated array is a place to park arbitrary data on
      // another user's row via a field the client controls.
      if (!Array.isArray(patch.topbarHidden)) {
        throw new BadRequestException('topbarHidden must be an array')
      }
      const unknown = patch.topbarHidden.filter(
        (item) => !TOPBAR_ITEMS.includes(item as TopbarItem),
      )
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown top bar item(s): ${unknown.join(', ')}`)
      }
      // De-duplicate so the stored value is a set, not a log of clicks.
      patch.topbarHidden = [...new Set(patch.topbarHidden)]
    }
    if (patch.topbarPinned !== undefined) {
      // Same reasoning as topbarHidden above: a jsonb column fed straight from
      // the client is a place to park arbitrary data on a user row unless every
      // entry is checked against the catalogue.
      if (!Array.isArray(patch.topbarPinned)) {
        throw new BadRequestException('topbarPinned must be an array')
      }
      const unknown = patch.topbarPinned.filter(
        (item) => !TOPBAR_ITEMS.includes(item as TopbarItem),
      )
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown top bar item(s): ${unknown.join(', ')}`)
      }
      patch.topbarPinned = [...new Set(patch.topbarPinned)]
    }
    /*
     * A named palette, not a hex field.
     *
     * Her frame shows ClickUp's Themes tab as ten named colours, and that is
     * the right shape for two reasons beyond fidelity: an arbitrary hex can be
     * unreadable against either theme, and a fixed set is the only version of
     * this that can be checked. null clears the choice back to the workspace's.
     */
    if (
      patch.accentColor !== undefined &&
      patch.accentColor !== null &&
      !(ACCENT_PALETTE as readonly string[]).includes(patch.accentColor)
    ) {
      throw new BadRequestException(`accentColor must be null or one of: ${ACCENT_PALETTE.join(', ')}`)
    }
    if (patch.highContrast !== undefined && typeof patch.highContrast !== 'boolean') {
      throw new BadRequestException('highContrast must be a boolean')
    }
    if (patch.sidebarCollapsed !== undefined && typeof patch.sidebarCollapsed !== 'boolean') {
      // A jsonb column would swallow anything; this one is a boolean and should
      // say so rather than storing whatever arrived.
      throw new BadRequestException('sidebarCollapsed must be a boolean')
    }
    if (patch.panelsCollapsed !== undefined) {
      /*
       * §1.3 [10:13] — same reasoning as topbarHidden two blocks up.
       *
       * This IS a jsonb column fed straight from the client, so an unvalidated
       * object is a place to park arbitrary data on a user row. Keys are
       * checked against the surfaces that have a panel, and values must be
       * booleans — an object rebuilt from the whitelist rather than the one
       * that arrived, so nothing rides along in it.
       */
      const value = patch.panelsCollapsed
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new BadRequestException('panelsCollapsed must be an object')
      }
      const unknown = Object.keys(value).filter((k) => !COLLAPSIBLE_PANELS.includes(k as CollapsiblePanel))
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown panel(s): ${unknown.join(', ')}`)
      }
      const clean: Record<string, boolean> = {}
      for (const key of COLLAPSIBLE_PANELS) {
        if (value[key] !== undefined) {
          if (typeof value[key] !== 'boolean') {
            throw new BadRequestException(`panelsCollapsed.${key} must be a boolean`)
          }
          clean[key] = value[key]
        }
      }
      patch.panelsCollapsed = clean
    }
    // SECURITY: whitelist the self-editable profile columns. Spreading the raw
    // body let a caller mass-assign any users column — most critically `role`,
    // so `PATCH /users/me {role:"super_admin"}` escalated a member to platform
    // super-admin. Only copy the fields a user is allowed to change themselves.
    /*
     * G06-6 [07:03] — refuse a timezone this system cannot read.
     *
     * `startOfDayIn` falls back to UTC on anything unrecognised so that one bad
     * row cannot take down a profile page, and the cost of that is silence:
     * somebody who typed "Asia/Karach" would get UTC for every due date,
     * reminder, digest and "today" bucket with nothing saying so. Checked here
     * rather than only in the form, because the form is not the only writer.
     */
    if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
      throw new BadRequestException(
        `"${String(patch.timezone)}" is not a timezone this system recognises`,
      )
    }

    /*
     * A PICTURE IS ONE WE STORE, OR NONE: an upload's own address
     * (`isPublicImagePath`), or the picture already saved, which a sign-in
     * provider writes directly and a save sends back unchanged.
     */
    if (patch.avatarUrl !== undefined && patch.avatarUrl !== null && !isPublicImagePath(patch.avatarUrl, 'avatars/')) {
      const [current] = await this.db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1)
      if (patch.avatarUrl !== current?.avatarUrl) {
        throw new BadRequestException('A profile picture must be an image uploaded here')
      }
    }

    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['displayName', 'bio', 'timezone', 'avatarUrl', 'locale', 'theme', 'dateFormat', 'timeFormat', 'weekStart', 'topbarHidden', 'topbarPinned', 'sidebarCollapsed', 'panelsCollapsed', 'highContrast', 'timezoneChangeNotice', 'accentColor'] as const) {
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
    // The address the avatar is SAVED as, so it must not expire: the public
    // images route signs a fresh URL per request. `getObjectUrl` here saved a
    // 15-minute presigned GET wherever no public domain is configured.
    const publicUrl = publicImagePath(key)
    return { uploadUrl, publicUrl, storageKey: key }
  }

  /**
   * CHANGING ONE'S PASSWORD (`found-30-sep/password-change-unthrottled`).
   *
   * It compares the current password with the account's hash on every
   * request, so a session somebody else holds could guess the password behind
   * it, one hash a request: the route now has sign-in's ten a minute, per
   * person (`AUTH_ROUTE_LIMITS.passwordChange`). The new password was checked
   * for length alone; it is held to the workspace's password policy now, as
   * reset-password holds it (strong by default). And every other session was
   * kept, where reset-password revokes them all: the change revokes every
   * session of the account but the caller's, in the transaction that writes
   * the password. ClickUp holds a changed password to the rule every password
   * meets ("Change your username, email, and password": 8 characters, an upper
   * and a lower case letter, a number or symbol); OWASP's ASVS 3.3.3 asks that
   * a password change can "terminate all other active sessions".
   *
   * `keepRefreshToken` names the caller's session: its refresh token, which a
   * browser sends as its refresh cookie and a client with no cookie in the body
   * (`currentRefreshToken`, as "sign out other sessions" takes it). A session
   * stored before refresh tokens were hashed matches it raw. A caller that
   * names none keeps none, as after a reset; its access token lives out its
   * minutes. Answers how many sessions it revoked.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string, keepRefreshToken?: string | null) {
    if (typeof newPassword !== 'string' || newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters')
    const user = await this.findById(userId)
    if (!user) throw new BadRequestException('User not found')
    if (!user.passwordHash) throw new BadRequestException('Account uses SSO; set a password via reset flow')
    // On a worker, and at the cost every other hash has (`found-30-sep/password-hash-holds-the-event-loop`):
    // this one hashed at 10, on the event loop.
    const ok = typeof currentPassword === 'string' && (await passwords.compare(currentPassword, user.passwordHash))
    if (!ok) throw new UnauthorizedException('Current password is incorrect')
    const { settings } = await this.securitySettings.getEffectiveForUser(userId)
    await this.securitySettings.enforcePasswordPolicy(newPassword, {
      requireStrong: settings.requireStrongPasswords,
      blockBreached: settings.blockBreachedPasswords,
    })
    const passwordHash = await passwords.hash(newPassword)
    const kept = keepRefreshToken ? [hashRefreshToken(keepRefreshToken), keepRefreshToken] : []
    const revoked = await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId))
      return tx
        .update(sessions)
        .set({ isRevoked: true })
        .where(and(eq(sessions.userId, userId), eq(sessions.isRevoked, false), ...kept.map((token) => ne(sessions.refreshToken, token))))
        .returning({ id: sessions.id })
    })
    return { ok: true, revoked: revoked.length }
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

  /**
   * §6 frame `087_0535` — the Notepad from Personal Tools.
   *
   * Read returns '' rather than 404 for somebody who has never written in it:
   * an empty scratch pad and a missing one are the same thing to a person, and
   * a 404 here would make the panel render an error on first open.
   */
  async getNotepad(userId: string) {
    const [row] = await this.db
      .select({ content: userNotepads.content, updatedAt: userNotepads.updatedAt })
      .from(userNotepads)
      .where(eq(userNotepads.userId, userId))
      .limit(1)
    return { content: row?.content ?? '', updatedAt: row?.updatedAt ?? null }
  }

  async saveNotepad(userId: string, content: string) {
    if (typeof content !== 'string') throw new BadRequestException('content must be a string')
    // Bounded so a paste of something enormous cannot become a row nobody can
    // load. Generous enough that no real note hits it.
    const trimmed = content.slice(0, 100_000)
    const [row] = await this.db
      .insert(userNotepads)
      .values({ userId, content: trimmed, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userNotepads.userId,
        set: { content: trimmed, updatedAt: new Date() },
      })
      .returning({ content: userNotepads.content, updatedAt: userNotepads.updatedAt })
    return { content: row.content, updatedAt: row.updatedAt }
  }

}
