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
exports.OrganizationsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
let OrganizationsService = class OrganizationsService {
    constructor(db) {
        this.db = db;
    }
    async findById(id) {
        const [org] = await this.db.select().from(db_1.organizations).where((0, drizzle_orm_1.eq)(db_1.organizations.id, id));
        return org ?? null;
    }
    async listAll() {
        const rows = await this.db
            .select({
            id: db_1.organizations.id,
            name: db_1.organizations.name,
            slug: db_1.organizations.slug,
            logoUrl: db_1.organizations.logoUrl,
            createdAt: db_1.organizations.createdAt,
            updatedAt: db_1.organizations.updatedAt,
            membersCount: (0, drizzle_orm_1.sql) `count(distinct ${db_1.organizationMembers.userId})::int`,
            workspacesCount: (0, drizzle_orm_1.sql) `count(distinct ${db_1.workspaces.id})::int`,
        })
            .from(db_1.organizations)
            .leftJoin(db_1.organizationMembers, (0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, db_1.organizations.id))
            .leftJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.organizationId, db_1.organizations.id))
            .groupBy(db_1.organizations.id, db_1.organizations.name, db_1.organizations.slug, db_1.organizations.logoUrl, db_1.organizations.createdAt, db_1.organizations.updatedAt);
        return rows;
    }
    /**
     * Global user directory (Plan §2.1) — a platform-wide, cross-workspace list of
     * every user, each with their per-workspace memberships. Super-admin only; the
     * caller (controller) enforces the super_admin gate. Read-only.
     *
     * `q` matches name OR email (case-insensitive). Results are paginated with
     * limit/offset and ordered newest-first; `total` is the unpaginated count so
     * the UI can render pagination.
     */
    async listDirectory(opts = {}) {
        // Sanitize pagination — tolerate NaN/negatives coming from raw query strings.
        const rawLimit = Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : 50;
        const limit = Math.min(Math.max(rawLimit, 1), 200);
        const rawOffset = Number.isFinite(opts.offset) ? Math.trunc(opts.offset) : 0;
        const offset = Math.max(rawOffset, 0);
        const q = opts.q?.trim();
        const where = q
            ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(db_1.users.displayName, `%${q}%`), (0, drizzle_orm_1.ilike)(db_1.users.email, `%${q}%`))
            : undefined;
        // Unpaginated total for the current filter, so the client can paginate.
        const [{ total }] = await this.db
            .select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.users)
            .where(where ?? (0, drizzle_orm_1.sql) `true`);
        const rows = await this.db
            .select({
            id: db_1.users.id,
            displayName: db_1.users.displayName,
            email: db_1.users.email,
            avatarUrl: db_1.users.avatarUrl,
            role: db_1.users.role,
            emailVerified: db_1.users.emailVerified,
            isActive: db_1.users.isActive,
            lastSeenAt: db_1.users.lastSeenAt,
            createdAt: db_1.users.createdAt,
        })
            .from(db_1.users)
            .where(where ?? (0, drizzle_orm_1.sql) `true`)
            .orderBy((0, drizzle_orm_1.desc)(db_1.users.createdAt))
            .limit(limit)
            .offset(offset);
        // Fetch workspace memberships only for the page of users we're returning
        // (join workspace_members → workspaces), then group them per user in memory.
        const userIds = rows.map((r) => r.id);
        const memberships = userIds.length
            ? await this.db
                .select({
                userId: db_1.workspaceMembers.userId,
                workspaceId: db_1.workspaces.id,
                workspaceName: db_1.workspaces.name,
                workspaceSlug: db_1.workspaces.slug,
                role: db_1.workspaceMembers.role,
            })
                .from(db_1.workspaceMembers)
                .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.workspaceMembers.workspaceId))
                .where((0, drizzle_orm_1.inArray)(db_1.workspaceMembers.userId, userIds))
            : [];
        const byUser = new Map();
        for (const m of memberships) {
            const list = byUser.get(m.userId) ?? [];
            list.push({
                workspaceId: m.workspaceId,
                workspaceName: m.workspaceName,
                workspaceSlug: m.workspaceSlug,
                role: m.role,
            });
            byUser.set(m.userId, list);
        }
        return {
            users: rows.map((r) => ({ ...r, workspaces: byUser.get(r.id) ?? [] })),
            total,
            limit,
            offset,
        };
    }
    async update(id, patch) {
        const set = { updatedAt: new Date() };
        for (const key of ['name', 'logoUrl']) {
            if (patch[key] !== undefined)
                set[key] = patch[key];
        }
        const [updated] = await this.db
            .update(db_1.organizations)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.organizations.id, id))
            .returning();
        if (!updated)
            throw new common_1.NotFoundException('Organization not found');
        return updated;
    }
    async listMembers(organizationId) {
        return this.db
            .select({
            id: db_1.users.id,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
            role: db_1.organizationMembers.role,
            joinedAt: db_1.organizationMembers.joinedAt,
        })
            .from(db_1.organizationMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.organizationMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId));
    }
    /**
     * §G08 [08:35–09:57] — the org-admin roster, narrowed to what a roster needs.
     *
     * This returned `select()` — every column of every workspace in the
     * organization, to an admin who need not be a member of any of them. Among
     * those columns is `customDomainToken`, the `rundesk-verify=…` secret used to
     * prove control of a domain, plus branding, `purpose` and `comingFrom`, which
     * are answers somebody gave inside their own workspace.
     *
     * Its one caller asks for four fields (master-admin-panel.tsx:762), so the
     * breadth bought nothing and exposed a secret to people outside the
     * workspace. Projected explicitly now: a new column is not published to this
     * audience by default, which is the property that failed here.
     *
     * NOT narrowed by membership. She settles that a workspace someone makes is
     * theirs until they share it — "woh meri email pe ban rahi hai" — and the
     * member-facing list already honours that (`findByMember` joins through
     * `workspace_members`). What she never settles is whether a company admin
     * keeps a residual right to *enumerate* for billing or offboarding, so that
     * is left exactly as it was rather than decided here.
     */
    async listWorkspaces(organizationId) {
        return this.db
            .select({
            id: db_1.workspaces.id,
            name: db_1.workspaces.name,
            slug: db_1.workspaces.slug,
            plan: db_1.workspaces.plan,
            isArchived: db_1.workspaces.isArchived,
            createdAt: db_1.workspaces.createdAt,
        })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.organizationId, organizationId));
    }
    async updateMemberRole(organizationId, userId, role, actorId) {
        const ALLOWED_ROLES = ['owner', 'admin', 'billing', 'member'];
        if (!ALLOWED_ROLES.includes(role)) {
            throw new common_1.BadRequestException(`Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}`);
        }
        // Only an existing owner may grant the owner role (prevents a non-owner
        // admin from escalating themselves or others past their own level).
        if (role === 'owner' && actorId) {
            const [actor] = await this.db
                .select({ role: db_1.organizationMembers.role })
                .from(db_1.organizationMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, actorId)))
                .limit(1);
            if (!actor || actor.role !== 'owner') {
                throw new common_1.ForbiddenException('Only an organization owner can grant the owner role');
            }
        }
        // Last owner protection
        if (role !== 'owner') {
            const [currentMember] = await this.db
                .select()
                .from(db_1.organizationMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId)));
            if (currentMember?.role === 'owner') {
                const owners = await this.db
                    .select()
                    .from(db_1.organizationMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.role, 'owner')));
                if (owners.length <= 1) {
                    throw new common_1.ForbiddenException('Cannot demote the last owner of the organization');
                }
            }
        }
        const [updated] = await this.db
            .update(db_1.organizationMembers)
            .set({ role })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId)))
            .returning();
        if (!updated)
            throw new common_1.NotFoundException('Member not found in organization');
        return updated;
    }
    async removeMember(organizationId, userId) {
        const [member] = await this.db
            .select()
            .from(db_1.organizationMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId)));
        if (!member)
            throw new common_1.NotFoundException('Member not found');
        if (member.role === 'owner') {
            const owners = await this.db
                .select()
                .from(db_1.organizationMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.role, 'owner')));
            if (owners.length <= 1) {
                throw new common_1.ForbiddenException('Cannot remove the last owner of the organization');
            }
        }
        return this.db.transaction(async (tx) => {
            // 1. Remove from all workspaces in this org
            const orgWorkspaces = await tx
                .select({ id: db_1.workspaces.id })
                .from(db_1.workspaces)
                .where((0, drizzle_orm_1.eq)(db_1.workspaces.organizationId, organizationId));
            if (orgWorkspaces.length > 0) {
                const wsIds = orgWorkspaces.map(w => w.id);
                // Drizzle doesn't have a direct 'in' helper in the same way, we use sql or eq if single.
                // But for multiple we can use inArray if imported.
                // For simplicity since I don't want to hunt for imports, I'll loop or use raw.
                for (const wsId of wsIds) {
                    await tx.delete(db_1.workspaceMembers).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, wsId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)));
                }
            }
            // 2. Remove from org
            await tx.delete(db_1.organizationMembers).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, userId)));
            return { ok: true };
        });
    }
    async leaveOrganization(organizationId, userId) {
        return this.removeMember(organizationId, userId);
    }
};
exports.OrganizationsService = OrganizationsService;
exports.OrganizationsService = OrganizationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], OrganizationsService);
//# sourceMappingURL=organizations.service.js.map