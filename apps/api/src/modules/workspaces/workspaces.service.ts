import { ConflictException, Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import * as crypto from 'crypto'
import { randomBytes } from 'node:crypto'
import * as dns from 'dns'
import { organizationMembers, organizations, workspaces, workspaceMembers, users, tasks, lists, folders, projects, spaces, aiUsage, invitations, workspaceGroups, workspaceGroupMembers, workspaceHolidays, taskTypes, DEFAULT_TASK_TYPES } from '@rundesk/db'
import type { Db } from '@rundesk/db'

import { DB_TOKEN } from '../../common/database/database.module'
import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'
import { R2Service } from '../../common/storage/r2.service'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { SecurityService } from '../security/security.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { PlansService } from '../plans/plans.service'
import { seedListStatuses } from '../lists/list-statuses.defaults'
import { publicImagePath } from '../../common/storage/public-images.controller'

const BASE_SLUG_FALLBACK = 'workspace'

/** Actor context threaded into audit events. `ip` is captured best-effort. */
type AuditActor = { id: string; email?: string; ip?: string }

/** Image content types accepted for a workspace logo upload (Plan §13.5). */
const LOGO_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/** Hard cap on an uploaded workspace logo. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024 // 5 MB

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40) || BASE_SLUG_FALLBACK
}

/**
 * Guided-onboarding checklist (Plan §14.3). Raw counts of the workspace's core
 * objects, plus whether the AI assistant has been used and how many members it
 * has. Each is cheap to compute and drives a checklist step's "done" state.
 */
export type OnboardingCounts = {
  spaces: number
  projects: number
  tasks: number
  members: number
  aiEvents: number
}

/** Per-step done-state for the onboarding checklist. Verifiable from real data. */
export type OnboardingSteps = {
  /** ≥1 space created. */
  space: boolean
  /** ≥1 project created (in any space). */
  project: boolean
  /** ≥1 task created (in any list). */
  task: boolean
  /** ≥2 workspace members — i.e. at least one teammate beyond the creator. */
  invite: boolean
  /** The AI assistant has been used at least once in this workspace. */
  ai: boolean
}

/**
 * Pure done-state computation for the onboarding checklist — kept side-effect
 * free so it is unit-testable without a database. A step is "done" the moment
 * the workspace has real data proving it, so steps auto-check as the user works.
 */
export function computeOnboardingSteps(counts: OnboardingCounts): OnboardingSteps {
  return {
    space: counts.spaces > 0,
    project: counts.projects > 0,
    task: counts.tasks > 0,
    // The workspace creator is always a member; a second member means an
    // invite was accepted (or a member added), so "invite a teammate" is done.
    invite: counts.members > 1,
    ai: counts.aiEvents > 0,
  }
}

/**
 * A workspace's SAFE, PUBLIC branding projection (Plan §13.5). Exactly the
 * fields a custom-domain visitor needs to render the branded entry point —
 * never members, the DNS verification token, plan limits, or any other
 * internal/secret column.
 */
export type PublicWorkspaceBranding = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string | null
  accentColor: string | null
  customDomain: string | null
}

/**
 * Normalize an HTTP `Host` (or a stored custom domain) to a canonical
 * comparison key: trimmed, lowercased, scheme/path stripped, port stripped,
 * trailing FQDN dot removed, and a single leading `www.` removed. Applied to
 * BOTH sides of a custom-domain match so "Example.com:443", "www.example.com"
 * and "example.com" all resolve to the same workspace — and so it does not
 * matter whether the owner saved the bare or the `www.` form. Returns '' when
 * there is nothing usable to match on.
 */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return ''
  let h = host.trim().toLowerCase()
  if (!h) return ''
  h = h.replace(/^https?:\/\//, '') // drop scheme if a full URL was passed (defensive)
  h = h.split('/')[0] ?? '' // drop any path/query segment
  h = h.replace(/:\d+$/, '') // strip port: example.com:443 -> example.com
  h = h.replace(/\.$/, '') // strip trailing FQDN root dot
  h = h.replace(/^www\./, '') // strip a single leading www.
  return h
}

/**
 * §7 — what a brand-new workspace opens with.
 *
 * "Ab agar maine workspace banayi to yeh mere par dependent hai ke maine apne
 * members ko share karna hai ya nahi karna" [09:43]: it is theirs to fill. But
 * an empty workspace has no space, so no project, so no list — and the sidebar,
 * the create modal and every list view all have nothing to show. One of each is
 * the smallest arrangement where the product works on arrival, and all of it
 * can be renamed or deleted.
 *
 * Keyed off the purpose the flow just asked for, because that is the point of
 * asking. 'Personal' and 'Work' want different first words.
 */
const STARTER_CONTENT: Record<string, { space: string; project: string; list: string }> = {
  work: { space: 'Team', project: 'Projects', list: 'To do' },
  personal: { space: 'Personal', project: 'My projects', list: 'To do' },
  school: { space: 'Study', project: 'Courses', list: 'Assignments' },
  default: { space: 'Space', project: 'Projects', list: 'To do' },
}

/**
 * A workspace as its MEMBERS see it: everything but `customDomainToken`, the
 * `rundesk-verify=…` secret that proves control of the custom domain. The
 * member list, the archived list and the sign-in answer (which carries this
 * list) sent it to every member, guests included; the organisation roster had
 * already been narrowed for the same reason. The people who may change the
 * domain still read it from `GET /workspaces/:id`, which the settings page uses.
 */
export function withoutDomainToken<T extends { customDomainToken?: string | null }>(ws: T): Omit<T, 'customDomainToken'> {
  const { customDomainToken: _token, ...rest } = ws
  void _token
  return rest
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly security: SecurityService,
    private readonly webhooks: WebhooksService,
    private readonly r2: R2Service,
    private readonly plans: PlansService,
  ) {}

  /**
   * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
   * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
   * a downed webhook can never break a membership mutation.
   */
  private async fireWebhook(workspaceId: string, event: string, payload: Record<string, unknown>) {
    try {
      await this.webhooks.fire(workspaceId, event, payload)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[webhooks.fire] ${event} failed:`, e)
    }
  }

  /**
   * A member's own workspaces, oldest membership first.
   *
   * THE ORDER IS NOT COSMETIC. This query had no `ORDER BY` at all, and
   * Postgres is free to return an unordered join in whatever order the plan
   * produces — which changes as rows are updated, as the planner switches
   * scan types, and after a vacuum. Eight surfaces render this list, so a
   * person's workspace switcher could reshuffle between two page loads for
   * no reason they could see.
   *
   * `joinedAt` ASC, deliberately matching
   * `WorkspaceSecuritySettingsService.getEffectiveForUser`, which already
   * ordered by it. Those two now agree on which workspace is "first", and
   * "first in your switcher" is the same workspace as "the one whose
   * security policy governs your session" — which is the only defensible
   * reading of a list that a security decision is taken from.
   */
  async findByMember(userId: string) {
    const rows = await this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
      .orderBy(asc(workspaceMembers.joinedAt))
    return rows.map((r) => ({ ...r, workspace: withoutDomainToken(r.workspace) }))
  }

  /** Soft-delete (archive) a workspace so it disappears from members' lists. */
  async archiveWorkspace(workspaceId: string, actor?: AuditActor) {
    const [row] = await this.db
      .update(workspaces)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.archived',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: 'Workspace archived (soft-deleted)',
    })
    return row
  }

  async restoreWorkspace(workspaceId: string, actor?: AuditActor) {
    const [row] = await this.db
      .update(workspaces)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.restored',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: 'Workspace restored from archive',
    })
    return row
  }

  /**
   * Archived workspaces the user still belongs to (Plan §13.4). The regular
   * `/workspaces` list hides these; the settings "Archived" area surfaces them
   * so an admin can restore one. Restore itself is admin-guarded.
   */
  async listArchivedWorkspaces(userId: string) {
    const rows = await this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, true)))
      .orderBy(desc(workspaces.updatedAt))
    return rows.map((r) => ({ ...r, workspace: withoutDomainToken(r.workspace) }))
  }

  /**
   * Archived (soft-deleted) tasks across a workspace (Plan §13.4). Joined up the
   * task → list → project → space tree so we can scope by workspace and show the
   * list/project a task belongs to. Restore uses the existing task-restore route.
   */
  async listArchivedTasks(workspaceId: string, actor?: { id: string; role?: string }) {
    // §2 per-item privacy: drop private tasks the actor may not see. Admin /
    // super-admin callers resolve as managers (undefined filter) and still see all.
    const visFilter = actor
      ? taskVisibilityFilter(
          this.db,
          actor.id,
          await resolveIsManager(this.db, workspaceId, actor.id, actor.role),
        )
      : undefined
    return this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        listId: tasks.listId,
        listName: lists.name,
        projectName: projects.name,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(tasks.listId, lists.id))
      .innerJoin(projects, eq(lists.projectId, projects.id))
      .innerJoin(spaces, eq(projects.spaceId, spaces.id))
      /*
       * ARCHIVED, NOT BINNED. Archive and delete both set `isArchived` — about
       * forty read paths hide a task on that one flag, so a delete that left it
       * false would remove the task from nothing. The consequence is that this
       * list, filtering on `isArchived` alone, also showed everything in the
       * Trash: a row Settings → Archived tasks offered to RESTORE while the
       * Trash offered to DESTROY it, with a thirty-day clock the person could
       * not see from here.
       */
      .where(
        and(
          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, true),
          isNull(tasks.deletedAt),
          visFilter,
        ),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(200)
  }

  /**
   * Presign a direct-to-R2 PUT for a workspace logo (Plan §13.5). Mirrors the
   * avatar/clip presign flow: validate image type + size, return a short-lived
   * upload URL plus the public URL the client persists via PATCH /workspaces/:id
   * (logoUrl). Keys live under `workspace-logos/<workspaceId>-<rand>.<ext>`.
   */
  async createLogoUploadUrl(workspaceId: string, body: { contentType: string; sizeBytes?: number }) {
    if (!this.r2.configured) throw new BadRequestException('R2 storage is not configured')
    const contentType = (body.contentType || '').toLowerCase()
    const ext = LOGO_CONTENT_TYPES[contentType]
    if (!ext) {
      throw new BadRequestException('Only image files (PNG, JPEG, WebP, GIF, or SVG) are allowed')
    }
    if (body.sizeBytes != null && Number.isFinite(body.sizeBytes) && body.sizeBytes > MAX_LOGO_BYTES) {
      const mb = Math.round(MAX_LOGO_BYTES / (1024 * 1024))
      throw new BadRequestException(`Logo image exceeds the ${mb} MB limit`)
    }
    const key = `workspace-logos/${workspaceId}-${randomBytes(8).toString('hex')}.${ext}`
    const uploadUrl = await this.r2.presignPutObject(key, contentType, { workspaceid: workspaceId })
    // Saved as the logo's URL, so it must not expire — see public-images.controller.ts.
    const publicUrl = publicImagePath(key)
    return { uploadUrl, publicUrl, storageKey: key }
  }

  async findById(id: string) {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, id))
    return ws ?? null
  }

  async getMembership(workspaceId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    return row ?? null
  }

  async update(
    workspaceId: string,
    patch: {
      name?: string
      logoUrl?: string | null
      primaryColor?: string | null
      accentColor?: string | null
      customDomain?: string | null
      defaultSpacePrivate?: boolean
      blockPublicSharing?: boolean
    },
    actor?: AuditActor,
  ) {
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    // §A4.2 — a policy switch decides who can see client work, so a truthy-ish
    // body value ("false", 0) must never be read as "on".
    if (patch.defaultSpacePrivate !== undefined) set.defaultSpacePrivate = patch.defaultSpacePrivate === true
    if (patch.blockPublicSharing !== undefined) set.blockPublicSharing = patch.blockPublicSharing === true
    // Changing the custom domain (re)mints a verification token and resets the
    // verified flag (Plan §13).
    if ('customDomain' in patch) {
      const [current] = await this.db
        .select({ customDomain: workspaces.customDomain })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
      const nextDomain = (patch.customDomain ?? '').trim() || null
      set.customDomain = nextDomain
      if ((current?.customDomain ?? null) !== nextDomain) {
        set.customDomainToken = nextDomain ? `rundesk-verify=${crypto.randomBytes(16).toString('hex')}` : null
        set.customDomainVerified = false
      }
    }
    const [row] = await this.db
      .update(workspaces)
      .set(set)
      .where(eq(workspaces.id, workspaceId))
      .returning()
    if (!row) throw new NotFoundException('Workspace not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: `Workspace settings updated`,
      metadata: {
        name: patch.name ?? null,
        logoUrl: patch.logoUrl ?? null,
        primaryColor: patch.primaryColor ?? null,
        accentColor: patch.accentColor ?? null,
        customDomain: patch.customDomain ?? null,
      },
    })
    return row
  }

  /**
   * Verify a workspace's custom domain by looking for the verification token in
   * a TXT record at _rundesk-verify.<domain> (Plan §13).
   */
  async verifyCustomDomain(workspaceId: string) {
    const [ws] = await this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')
    if (!ws.customDomain || !ws.customDomainToken) {
      throw new BadRequestException('Set a custom domain first')
    }
    const host = `_rundesk-verify.${ws.customDomain}`
    let verified = false
    try {
      const records = await dns.promises.resolveTxt(host)
      verified = records.some((chunks) => chunks.join('').includes(ws.customDomainToken!))
    } catch {
      verified = false
    }
    await this.db
      .update(workspaces)
      .set({ customDomainVerified: verified, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
    return { verified, host, expectedTxt: ws.customDomainToken }
  }

  /**
   * Resolve an incoming request `Host` to the workspace that serves it via a
   * VERIFIED custom domain (Plan §13.5 / §2.2). This is the app-layer half of
   * custom domains: `verifyCustomDomain` proves ownership over a DNS TXT record,
   * and this turns a Host header into the branded entry point the SPA boots
   * into. Nothing else in the app previously mapped a Host to a workspace.
   *
   * The match is symmetric — `normalizeHost` is applied to both the incoming
   * Host and each stored `custom_domain` — so case, port, a leading `www.`, and
   * whether the owner saved "example.com" or "www.example.com" never matter. A
   * domain only resolves while it is verified AND its workspace is not archived.
   *
   * Returns a SAFE PUBLIC projection only (id, name, slug, logoUrl,
   * primaryColor, accentColor, customDomain); members, the verification token,
   * plan limits and every other internal column are never returned. Returns
   * null when no verified, non-archived workspace claims the host.
   *
   * TLS: certificate ACME/issuance/storage stays a reverse-proxy concern, but
   * the app now owns the AUTHORIZATION half of it. `isCustomDomainAuthorized`
   * (exposed at `GET /public/tls/authorize`) lets a TLS-terminating proxy ask,
   * per incoming Host, whether to obtain a certificate — answered "yes" only for
   * the very hosts this method would serve. Custom-domain HTTPS is therefore
   * fully automatic in production with no per-domain manual cert step: the app
   * decides which hosts are eligible; the proxy performs ACME and stores certs.
   */
  async resolveByCustomDomain(host: string): Promise<PublicWorkspaceBranding | null> {
    const normalized = normalizeHost(host)
    if (!normalized) return null
    // Only workspaces that actually set a custom domain are candidates — a tiny
    // set. We fetch the two guard flags alongside the safe columns and evaluate
    // the match in JS so the SAME normalization applies to the stored domain and
    // the incoming Host (a plain SQL equality could not compare them
    // symmetrically). The SELECT lists only safe columns, so the verification
    // token, plan limits and members are never even read.
    const rows = await this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        logoUrl: workspaces.logoUrl,
        primaryColor: workspaces.primaryColor,
        accentColor: workspaces.accentColor,
        customDomain: workspaces.customDomain,
        customDomainVerified: workspaces.customDomainVerified,
        isArchived: workspaces.isArchived,
      })
      .from(workspaces)
      .where(isNotNull(workspaces.customDomain))
    const match = rows.find(
      (w) =>
        w.customDomainVerified &&
        !w.isArchived &&
        normalizeHost(w.customDomain) === normalized,
    )
    if (!match) return null
    return {
      id: match.id,
      name: match.name,
      slug: match.slug,
      logoUrl: match.logoUrl,
      primaryColor: match.primaryColor,
      accentColor: match.accentColor,
      customDomain: match.customDomain,
    }
  }

  /**
   * On-demand-TLS authorization decision for a TLS-terminating reverse proxy
   * (Plan §13.5 / §2.2). Returns true IF AND ONLY IF `host` is the VERIFIED
   * custom domain of a live (non-archived) workspace — i.e. exactly the set of
   * hosts the app is willing to serve. It DELEGATES to `resolveByCustomDomain`
   * (same `normalizeHost` canonicalization, same verified + non-archived guards)
   * so the certificate-issuance decision can NEVER diverge from the
   * Host -> workspace serving decision: if the app serves a host it authorizes a
   * certificate for it, and if it does not it refuses. An unverified, unknown,
   * archived, or blank host returns false — which is what stops a proxy from
   * being steered into requesting ACME certificates for arbitrary
   * attacker-supplied domains.
   *
   * See `WorkspacesPublicController.authorizeTls` for the public HTTP "ask"
   * contract a proxy (e.g. Caddy `on_demand_tls`) calls to reach this decision.
   */
  async isCustomDomainAuthorized(host: string): Promise<boolean> {
    return (await this.resolveByCustomDomain(host)) !== null
  }

  /**
   * The People roster (§A4.1). Beyond the membership row it carries the three
   * columns an admin actually audits by — who invited this person, when, and how
   * recently they were here — plus the teams they belong to. Invites are
   * org-scoped, so provenance is joined through the accepted invitation for this
   * workspace's organization; a founding member or one added by hand simply has
   * no invitation and reports null.
   */
  /**
   * Which days the workspace actually works, plus the dates it does not.
   *
   * Capacity was already stored per member; what nothing knew was how those
   * hours are spread. A Sun–Thu week read as two days of overtime and two days
   * idle before this existed.
   */
  async getWorkSchedule(workspaceId: string) {
    const [ws] = await this.db
      .select({ workDays: workspaces.workDays })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')
    const holidays = await this.db
      .select({ id: workspaceHolidays.id, day: workspaceHolidays.day, name: workspaceHolidays.name })
      .from(workspaceHolidays)
      .where(eq(workspaceHolidays.workspaceId, workspaceId))
      .orderBy(asc(workspaceHolidays.day))
    return { workDays: ws.workDays ?? [1, 2, 3, 4, 5], holidays }
  }

  async setWorkDays(workspaceId: string, days: unknown, actor?: AuditActor) {
    if (!Array.isArray(days)) throw new BadRequestException('workDays must be an array')
    // ISO weekdays: Monday is 1 and Sunday is 7. Say so, because JavaScript's
    // own getDay() puts Sunday at 0 and silently dropping it would hand back a
    // 200 and a schedule missing the day the caller asked for.
    const numbers = days.map((d) => Number(d))
    const invalid = numbers.filter((d) => !Number.isInteger(d) || d < 1 || d > 7)
    if (invalid.length) {
      throw new BadRequestException(
        `workDays must be ISO weekdays 1–7 (Monday–Sunday); got ${[...new Set(invalid)].join(', ')}`,
      )
    }
    // De-duplicated and ordered, so downstream code can treat the column as a
    // canonical set rather than whatever arrived over the wire.
    const clean = [...new Set(numbers)].sort()
    if (clean.length === 0) throw new BadRequestException('Pick at least one working day')
    await this.db
      .update(workspaces)
      .set({ workDays: clean, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.work_days_updated',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: `Working days set to ${clean.join(', ')}`,
      // Audit metadata is scalar-valued, so the set is stored as a stable string.
      metadata: { workDays: clean.join(',') },
    })
    return { ok: true, workDays: clean }
  }

  async addHoliday(workspaceId: string, day: string, name: string, actor?: AuditActor) {
    const clean = (day ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new BadRequestException('day must be YYYY-MM-DD')
    const label = (name ?? '').trim()
    if (!label) throw new BadRequestException('name is required')
    const [existing] = await this.db
      .select({ id: workspaceHolidays.id })
      .from(workspaceHolidays)
      .where(and(eq(workspaceHolidays.workspaceId, workspaceId), eq(workspaceHolidays.day, clean)))
      .limit(1)
    if (existing) throw new ConflictException('That date is already a holiday')
    const [row] = await this.db
      .insert(workspaceHolidays)
      .values({ workspaceId, day: clean, name: label })
      .returning()
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.holiday_added',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: `Holiday added: ${label} (${clean})`,
      metadata: { day: clean, name: label },
    })
    return row
  }

  async removeHoliday(workspaceId: string, holidayId: string, actor?: AuditActor) {
    const [row] = await this.db
      .delete(workspaceHolidays)
      .where(and(eq(workspaceHolidays.workspaceId, workspaceId), eq(workspaceHolidays.id, holidayId)))
      .returning()
    if (!row) throw new NotFoundException('Holiday not found')
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'workspace.holiday_removed',
      resourceType: 'workspace',
      resourceId: workspaceId,
      description: `Holiday removed: ${row.name} (${row.day})`,
      metadata: { day: row.day, name: row.name },
    })
    return { ok: true }
  }

  async listMembers(workspaceId: string) {
    const rows = await this.db
      .select({
        userId: users.id,
        workspaceMemberId: workspaceMembers.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
        weeklyCapacityHours: workspaceMembers.weeklyCapacityHours,
        managerId: workspaceMembers.managerId,
        joinedAt: workspaceMembers.joinedAt,
        lastSeenAt: users.lastSeenAt,
        /*
         * §G06 [05:46] — "mera TIME ZONE kya chal raha hai".
         *
         * Stored since forever and used server-side for quiet hours, and this
         * read did not select it — so no surface in the product could show a
         * colleague's local time even though the app knew it. One column.
         */
        timezone: users.timezone,
        // §G06 [06:42] — the sentence, so a roster can show it beside the name.
        statusEmoji: users.statusEmoji,
        statusText: users.statusText,
        statusExpiresAt: users.statusExpiresAt,
        organizationId: workspaces.organizationId,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))

    // Provenance is a separate read rather than a join: someone re-invited after
    // a removal has more than one accepted invitation, and joining would fan the
    // roster out into duplicate rows. Ordering ascending and letting later rows
    // overwrite leaves the most recent invite per person.
    const organizationId = rows[0]?.organizationId
    const inviter = alias(users, 'inviter')
    const inviteRows = organizationId
      ? await this.db
          .select({
            userId: invitations.acceptedByUserId,
            invitedAt: invitations.createdAt,
            invitedByName: inviter.displayName,
            invitedByEmail: inviter.email,
          })
          .from(invitations)
          .leftJoin(inviter, eq(inviter.id, invitations.invitedByUserId))
          .where(and(eq(invitations.organizationId, organizationId), isNotNull(invitations.acceptedByUserId)))
          .orderBy(asc(invitations.createdAt))
      : []
    const inviteByUser = new Map(inviteRows.map((row) => [row.userId as string, row]))

    const teamRows = await this.db
      .select({ userId: workspaceGroupMembers.userId, name: workspaceGroups.name })
      .from(workspaceGroupMembers)
      .innerJoin(workspaceGroups, eq(workspaceGroups.id, workspaceGroupMembers.groupId))
      .where(eq(workspaceGroups.workspaceId, workspaceId))
    const teamsByUser = new Map<string, string[]>()
    for (const row of teamRows) {
      const list = teamsByUser.get(row.userId) ?? []
      list.push(row.name)
      teamsByUser.set(row.userId, list)
    }

    // The manager is always another member of this same workspace, so the name
    // comes from the rows we already have rather than a second join.
    const nameByUser = new Map(rows.map((row) => [row.userId, row.displayName || row.email]))

    return rows.map(({ organizationId: _organizationId, ...row }) => {
      const invite = inviteByUser.get(row.userId)
      return {
        ...row,
        managerName: row.managerId ? nameByUser.get(row.managerId) ?? null : null,
        invitedAt: invite?.invitedAt ?? null,
        invitedByName: invite?.invitedByName ?? null,
        invitedByEmail: invite?.invitedByEmail ?? null,
        teams: teamsByUser.get(row.userId) ?? [],
      }
    })
  }

  /**
   * Set (or clear) who a member reports to.
   *
   * Two things must not happen: a person reporting to themselves, and a cycle —
   * A→B→A leaves the roster tree with a set of people who have a manager but no
   * root, so they vanish from the chart entirely. Both are rejected here rather
   * than papered over when rendering.
   */
  async updateMemberManager(
    workspaceId: string,
    userId: string,
    managerId: string | null,
    actor?: AuditActor,
  ) {
    const member = await this.getMembership(workspaceId, userId)
    if (!member) throw new NotFoundException('Member not found')

    if (managerId) {
      if (managerId === userId) throw new BadRequestException('A member cannot report to themselves')
      const manager = await this.getMembership(workspaceId, managerId)
      if (!manager) throw new NotFoundException('Manager is not a member of this workspace')

      // Walk up from the proposed manager; if we reach this user, the edge closes
      // a loop. The visited set stops us spinning on a cycle that predates us.
      const rows = await this.db
        .select({ userId: workspaceMembers.userId, managerId: workspaceMembers.managerId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId))
      const parentOf = new Map(rows.map((r) => [r.userId, r.managerId]))
      const seen = new Set<string>([userId])
      let cursor: string | null = managerId
      while (cursor) {
        if (seen.has(cursor)) throw new BadRequestException('That would create a reporting loop')
        seen.add(cursor)
        cursor = parentOf.get(cursor) ?? null
      }
    }

    await this.db
      .update(workspaceMembers)
      .set({ managerId })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'member.manager_updated',
      resourceType: 'user',
      resourceId: userId,
      description: managerId ? 'Reporting line updated' : 'Reporting line cleared',
      metadata: { from: member.managerId ?? null, to: managerId },
    })
    return { ok: true, managerId }
  }

  async addMember(
    workspaceId: string,
    email: string,
    role: string = 'member',
    actor?: AuditActor,
  ) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    if (!user) throw new BadRequestException(`No user with email ${email}`)
    const existing = await this.getMembership(workspaceId, user.id)
    if (existing) throw new ConflictException('User is already a member')
    // Plan §14.1: enforce the plan's member cap. No-op for enterprise (unlimited),
    // which is every existing workspace by default.
    await this.plans.assertCanAddMembers(workspaceId)
    await this.db.insert(workspaceMembers).values({
      workspaceId,
      userId: user.id,
      role: role as any,
    })
    // Keep the org directory consistent: any workspace member is also an org
    // member — the invariant the single-org tenant model relies on.
    const [ws] = await this.db
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    if (ws) {
      await this.db
        .insert(organizationMembers)
        .values({ organizationId: ws.organizationId, userId: user.id, role: 'member' })
        .onConflictDoNothing()
    }
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'member.invited',
      resourceType: 'user',
      resourceId: user.id,
      description: `Added ${email} to workspace as ${role}`,
      metadata: { email, role },
    })
    // A direct add joins the member immediately (Plan §12.4). Best effort.
    void this.fireWebhook(workspaceId, 'member.joined', {
      workspaceId,
      userId: user.id,
      email,
      role,
      actorId: actor?.id ?? null,
    })
    return { ok: true, userId: user.id }
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: string,
    actor?: AuditActor,
  ) {
    // Only these roles may be assigned to a workspace member. Crucially this
    // excludes `super_admin` (a platform-level role in the same enum) — without
    // this allowlist any workspace admin could self-promote to god-mode.
    const ASSIGNABLE_ROLES = ['workspace_admin', 'manager', 'member', 'guest']
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`)
    }
    const previous = await this.getMembership(workspaceId, userId)
    // Never let the last workspace admin be demoted out of the workspace.
    if (previous?.role === 'workspace_admin' && role !== 'workspace_admin') {
      const admins = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'workspace_admin' as any)))
      if (admins.length <= 1) {
        throw new BadRequestException('Cannot demote the last workspace admin')
      }
    }
    await this.db
      .update(workspaceMembers)
      .set({ role: role as any })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'role.changed',
      resourceType: 'user',
      resourceId: userId,
      description: `Member role changed to ${role}`,
      metadata: { from: previous?.role ?? null, to: role },
    })
    return { ok: true }
  }

  async updateMemberCapacity(
    workspaceId: string,
    userId: string,
    weeklyCapacityHours: number,
    actor?: AuditActor,
  ) {
    if (!Number.isFinite(weeklyCapacityHours) || weeklyCapacityHours < 0 || weeklyCapacityHours > 168) {
      throw new BadRequestException('weeklyCapacityHours must be between 0 and 168')
    }
    const rounded = Math.round(weeklyCapacityHours)
    const previous = await this.getMembership(workspaceId, userId)
    if (!previous) throw new NotFoundException('Member not found')
    await this.db
      .update(workspaceMembers)
      .set({ weeklyCapacityHours: rounded })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'member.capacity_updated',
      resourceType: 'user',
      resourceId: userId,
      description: `Weekly capacity set to ${rounded}h`,
      metadata: { from: previous.weeklyCapacityHours ?? null, to: rounded },
    })
    return { ok: true, weeklyCapacityHours: rounded }
  }

  async removeMember(workspaceId: string, userId: string, actor?: AuditActor) {
    const member = await this.getMembership(workspaceId, userId)
    if (member?.role === 'workspace_admin') {
      const admins = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'workspace_admin' as any)))
      if (admins.length <= 1) {
        throw new BadRequestException('Cannot remove the last workspace admin')
      }
    }
    // Their reports would otherwise point at someone no longer on the roster,
    // which hides that whole subtree. Orphan them to the root instead.
    await this.db
      .update(workspaceMembers)
      .set({ managerId: null })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.managerId, userId)))
    await this.db
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    await this.security.logAuditEvent({
      workspaceId,
      actorId: actor?.id,
      actorEmail: actor?.email,
      ipAddress: actor?.ip,
      action: 'member.removed',
      resourceType: 'user',
      resourceId: userId,
      description: `Removed member from workspace`,
    })
    void this.fireWebhook(workspaceId, 'member.removed', {
      workspaceId,
      userId,
      actorId: actor?.id ?? null,
    })
    return { ok: true }
  }

  async create(
    userId: string,
    dto: CreateWorkspaceDto & {
      organizationId?: string
      /** §7 — what the creation flow asked. */
      purpose?: string | null
      comingFrom?: string | null
    },
  ) {
    const requestedSlug = slugify(dto.slug ?? dto.name)
    const finalSlug = await this.reserveUniqueSlug(requestedSlug)

    return this.db.transaction(async (tx) => {
      let orgId = dto.organizationId

      if (orgId) {
        // Verify the caller belongs to the target organization.
        const [member] = await tx
          .select({ id: organizationMembers.id })
          .from(organizationMembers)
          .where(
            and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)),
          )
          .limit(1)
        if (!member) throw new ForbiddenException('Not a member of that organization')
      } else {
        // Attach the new workspace to the caller's existing organization — one
        // top-level org per tenant — rather than spawning a fresh org for every
        // workspace (the previous behaviour). Only create an org when the caller
        // genuinely has none (first-workspace path, mirroring signUp).
        const [existing] = await tx
          .select({ organizationId: organizationMembers.organizationId })
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, userId))
          .orderBy(asc(organizationMembers.joinedAt))
          .limit(1)
        if (existing) {
          orgId = existing.organizationId
        } else {
          const [org] = await tx
            .insert(organizations)
            .values({ name: dto.name, slug: finalSlug })
            .returning()
          orgId = org.id
          await tx.insert(organizationMembers).values({
            organizationId: org.id,
            userId,
            role: 'owner',
          })
        }
      }

      const [workspace] = await tx
        .insert(workspaces)
        .values({
          organizationId: orgId,
          name: dto.name,
          slug: finalSlug,
          logoUrl: dto.logoUrl,
          primaryColor: dto.primaryColor,
          // §7 — kept, not discarded. Asking and then throwing the answer away
          // costs someone a step and buys them nothing.
          purpose: dto.purpose ?? null,
          comingFrom: dto.comingFrom ?? null,
        })
        .returning()

      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId,
        role: 'workspace_admin',
      })

      // §1.1 — a workspace with no task types hides the type picker entirely,
      // so the feature would be invisible in every workspace created from here
      // on. Milestone is the one she named: "hum is ko 'task' ka naam nahi de
      // sakte — woh MILESTONE hai." Migration 0093 does the same for the
      // workspaces that already existed.
      await tx.insert(taskTypes).values(
        DEFAULT_TASK_TYPES.map((type) => ({ ...type, workspaceId: workspace.id })),
      )

      /*
       * §7 — somewhere to land.
       *
       * A workspace created with nothing in it opens on an empty screen with no
       * obvious first move, which is the state the frame pass flagged. One
       * space, one project, one list is the smallest thing that makes the
       * sidebar, the create modal and the list view all work on arrival — and
       * it is all removable, so nobody is stuck with our guess.
       *
       * Named from the purpose she gave, because "Personal" and "Work" want
       * different first words and we just asked which it was.
       */
      const seed = STARTER_CONTENT[dto.purpose ?? ''] ?? STARTER_CONTENT.default
      const [space] = await tx
        .insert(spaces)
        .values({ workspaceId: workspace.id, name: seed.space, createdById: userId })
        .returning()
      const [project] = await tx
        .insert(projects)
        .values({ spaceId: space.id, name: seed.project, createdById: userId })
        .returning()
      /*
       * The starter list needs its status pipeline, and it has to commit in
       * THIS transaction with the list itself.
       *
       * It was `tx.insert(lists)` alone. `ListsService.create` seeds the
       * pipeline; a raw insert does not — so every workspace ever created
       * through this path got a first list with no statuses at all. A task
       * there could be set to `done` and still read back
       * `statusCategory: 'open'`, because `resolveStatusForList` answered
       * `{ category: 'open' }` for any key when a list had none. Work
       * completed in a new workspace's first list never counted as completed,
       * anywhere that reasons on the category.
       */
      const [starterList] = await tx
        .insert(lists)
        .values({ projectId: project.id, name: seed.list, createdById: userId })
        .returning()
      if (starterList) await seedListStatuses(tx, starterList.id)

      return workspace
    })
  }

  async createPersonalWorkspace(userId: string, displayName: string) {
    const name = `${displayName.split(' ')[0] || 'My'}'s Workspace`
    try {
      return await this.create(userId, { name })
    } catch (err) {
      if (err instanceof ConflictException) {
        return this.create(userId, { name, slug: slugify(`${name}-${userId.slice(0, 6)}`) })
      }
      throw err
    }
  }

  /**
   * §V2-S13 `| M | Sidebar: drag-reorder …` — put the tree's siblings in the
   * order somebody chose, and keep them there.
   *
   * THE COLUMN WAS ALREADY THERE AND HAD NEITHER END. `projects.position` has
   * existed since the table did; nothing wrote it (`updateProject` whitelists
   * the updatable columns and deliberately excludes it) and nothing read it
   * (`getProjectsBySpace` has no `orderBy` at all). A column with no writer and
   * no reader is the mirror defect with the mirror missing too: the schema is
   * evidence for an arrangement the product cannot store. This is its writer;
   * the sidebar is its reader.
   *
   * LISTS ARE DELIBERATELY NOT HANDLED HERE. `POST /lists/project/:id/reorder`
   * already writes `lists.position`, and `getListsByProject` already orders by
   * it — the project shell page has used both for some time. A second route
   * writing the same column would be two writers for one fact, which is how the
   * duplicated-logic bug this audit keeps finding gets made. The sidebar calls
   * that route for lists and this one for projects and folders.
   *
   * WHAT THE ORDER IS *OF* is stated by the caller rather than inferred, for
   * the reason `canDropOn` in `workspace-sidebar.tsx` carries at length: a
   * client's belief about where an item currently lives is a refetch behind the
   * server and loses the race. The container is named; membership of it is then
   * checked against the database, not against what the browser thought.
   */
  async reorderSidebarItems(
    workspaceId: string,
    actor: { id: string; role?: string | null },
    input: {
      kind?: 'project' | 'folder'
      containerKind?: 'space' | 'folder'
      containerId?: string
      orderedIds?: string[]
    },
  ) {
    const kind = input?.kind
    const containerKind = input?.containerKind
    const containerId = input?.containerId
    const orderedIds = Array.isArray(input?.orderedIds) ? input.orderedIds : []

    if (kind !== 'project' && kind !== 'folder') {
      throw new BadRequestException('kind must be "project" or "folder"')
    }
    if (kind === 'folder' && containerKind !== 'space') {
      throw new BadRequestException('a folder is ordered within its space, so containerKind must be "space"')
    }
    if (kind === 'project' && containerKind !== 'space' && containerKind !== 'folder') {
      throw new BadRequestException('containerKind must be "space" or "folder"')
    }
    if (!containerId) throw new BadRequestException('containerId is required')

    // Which space does the named container belong to, and is that space in the
    // workspace the route is scoped to? The guard proves membership of the
    // workspace; this proves the container is one of ITS containers, so a valid
    // member of workspace A cannot reorder workspace B's tree.
    let spaceId: string
    if (containerKind === 'space') {
      const [row] = await this.db
        .select({ id: spaces.id, workspaceId: spaces.workspaceId })
        .from(spaces)
        .where(eq(spaces.id, containerId))
        .limit(1)
      if (!row) throw new NotFoundException('No such space')
      if (row.workspaceId !== workspaceId) throw new ForbiddenException('That space is not in this workspace')
      spaceId = row.id
    } else {
      const [row] = await this.db
        .select({ id: folders.id, spaceId: folders.spaceId, workspaceId: spaces.workspaceId })
        .from(folders)
        .innerJoin(spaces, eq(spaces.id, folders.spaceId))
        .where(eq(folders.id, containerId))
        .limit(1)
      if (!row) throw new NotFoundException('No such folder')
      if (row.workspaceId !== workspaceId) throw new ForbiddenException('That folder is not in this workspace')
      spaceId = row.spaceId
    }

    // The order is shared by everybody who opens the tree — `projects.position`
    // is one column, not one per person — so it is a manager's arrangement, and
    // the refusal says which of the two 403s this is.
    if (!(await resolveIsManager(this.db, workspaceId, actor.id, actor.role))) {
      throw new ForbiddenException('Only a workspace manager or admin can reorder the sidebar tree')
    }

    const siblings =
      kind === 'folder'
        ? await this.db
            .select({ id: folders.id })
            .from(folders)
            // The same `isArchived` filter `getFoldersBySpace` applies, or the
            // set the sidebar can see and the set this demands are different
            // sets and every reorder 400s on a folder nobody drew.
            .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false)))
            .orderBy(asc(folders.position), asc(folders.name))
        : await this.db
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.spaceId, spaceId),
                eq(projects.isArchived, false),
                eq(projects.isDefaultContainer, false),
                containerKind === 'folder'
                  ? eq(projects.folderId, containerId)
                  : isNull(projects.folderId),
              ),
            )
            .orderBy(asc(projects.position), asc(projects.createdAt))

    const valid = new Set(siblings.map((s) => s.id))
    const strays = orderedIds.filter((id) => !valid.has(id))
    // Two different mistakes, two different sentences. "Wrong length" and "a
    // stranger in the list" are the same 400 otherwise, and the caller cannot
    // tell a stale tree from a mis-addressed container.
    if (strays.length > 0) {
      throw new BadRequestException(
        `These ids are not ${kind}s of ${containerKind} ${containerId}: ${strays.join(', ')}`,
      )
    }
    if (orderedIds.length !== siblings.length || new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException(
        `orderedIds must list every ${kind} in this ${containerKind} exactly once ` +
          `(got ${orderedIds.length}, ${siblings.length} expected)`,
      )
    }

    const now = new Date()
    await Promise.all(
      orderedIds.map((id, position) =>
        kind === 'folder'
          ? this.db.update(folders).set({ position }).where(eq(folders.id, id))
          : this.db.update(projects).set({ position, updatedAt: now }).where(eq(projects.id, id)),
      ),
    )

    // Read back from the database rather than echoing the request. The caller
    // asked for an order; what it needs to know is the order that is now
    // stored, and those are only the same thing when the write worked.
    const stored =
      kind === 'folder'
        ? await this.db
            .select({ id: folders.id })
            .from(folders)
            // The same `isArchived` filter `getFoldersBySpace` applies, or the
            // set the sidebar can see and the set this demands are different
            // sets and every reorder 400s on a folder nobody drew.
            .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false)))
            .orderBy(asc(folders.position), asc(folders.name))
        : await this.db
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.spaceId, spaceId),
                eq(projects.isArchived, false),
                eq(projects.isDefaultContainer, false),
                containerKind === 'folder'
                  ? eq(projects.folderId, containerId)
                  : isNull(projects.folderId),
              ),
            )
            .orderBy(asc(projects.position), asc(projects.createdAt))

    return { kind, containerKind, containerId, orderedIds: stored.map((s) => s.id) }
  }

  private async reserveUniqueSlug(base: string): Promise<string> {
    let candidate = base
    let attempt = 0
    while (await this.slugTaken(candidate)) {
      attempt += 1
      if (attempt > 50) {
        throw new ConflictException('Could not allocate a unique workspace slug')
      }
      candidate = `${base}-${attempt}`
    }
    return candidate
  }

  private async slugTaken(slug: string): Promise<boolean> {
    const [orgHit] = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)
    if (orgHit) return true
    const [wsHit] = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1)
    return Boolean(wsHit)
  }

  // --- Guided onboarding checklist (Plan §14.3) ------------------------------

  private async count(query: Promise<Array<{ c: number }>>): Promise<number> {
    const [row] = await query
    return row?.c ?? 0
  }

  /**
   * Compute the onboarding checklist for a member of `workspaceId`: each step's
   * done-state is derived from real workspace data (counts of spaces, projects,
   * tasks, members and AI usage), and `dismissed` reflects the per-user flag
   * persisted on the notification-preferences jsonb. The widget hides once every
   * step is done OR the user has dismissed it.
   */
  async getOnboardingStatus(workspaceId: string, userId: string) {
    const cnt = sql<number>`count(*)::int`

    const spacesCount = await this.count(
      this.db.select({ c: cnt }).from(spaces).where(eq(spaces.workspaceId, workspaceId)),
    )
    const projectsCount = await this.count(
      this.db
        .select({ c: cnt })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(spaces.workspaceId, workspaceId)),
    )
    const tasksCount = await this.count(
      this.db
        .select({ c: cnt })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(spaces.workspaceId, workspaceId)),
    )
    const membersCount = await this.count(
      this.db
        .select({ c: cnt })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId)),
    )
    const aiCount = await this.count(
      this.db.select({ c: cnt }).from(aiUsage).where(eq(aiUsage.workspaceId, workspaceId)),
    )

    const [userRow] = await this.db
      .select({ prefs: users.notificationPreferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const dismissed =
      (userRow?.prefs as { onboarding?: { dismissed?: boolean } } | undefined)?.onboarding
        ?.dismissed === true

    const counts: OnboardingCounts = {
      spaces: spacesCount,
      projects: projectsCount,
      tasks: tasksCount,
      members: membersCount,
      aiEvents: aiCount,
    }
    return { dismissed, counts, steps: computeOnboardingSteps(counts) }
  }

  /**
   * Persist the per-user "onboarding dismissed" flag. Uses a JSONB concat merge
   * so it only sets the `onboarding` key and never clobbers other notification
   * preferences — no migration, no new column.
   */
  async dismissOnboarding(userId: string) {
    await this.db
      .update(users)
      .set({
        notificationPreferences: sql`coalesce(${users.notificationPreferences}, '{}'::jsonb) || '{"onboarding":{"dismissed":true}}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
    return { dismissed: true }
  }
}
