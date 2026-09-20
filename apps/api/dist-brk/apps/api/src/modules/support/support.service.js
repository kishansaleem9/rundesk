"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const plans_service_1 = require("../plans/plans.service");
const support_constants_1 = require("./support.constants");
/**
 * Trim a value only when it is actually a string. A number/object/array from a
 * malformed request body threw on `.trim()` and surfaced as a 500 — this returns
 * '' for any non-string so the downstream "is required" checks produce a 400.
 */
const trimStr = (v) => (typeof v === 'string' ? v.trim() : '');
/** Plan tiers that include the support ticket system (§14.4) — paid tiers only. */
const TICKETING_TIERS = ['pro', 'business', 'enterprise'];
/** Workspace roles that can manage/see every ticket in their workspace. */
const WS_STAFF_ROLES = ['workspace_admin', 'manager', 'super_admin'];
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
let SupportService = class SupportService {
    constructor(db, plans) {
        this.db = db;
        this.plans = plans;
    }
    // ── SLA helpers (kept on the service for convenient injection in tests) ──────
    /** The legacy priority-only SLA policy table (fallback when tier is unknown). */
    slaPolicy() {
        return support_constants_1.SLA_POLICY;
    }
    /** The full SLA commitments matrix (tier × priority) exposed for the UI/tests. */
    slaMatrix() {
        return support_constants_1.SLA_MATRIX;
    }
    // ── Tickets ─────────────────────────────────────────────────────────────────
    /**
     * Create a support ticket. Auto-stamps the SLA due dates from the workspace's
     * plan tier AND the priority (§14.4), and seeds the thread with the requester's
     * opening message. The creator must be a member of the target workspace (a
     * super_admin may file into any workspace). The ticket system is a paid feature
     * — a Free workspace is turned away with an upgrade prompt (super_admin bypasses
     * so platform staff can still file on any workspace's behalf).
     */
    async createTicket(actor, input) {
        const workspaceId = input?.workspaceId;
        const subject = trimStr(input?.subject);
        const body = trimStr(input?.body);
        if (!workspaceId)
            throw new common_1.BadRequestException('workspaceId is required');
        if (!subject)
            throw new common_1.BadRequestException('subject is required');
        /*
         * §G06 [07:30] — "main meeting schedule bhi start kar sakti hoon".
         *
         * A call request is a ticket with a kind and some times, not a booking
         * system: it lands in the queue the team already works and inherits the
         * SLA clocks already on this table. Nothing is confirmed until somebody
         * answers, which is honest — we do not model the team's availability, and
         * a form that hands out slots nobody published is a promise it cannot keep.
         */
        const kind = input?.kind === 'call' ? 'call' : 'question';
        let requestedSlots = null;
        if (kind === 'call') {
            const raw = Array.isArray(input?.requestedSlots) ? input.requestedSlots : [];
            const parsed = raw
                .filter((v) => typeof v === 'string')
                .map((v) => new Date(v))
                .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() > Date.now())
                .slice(0, 5);
            if (parsed.length === 0) {
                throw new common_1.BadRequestException('Offer at least one future time for the call');
            }
            // Sorted and de-duped so the team reads a tidy list rather than a log of
            // the requester changing their mind in the picker.
            requestedSlots = [...new Set(parsed.map((d) => d.toISOString()))].sort();
        }
        await this.assertWorkspaceMember(actor, workspaceId);
        // Resolve the plan once — it gates access AND sets the SLA clocks.
        const plan = await this.plans.getWorkspacePlan(workspaceId);
        this.assertTicketingAllowed(actor, plan);
        const priority = (0, support_constants_1.normalizePriority)(input?.priority);
        const now = new Date();
        const { firstResponseDueAt, resolutionDueAt } = (0, support_constants_1.computeSlaDueDates)(priority, now, plan.id);
        const [ticket] = await this.db
            .insert(db_1.supportTickets)
            .values({
            workspaceId,
            createdById: actor.id,
            subject,
            body,
            kind,
            requestedSlots,
            status: 'open',
            priority,
            firstResponseDueAt,
            resolutionDueAt,
            createdAt: now,
            updatedAt: now,
        })
            .returning();
        // Seed the conversation with the requester's opening message so the thread
        // reads coherently from the first reply onward.
        if (body) {
            await this.db.insert(db_1.supportTicketMessages).values({
                ticketId: ticket.id,
                authorId: actor.id,
                body,
                isStaff: false,
                createdAt: now,
            });
        }
        return this.decorateTicket(ticket);
    }
    /**
     * List tickets visible to the actor. A super_admin passing `scope=all` (or any
     * super_admin by default) sees every ticket; otherwise the actor sees tickets
     * they created plus every ticket in workspaces where they are an admin/manager.
     * Optional `status` / `priority` / `workspaceId` filters narrow the result.
     */
    async listTickets(actor, filter = {}) {
        const isSuperAdmin = actor.role === 'super_admin';
        const wantAll = isSuperAdmin && (filter.scope === 'all' || filter.scope === undefined);
        const conds = [];
        if (filter.status && support_constants_1.TICKET_STATUSES.includes(filter.status)) {
            conds.push((0, drizzle_orm_1.eq)(db_1.supportTickets.status, filter.status));
        }
        if (filter.priority && support_constants_1.TICKET_PRIORITIES.includes(filter.priority)) {
            conds.push((0, drizzle_orm_1.eq)(db_1.supportTickets.priority, filter.priority));
        }
        if (filter.workspaceId) {
            conds.push((0, drizzle_orm_1.eq)(db_1.supportTickets.workspaceId, filter.workspaceId));
        }
        if (!wantAll) {
            // Restrict to tickets the actor may see: created by them OR in a workspace
            // they staff (admin/manager). Pushed into SQL so we never over-fetch.
            const staffWorkspaceIds = await this.staffedWorkspaceIds(actor.id);
            const visibility = staffWorkspaceIds.length
                ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.supportTickets.createdById, actor.id), (0, drizzle_orm_1.inArray)(db_1.supportTickets.workspaceId, staffWorkspaceIds))
                : (0, drizzle_orm_1.eq)(db_1.supportTickets.createdById, actor.id);
            conds.push(visibility);
        }
        const rows = await this.db
            .select()
            .from(db_1.supportTickets)
            .where(conds.length ? (0, drizzle_orm_1.and)(...conds) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(db_1.supportTickets.createdAt));
        return rows.map((row) => this.decorateTicket(row));
    }
    /** Fetch a ticket with its message thread. Access-checked. */
    async getTicket(actor, ticketId) {
        const ticket = await this.loadTicket(ticketId);
        await this.assertTicketAccess(actor, ticket);
        const messages = await this.db
            .select({
            id: db_1.supportTicketMessages.id,
            ticketId: db_1.supportTicketMessages.ticketId,
            authorId: db_1.supportTicketMessages.authorId,
            body: db_1.supportTicketMessages.body,
            isStaff: db_1.supportTicketMessages.isStaff,
            createdAt: db_1.supportTicketMessages.createdAt,
            authorName: db_1.users.displayName,
            authorEmail: db_1.users.email,
        })
            .from(db_1.supportTicketMessages)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.supportTicketMessages.authorId))
            .where((0, drizzle_orm_1.eq)(db_1.supportTicketMessages.ticketId, ticketId))
            .orderBy(db_1.supportTicketMessages.createdAt);
        return { ...this.decorateTicket(ticket), messages };
    }
    /**
     * Post a reply to a ticket. A staff reply (workspace admin/manager or
     * super_admin) stamps `first_response_at` if it is not already set. Any reply
     * bumps `updated_at` and re-opens a resolved/closed ticket into 'pending'.
     */
    async addMessage(actor, ticketId, input) {
        const body = trimStr(input?.body);
        if (!body)
            throw new common_1.BadRequestException('Message body is required');
        const ticket = await this.loadTicket(ticketId);
        await this.assertTicketAccess(actor, ticket);
        const isStaff = await this.isStaffFor(actor, ticket.workspaceId);
        const now = new Date();
        const [message] = await this.db
            .insert(db_1.supportTicketMessages)
            .values({ ticketId, authorId: actor.id, body, isStaff, createdAt: now })
            .returning();
        const patch = { updatedAt: now };
        if (isStaff && !ticket.firstResponseAt) {
            patch.firstResponseAt = now;
        }
        // A staff reply on an open ticket moves it to 'pending' (awaiting requester);
        // a requester reply on a resolved/closed ticket re-opens it.
        if (isStaff && ticket.status === 'open') {
            patch.status = 'pending';
        }
        else if (!isStaff && (ticket.status === 'resolved' || ticket.status === 'closed')) {
            patch.status = 'open';
        }
        await this.db.update(db_1.supportTickets).set(patch).where((0, drizzle_orm_1.eq)(db_1.supportTickets.id, ticketId));
        return message;
    }
    /**
     * Patch a ticket's status / priority / assignee. Requires staff access
     * (workspace admin/manager or super_admin) — a plain requester cannot mutate
     * ticket metadata. Resolving stamps `resolved_at`; re-opening clears it.
     */
    async updateTicket(actor, ticketId, input) {
        const ticket = await this.loadTicket(ticketId);
        if (!(await this.isStaffFor(actor, ticket.workspaceId))) {
            throw new common_1.ForbiddenException('Only support staff can update a ticket');
        }
        const patch = { updatedAt: new Date() };
        if (input.status !== undefined) {
            if (!support_constants_1.TICKET_STATUSES.includes(input.status)) {
                throw new common_1.BadRequestException('Invalid ticket status');
            }
            patch.status = input.status;
            if (input.status === 'resolved' || input.status === 'closed') {
                patch.resolvedAt = ticket.resolvedAt ?? new Date();
            }
            else {
                // Re-opening clears the resolution stamp so the SLA clock is honest.
                patch.resolvedAt = null;
            }
        }
        if (input.priority !== undefined) {
            if (!support_constants_1.TICKET_PRIORITIES.includes(input.priority)) {
                throw new common_1.BadRequestException('Invalid ticket priority');
            }
            patch.priority = input.priority;
        }
        if (input.assignedToId !== undefined) {
            patch.assignedToId = input.assignedToId || null;
        }
        const [updated] = await this.db
            .update(db_1.supportTickets)
            .set(patch)
            .where((0, drizzle_orm_1.eq)(db_1.supportTickets.id, ticketId))
            .returning();
        return this.decorateTicket(updated);
    }
    // ── Status page ───────────────────────────────────────────────────────────
    /**
     * Public status-page payload: every component (ordered) + recent incidents,
     * plus an overall banner derived from the worst component/incident state.
     */
    async getStatusPage() {
        const components = await this.db
            .select()
            .from(db_1.statusComponents)
            .orderBy(db_1.statusComponents.position, db_1.statusComponents.name);
        const incidents = await this.db
            .select()
            .from(db_1.statusIncidents)
            .orderBy((0, drizzle_orm_1.desc)(db_1.statusIncidents.startedAt))
            .limit(20);
        return {
            overall: this.overallStatus(components, incidents),
            components,
            incidents,
        };
    }
    /** super_admin: create a status-page component. */
    async createComponent(actor, input) {
        this.assertSuperAdmin(actor);
        const name = trimStr(input?.name);
        if (!name)
            throw new common_1.BadRequestException('Component name is required');
        const status = support_constants_1.COMPONENT_STATUSES.includes(input?.status ?? '')
            ? input.status
            : 'operational';
        const [component] = await this.db
            .insert(db_1.statusComponents)
            .values({ name, status, position: input?.position ?? 0 })
            .returning();
        return component;
    }
    /** super_admin: update a component's name / status / position. */
    async updateComponent(actor, componentId, input) {
        this.assertSuperAdmin(actor);
        const patch = {};
        if (input.name !== undefined)
            patch.name = trimStr(input.name);
        if (input.status !== undefined) {
            if (!support_constants_1.COMPONENT_STATUSES.includes(input.status)) {
                throw new common_1.BadRequestException('Invalid component status');
            }
            patch.status = input.status;
        }
        if (input.position !== undefined)
            patch.position = input.position;
        if (Object.keys(patch).length === 0)
            throw new common_1.BadRequestException('Nothing to update');
        const [updated] = await this.db
            .update(db_1.statusComponents)
            .set(patch)
            .where((0, drizzle_orm_1.eq)(db_1.statusComponents.id, componentId))
            .returning();
        if (!updated)
            throw new common_1.NotFoundException('Component not found');
        return updated;
    }
    /** super_admin: delete a component. */
    async deleteComponent(actor, componentId) {
        this.assertSuperAdmin(actor);
        await this.db.delete(db_1.statusComponents).where((0, drizzle_orm_1.eq)(db_1.statusComponents.id, componentId));
        return { ok: true };
    }
    /** super_admin: post a new incident to the status page. */
    async createIncident(actor, input) {
        this.assertSuperAdmin(actor);
        const title = trimStr(input?.title);
        if (!title)
            throw new common_1.BadRequestException('Incident title is required');
        const status = support_constants_1.INCIDENT_STATUSES.includes(input?.status ?? '')
            ? input.status
            : 'investigating';
        const [incident] = await this.db
            .insert(db_1.statusIncidents)
            .values({
            title,
            body: trimStr(input?.body),
            impact: trimStr(input?.impact) || 'minor',
            status,
            componentId: input?.componentId || null,
        })
            .returning();
        return incident;
    }
    /** super_admin: update an incident (status/body/impact); resolving stamps resolvedAt. */
    async updateIncident(actor, incidentId, input) {
        this.assertSuperAdmin(actor);
        const patch = {};
        if (input.title !== undefined)
            patch.title = trimStr(input.title);
        if (input.body !== undefined)
            patch.body = trimStr(input.body);
        if (input.impact !== undefined)
            patch.impact = trimStr(input.impact) || 'minor';
        if (input.componentId !== undefined)
            patch.componentId = input.componentId || null;
        if (input.status !== undefined) {
            if (!support_constants_1.INCIDENT_STATUSES.includes(input.status)) {
                throw new common_1.BadRequestException('Invalid incident status');
            }
            patch.status = input.status;
            patch.resolvedAt = input.status === 'resolved' ? new Date() : null;
        }
        if (Object.keys(patch).length === 0)
            throw new common_1.BadRequestException('Nothing to update');
        const [updated] = await this.db
            .update(db_1.statusIncidents)
            .set(patch)
            .where((0, drizzle_orm_1.eq)(db_1.statusIncidents.id, incidentId))
            .returning();
        if (!updated)
            throw new common_1.NotFoundException('Incident not found');
        return updated;
    }
    // ── Internal helpers ────────────────────────────────────────────────────────
    /** Attach derived SLA-breach flags to a ticket row. */
    decorateTicket(ticket) {
        const sla = (0, support_constants_1.computeSlaBreach)(ticket);
        return {
            ...ticket,
            slaBreached: sla.breached,
            firstResponseBreached: sla.firstResponseBreached,
            resolutionBreached: sla.resolutionBreached,
        };
    }
    overallStatus(components, incidents) {
        const hasOpenIncident = incidents.some((i) => i.status !== 'resolved');
        const worst = components.reduce((rank, c) => {
            const r = STATUS_RANK[c.status] ?? 0;
            return Math.max(rank, r);
        }, 0);
        if (worst === 3)
            return 'major_outage';
        if (worst === 2)
            return 'partial_outage';
        if (worst === 1 || hasOpenIncident)
            return 'degraded';
        return 'operational';
    }
    async loadTicket(ticketId) {
        const [ticket] = await this.db
            .select()
            .from(db_1.supportTickets)
            .where((0, drizzle_orm_1.eq)(db_1.supportTickets.id, ticketId))
            .limit(1);
        if (!ticket)
            throw new common_1.NotFoundException('Ticket not found');
        return ticket;
    }
    /** The workspaces where a user is an admin/manager (or nothing). */
    async staffedWorkspaceIds(userId) {
        const rows = await this.db
            .select({ workspaceId: db_1.workspaceMembers.workspaceId, role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId));
        return rows.filter((r) => WS_STAFF_ROLES.includes(r.role)).map((r) => r.workspaceId);
    }
    /** True if the actor is support staff for the given workspace. */
    async isStaffFor(actor, workspaceId) {
        if (actor.role === 'super_admin')
            return true;
        const [member] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
            .limit(1);
        return !!member && WS_STAFF_ROLES.includes(member.role);
    }
    /** Ensure the actor may read/reply to a ticket: creator, workspace staff, or super_admin. */
    async assertTicketAccess(actor, ticket) {
        if (actor.role === 'super_admin')
            return;
        if (ticket.createdById === actor.id)
            return;
        if (await this.isStaffFor(actor, ticket.workspaceId))
            return;
        throw new common_1.ForbiddenException('You do not have access to this ticket');
    }
    /**
     * §14.4 — the ticket system is restricted to paid tiers (Pro/Business/
     * Enterprise). A Free workspace gets a clean 403 with an upgrade message
     * instead of filing a ticket. super_admin (platform staff) bypasses. This is a
     * no-op for every existing workspace, which default to the enterprise tier.
     */
    assertTicketingAllowed(actor, plan) {
        if (actor.role === 'super_admin')
            return;
        if (!TICKETING_TIERS.includes(plan.id)) {
            throw new common_1.ForbiddenException(`The support ticket system is not included in the ${plan.label} plan. Upgrade to Pro, Business or Enterprise to open support tickets.`);
        }
    }
    /** Ensure the actor is a member of the workspace (super_admin bypasses). */
    async assertWorkspaceMember(actor, workspaceId) {
        if (actor.role === 'super_admin')
            return;
        const [member] = await this.db
            .select({ id: db_1.workspaceMembers.id })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
            .limit(1);
        if (!member)
            throw new common_1.ForbiddenException('You are not a member of this workspace');
    }
    assertSuperAdmin(actor) {
        if (actor.role !== 'super_admin') {
            throw new common_1.ForbiddenException('Super admin role required');
        }
    }
};
exports.SupportService = SupportService;
exports.SupportService = SupportService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, plans_service_1.PlansService])
], SupportService);
const STATUS_RANK = {
    operational: 0,
    degraded: 1,
    partial_outage: 2,
    major_outage: 3,
};
//# sourceMappingURL=support.service.js.map