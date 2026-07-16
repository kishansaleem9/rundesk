import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import {
  supportTickets,
  supportTicketMessages,
  statusComponents,
  statusIncidents,
  workspaceMembers,
  users,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import {
  SLA_POLICY,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  COMPONENT_STATUSES,
  INCIDENT_STATUSES,
  computeSlaDueDates,
  computeSlaBreach,
  normalizePriority,
} from './support.constants'

/** The authenticated actor as seen by the service (from JwtAuthGuard). */
type Actor = { id: string; role?: string }

/** Workspace roles that can manage/see every ticket in their workspace. */
const WS_STAFF_ROLES = ['workspace_admin', 'manager', 'super_admin']

/**
 * SupportService (Plan §14.4) — the human support surface behind the AI help
 * center. Owns the ticket lifecycle (create → messages → status/priority/
 * assignee → resolve), the SLA policy + breach derivation, and the public
 * status page (components + incidents) with super-admin management.
 *
 * Access model for a ticket: its creator, any admin/manager of its workspace,
 * and any platform super_admin. Status-page reads are public; status-page
 * writes are super_admin-only.
 */
@Injectable()
export class SupportService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  // ── SLA helpers (kept on the service for convenient injection in tests) ──────

  /** The SLA policy table (hours per priority). */
  slaPolicy() {
    return SLA_POLICY
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  /**
   * Create a support ticket. Auto-stamps the SLA due dates from the priority and
   * seeds the thread with the requester's opening message. The creator must be a
   * member of the target workspace (a super_admin may file into any workspace).
   */
  async createTicket(
    actor: Actor,
    input: { workspaceId?: string; subject?: string; body?: string; priority?: string },
  ) {
    const workspaceId = input?.workspaceId
    const subject = input?.subject?.trim()
    const body = input?.body?.trim() ?? ''

    if (!workspaceId) throw new BadRequestException('workspaceId is required')
    if (!subject) throw new BadRequestException('subject is required')

    await this.assertWorkspaceMember(actor, workspaceId)

    const priority = normalizePriority(input?.priority)
    const now = new Date()
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDueDates(priority, now)

    const [ticket] = await this.db
      .insert(supportTickets)
      .values({
        workspaceId,
        createdById: actor.id,
        subject,
        body,
        status: 'open',
        priority,
        firstResponseDueAt,
        resolutionDueAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    // Seed the conversation with the requester's opening message so the thread
    // reads coherently from the first reply onward.
    if (body) {
      await this.db.insert(supportTicketMessages).values({
        ticketId: ticket.id,
        authorId: actor.id,
        body,
        isStaff: false,
        createdAt: now,
      })
    }

    return this.decorateTicket(ticket)
  }

  /**
   * List tickets visible to the actor. A super_admin passing `scope=all` (or any
   * super_admin by default) sees every ticket; otherwise the actor sees tickets
   * they created plus every ticket in workspaces where they are an admin/manager.
   * Optional `status` / `priority` / `workspaceId` filters narrow the result.
   */
  async listTickets(
    actor: Actor,
    filter: { scope?: string; status?: string; priority?: string; workspaceId?: string } = {},
  ) {
    const isSuperAdmin = actor.role === 'super_admin'
    const wantAll = isSuperAdmin && (filter.scope === 'all' || filter.scope === undefined)

    const conds = []
    if (filter.status && (TICKET_STATUSES as readonly string[]).includes(filter.status)) {
      conds.push(eq(supportTickets.status, filter.status))
    }
    if (filter.priority && (TICKET_PRIORITIES as readonly string[]).includes(filter.priority)) {
      conds.push(eq(supportTickets.priority, filter.priority))
    }
    if (filter.workspaceId) {
      conds.push(eq(supportTickets.workspaceId, filter.workspaceId))
    }

    if (!wantAll) {
      // Restrict to tickets the actor may see: created by them OR in a workspace
      // they staff (admin/manager). Pushed into SQL so we never over-fetch.
      const staffWorkspaceIds = await this.staffedWorkspaceIds(actor.id)
      const visibility = staffWorkspaceIds.length
        ? or(eq(supportTickets.createdById, actor.id), inArray(supportTickets.workspaceId, staffWorkspaceIds))
        : eq(supportTickets.createdById, actor.id)
      conds.push(visibility)
    }

    const rows = await this.db
      .select()
      .from(supportTickets)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(supportTickets.createdAt))
    return rows.map((row) => this.decorateTicket(row))
  }

  /** Fetch a ticket with its message thread. Access-checked. */
  async getTicket(actor: Actor, ticketId: string) {
    const ticket = await this.loadTicket(ticketId)
    await this.assertTicketAccess(actor, ticket)

    const messages = await this.db
      .select({
        id: supportTicketMessages.id,
        ticketId: supportTicketMessages.ticketId,
        authorId: supportTicketMessages.authorId,
        body: supportTicketMessages.body,
        isStaff: supportTicketMessages.isStaff,
        createdAt: supportTicketMessages.createdAt,
        authorName: users.displayName,
        authorEmail: users.email,
      })
      .from(supportTicketMessages)
      .leftJoin(users, eq(users.id, supportTicketMessages.authorId))
      .where(eq(supportTicketMessages.ticketId, ticketId))
      .orderBy(supportTicketMessages.createdAt)

    return { ...this.decorateTicket(ticket), messages }
  }

  /**
   * Post a reply to a ticket. A staff reply (workspace admin/manager or
   * super_admin) stamps `first_response_at` if it is not already set. Any reply
   * bumps `updated_at` and re-opens a resolved/closed ticket into 'pending'.
   */
  async addMessage(actor: Actor, ticketId: string, input: { body?: string }) {
    const body = input?.body?.trim()
    if (!body) throw new BadRequestException('Message body is required')

    const ticket = await this.loadTicket(ticketId)
    await this.assertTicketAccess(actor, ticket)

    const isStaff = await this.isStaffFor(actor, ticket.workspaceId)
    const now = new Date()

    const [message] = await this.db
      .insert(supportTicketMessages)
      .values({ ticketId, authorId: actor.id, body, isStaff, createdAt: now })
      .returning()

    const patch: Record<string, unknown> = { updatedAt: now }
    if (isStaff && !ticket.firstResponseAt) {
      patch.firstResponseAt = now
    }
    // A staff reply on an open ticket moves it to 'pending' (awaiting requester);
    // a requester reply on a resolved/closed ticket re-opens it.
    if (isStaff && ticket.status === 'open') {
      patch.status = 'pending'
    } else if (!isStaff && (ticket.status === 'resolved' || ticket.status === 'closed')) {
      patch.status = 'open'
    }

    await this.db.update(supportTickets).set(patch).where(eq(supportTickets.id, ticketId))

    return message
  }

  /**
   * Patch a ticket's status / priority / assignee. Requires staff access
   * (workspace admin/manager or super_admin) — a plain requester cannot mutate
   * ticket metadata. Resolving stamps `resolved_at`; re-opening clears it.
   */
  async updateTicket(
    actor: Actor,
    ticketId: string,
    input: { status?: string; priority?: string; assignedToId?: string | null },
  ) {
    const ticket = await this.loadTicket(ticketId)
    if (!(await this.isStaffFor(actor, ticket.workspaceId))) {
      throw new ForbiddenException('Only support staff can update a ticket')
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() }

    if (input.status !== undefined) {
      if (!(TICKET_STATUSES as readonly string[]).includes(input.status)) {
        throw new BadRequestException('Invalid ticket status')
      }
      patch.status = input.status
      if (input.status === 'resolved' || input.status === 'closed') {
        patch.resolvedAt = ticket.resolvedAt ?? new Date()
      } else {
        // Re-opening clears the resolution stamp so the SLA clock is honest.
        patch.resolvedAt = null
      }
    }

    if (input.priority !== undefined) {
      if (!(TICKET_PRIORITIES as readonly string[]).includes(input.priority)) {
        throw new BadRequestException('Invalid ticket priority')
      }
      patch.priority = input.priority
    }

    if (input.assignedToId !== undefined) {
      patch.assignedToId = input.assignedToId || null
    }

    const [updated] = await this.db
      .update(supportTickets)
      .set(patch)
      .where(eq(supportTickets.id, ticketId))
      .returning()

    return this.decorateTicket(updated)
  }

  // ── Status page ───────────────────────────────────────────────────────────

  /**
   * Public status-page payload: every component (ordered) + recent incidents,
   * plus an overall banner derived from the worst component/incident state.
   */
  async getStatusPage() {
    const components = await this.db
      .select()
      .from(statusComponents)
      .orderBy(statusComponents.position, statusComponents.name)

    const incidents = await this.db
      .select()
      .from(statusIncidents)
      .orderBy(desc(statusIncidents.startedAt))
      .limit(20)

    return {
      overall: this.overallStatus(components, incidents),
      components,
      incidents,
    }
  }

  /** super_admin: create a status-page component. */
  async createComponent(actor: Actor, input: { name?: string; status?: string; position?: number }) {
    this.assertSuperAdmin(actor)
    const name = input?.name?.trim()
    if (!name) throw new BadRequestException('Component name is required')
    const status = (COMPONENT_STATUSES as readonly string[]).includes(input?.status ?? '')
      ? input!.status!
      : 'operational'
    const [component] = await this.db
      .insert(statusComponents)
      .values({ name, status, position: input?.position ?? 0 })
      .returning()
    return component
  }

  /** super_admin: update a component's name / status / position. */
  async updateComponent(
    actor: Actor,
    componentId: string,
    input: { name?: string; status?: string; position?: number },
  ) {
    this.assertSuperAdmin(actor)
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.status !== undefined) {
      if (!(COMPONENT_STATUSES as readonly string[]).includes(input.status)) {
        throw new BadRequestException('Invalid component status')
      }
      patch.status = input.status
    }
    if (input.position !== undefined) patch.position = input.position
    if (Object.keys(patch).length === 0) throw new BadRequestException('Nothing to update')

    const [updated] = await this.db
      .update(statusComponents)
      .set(patch)
      .where(eq(statusComponents.id, componentId))
      .returning()
    if (!updated) throw new NotFoundException('Component not found')
    return updated
  }

  /** super_admin: delete a component. */
  async deleteComponent(actor: Actor, componentId: string) {
    this.assertSuperAdmin(actor)
    await this.db.delete(statusComponents).where(eq(statusComponents.id, componentId))
    return { ok: true }
  }

  /** super_admin: post a new incident to the status page. */
  async createIncident(
    actor: Actor,
    input: { title?: string; body?: string; impact?: string; status?: string; componentId?: string | null },
  ) {
    this.assertSuperAdmin(actor)
    const title = input?.title?.trim()
    if (!title) throw new BadRequestException('Incident title is required')
    const status = (INCIDENT_STATUSES as readonly string[]).includes(input?.status ?? '')
      ? input!.status!
      : 'investigating'
    const [incident] = await this.db
      .insert(statusIncidents)
      .values({
        title,
        body: input?.body?.trim() ?? '',
        impact: input?.impact?.trim() || 'minor',
        status,
        componentId: input?.componentId || null,
      })
      .returning()
    return incident
  }

  /** super_admin: update an incident (status/body/impact); resolving stamps resolvedAt. */
  async updateIncident(
    actor: Actor,
    incidentId: string,
    input: { title?: string; body?: string; impact?: string; status?: string; componentId?: string | null },
  ) {
    this.assertSuperAdmin(actor)
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.body !== undefined) patch.body = input.body.trim()
    if (input.impact !== undefined) patch.impact = input.impact.trim() || 'minor'
    if (input.componentId !== undefined) patch.componentId = input.componentId || null
    if (input.status !== undefined) {
      if (!(INCIDENT_STATUSES as readonly string[]).includes(input.status)) {
        throw new BadRequestException('Invalid incident status')
      }
      patch.status = input.status
      patch.resolvedAt = input.status === 'resolved' ? new Date() : null
    }
    if (Object.keys(patch).length === 0) throw new BadRequestException('Nothing to update')

    const [updated] = await this.db
      .update(statusIncidents)
      .set(patch)
      .where(eq(statusIncidents.id, incidentId))
      .returning()
    if (!updated) throw new NotFoundException('Incident not found')
    return updated
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Attach derived SLA-breach flags to a ticket row. */
  private decorateTicket<T extends {
    status: string
    firstResponseAt: Date | null
    resolvedAt: Date | null
    firstResponseDueAt: Date
    resolutionDueAt: Date
  }>(ticket: T) {
    const sla = computeSlaBreach(ticket)
    return {
      ...ticket,
      slaBreached: sla.breached,
      firstResponseBreached: sla.firstResponseBreached,
      resolutionBreached: sla.resolutionBreached,
    }
  }

  private overallStatus(
    components: Array<{ status: string }>,
    incidents: Array<{ status: string }>,
  ): 'operational' | 'degraded' | 'partial_outage' | 'major_outage' {
    const hasOpenIncident = incidents.some((i) => i.status !== 'resolved')
    const worst = components.reduce<StatusRank>((rank, c) => {
      const r = STATUS_RANK[c.status as keyof typeof STATUS_RANK] ?? 0
      return Math.max(rank, r) as StatusRank
    }, 0)
    if (worst === 3) return 'major_outage'
    if (worst === 2) return 'partial_outage'
    if (worst === 1 || hasOpenIncident) return 'degraded'
    return 'operational'
  }

  private async loadTicket(ticketId: string) {
    const [ticket] = await this.db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1)
    if (!ticket) throw new NotFoundException('Ticket not found')
    return ticket
  }

  /** The workspaces where a user is an admin/manager (or nothing). */
  private async staffedWorkspaceIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
    return rows.filter((r) => WS_STAFF_ROLES.includes(r.role)).map((r) => r.workspaceId)
  }

  /** True if the actor is support staff for the given workspace. */
  private async isStaffFor(actor: Actor, workspaceId: string): Promise<boolean> {
    if (actor.role === 'super_admin') return true
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    return !!member && WS_STAFF_ROLES.includes(member.role)
  }

  /** Ensure the actor may read/reply to a ticket: creator, workspace staff, or super_admin. */
  private async assertTicketAccess(actor: Actor, ticket: { createdById: string; workspaceId: string }) {
    if (actor.role === 'super_admin') return
    if (ticket.createdById === actor.id) return
    if (await this.isStaffFor(actor, ticket.workspaceId)) return
    throw new ForbiddenException('You do not have access to this ticket')
  }

  /** Ensure the actor is a member of the workspace (super_admin bypasses). */
  private async assertWorkspaceMember(actor: Actor, workspaceId: string) {
    if (actor.role === 'super_admin') return
    const [member] = await this.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    if (!member) throw new ForbiddenException('You are not a member of this workspace')
  }

  private assertSuperAdmin(actor: Actor) {
    if (actor.role !== 'super_admin') {
      throw new ForbiddenException('Super admin role required')
    }
  }
}

type StatusRank = 0 | 1 | 2 | 3
const STATUS_RANK = {
  operational: 0,
  degraded: 1,
  partial_outage: 2,
  major_outage: 3,
} as const
