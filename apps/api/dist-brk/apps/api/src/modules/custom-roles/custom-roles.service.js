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
var CustomRolesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomRolesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
const permission_catalog_1 = require("./permission-catalog");
const RESERVED_NAMES = new Set(['admin', 'workspace admin', 'manager', 'member', 'guest', 'super admin']);
const NAME_MAX = 60;
const DESCRIPTION_MAX = 240;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
let CustomRolesService = CustomRolesService_1 = class CustomRolesService {
    constructor(db, security) {
        this.db = db;
        this.security = security;
        /**
         * Tiny in-process cache of resolved permission sets keyed by
         * `workspaceMemberId`. Invalidated on any role / assignment mutation
         * for that member. Sized small and intentionally not LRU — this is a
         * hot read path for permission checks and we'd rather rebuild than
         * over-engineer eviction.
         */
        this.permissionCache = new Map();
    }
    // -------------------------------------------------------------- CRUD
    async list(workspaceId) {
        const rows = await this.db
            .select()
            .from(db_1.customRoles)
            .where((0, drizzle_orm_1.eq)(db_1.customRoles.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.customRoles.position), (0, drizzle_orm_1.asc)(db_1.customRoles.createdAt));
        if (rows.length === 0)
            return [];
        const ids = rows.map((r) => r.id);
        const [perms, counts] = await Promise.all([
            this.db
                .select()
                .from(db_1.customRolePermissions)
                .where((0, drizzle_orm_1.inArray)(db_1.customRolePermissions.roleId, ids)),
            this.db
                .select({ roleId: db_1.workspaceMemberCustomRoles.roleId })
                .from(db_1.workspaceMemberCustomRoles)
                .where((0, drizzle_orm_1.inArray)(db_1.workspaceMemberCustomRoles.roleId, ids)),
        ]);
        const permsByRole = new Map();
        for (const p of perms) {
            if (!(0, permission_catalog_1.isKnownPermission)(p.permission))
                continue;
            const list = permsByRole.get(p.roleId) ?? [];
            list.push(p.permission);
            permsByRole.set(p.roleId, list);
        }
        const countByRole = new Map();
        for (const c of counts)
            countByRole.set(c.roleId, (countByRole.get(c.roleId) ?? 0) + 1);
        return rows.map((r) => this.toView(r, permsByRole.get(r.id) ?? [], countByRole.get(r.id) ?? 0));
    }
    async getById(workspaceId, roleId) {
        const role = await this.requireRole(workspaceId, roleId);
        const [perms, assignments] = await Promise.all([
            this.db
                .select()
                .from(db_1.customRolePermissions)
                .where((0, drizzle_orm_1.eq)(db_1.customRolePermissions.roleId, roleId)),
            this.db
                .select({ id: db_1.workspaceMemberCustomRoles.id })
                .from(db_1.workspaceMemberCustomRoles)
                .where((0, drizzle_orm_1.eq)(db_1.workspaceMemberCustomRoles.roleId, roleId)),
        ]);
        return this.toView(role, perms.map((p) => p.permission).filter(permission_catalog_1.isKnownPermission), assignments.length);
    }
    async create(workspaceId, input, actor) {
        const name = this.normaliseName(input.name);
        const description = this.normaliseDescription(input.description ?? null);
        const color = this.normaliseColor(input.color);
        const permissions = this.normalisePermissions(input.permissions ?? []);
        await this.assertNameAvailable(workspaceId, name);
        const [highest] = await this.db
            .select({ position: db_1.customRoles.position })
            .from(db_1.customRoles)
            .where((0, drizzle_orm_1.eq)(db_1.customRoles.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.customRoles.position))
            .limit(1);
        const nextPos = highest ? highest.position + 1 : 0;
        const [created] = await this.db
            .insert(db_1.customRoles)
            .values({
            workspaceId,
            name,
            description,
            color,
            position: nextPos,
            createdById: actor.id,
        })
            .returning();
        if (!created)
            throw new Error('Failed to create role');
        if (permissions.length > 0) {
            await this.db
                .insert(db_1.customRolePermissions)
                .values(permissions.map((permission) => ({ roleId: created.id, permission })));
        }
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'role.created',
            resourceType: 'custom_role',
            resourceId: created.id,
            description: `Custom role "${name}" created`,
            metadata: { name, permissions: permissions.length },
        });
        return this.toView(created, permissions, 0);
    }
    async update(workspaceId, roleId, patch, actor) {
        const existing = await this.requireRole(workspaceId, roleId);
        const next = {};
        if (patch.name !== undefined) {
            if (existing.isLocked)
                throw new common_1.BadRequestException('Locked roles cannot be renamed');
            const name = this.normaliseName(patch.name);
            if (name !== existing.name)
                await this.assertNameAvailable(workspaceId, name);
            next.name = name;
        }
        if (patch.description !== undefined)
            next.description = this.normaliseDescription(patch.description);
        if (patch.color !== undefined)
            next.color = this.normaliseColor(patch.color);
        if (Object.keys(next).length > 0) {
            next.updatedAt = new Date();
            await this.db.update(db_1.customRoles).set(next).where((0, drizzle_orm_1.eq)(db_1.customRoles.id, roleId));
        }
        if (patch.permissions !== undefined) {
            const permissions = this.normalisePermissions(patch.permissions);
            await this.db.delete(db_1.customRolePermissions).where((0, drizzle_orm_1.eq)(db_1.customRolePermissions.roleId, roleId));
            if (permissions.length > 0) {
                await this.db
                    .insert(db_1.customRolePermissions)
                    .values(permissions.map((permission) => ({ roleId, permission })));
            }
        }
        this.invalidateAfterRoleChange();
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'role.updated',
            resourceType: 'custom_role',
            resourceId: roleId,
            description: `Custom role "${next.name ?? existing.name}" updated`,
        });
        return this.getById(workspaceId, roleId);
    }
    async remove(workspaceId, roleId, actor) {
        const existing = await this.requireRole(workspaceId, roleId);
        if (existing.isLocked)
            throw new common_1.BadRequestException('Locked roles cannot be deleted');
        await this.db.delete(db_1.customRoles).where((0, drizzle_orm_1.eq)(db_1.customRoles.id, roleId));
        this.invalidateAfterRoleChange();
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'role.deleted',
            resourceType: 'custom_role',
            resourceId: roleId,
            description: `Custom role "${existing.name}" deleted`,
        });
    }
    // -------------------------------------------------------- assignments
    async listAssignees(workspaceId, roleId) {
        await this.requireRole(workspaceId, roleId);
        const rows = await this.db
            .select({ memberId: db_1.workspaceMemberCustomRoles.workspaceMemberId })
            .from(db_1.workspaceMemberCustomRoles)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMemberCustomRoles.roleId, roleId));
        return rows.map((r) => r.memberId);
    }
    async listForMember(workspaceId, workspaceMemberId) {
        const rows = await this.db
            .select({
            role: db_1.customRoles,
            assignment: db_1.workspaceMemberCustomRoles,
        })
            .from(db_1.workspaceMemberCustomRoles)
            .innerJoin(db_1.customRoles, (0, drizzle_orm_1.eq)(db_1.customRoles.id, db_1.workspaceMemberCustomRoles.roleId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMemberCustomRoles.workspaceMemberId, workspaceMemberId), (0, drizzle_orm_1.eq)(db_1.customRoles.workspaceId, workspaceId)));
        if (rows.length === 0)
            return [];
        const ids = rows.map((r) => r.role.id);
        const perms = await this.db
            .select()
            .from(db_1.customRolePermissions)
            .where((0, drizzle_orm_1.inArray)(db_1.customRolePermissions.roleId, ids));
        const permsByRole = new Map();
        for (const p of perms) {
            if (!(0, permission_catalog_1.isKnownPermission)(p.permission))
                continue;
            const list = permsByRole.get(p.roleId) ?? [];
            list.push(p.permission);
            permsByRole.set(p.roleId, list);
        }
        return rows.map(({ role }) => this.toView(role, permsByRole.get(role.id) ?? [], 0));
    }
    async assign(workspaceId, workspaceMemberId, roleId, actor) {
        const role = await this.requireRole(workspaceId, roleId);
        await this.requireMember(workspaceId, workspaceMemberId);
        try {
            await this.db.insert(db_1.workspaceMemberCustomRoles).values({
                workspaceMemberId,
                roleId,
                assignedById: actor.id,
            });
        }
        catch (err) {
            // Idempotent — re-assigning the same role is a no-op.
            if (!String(err).includes('uq_workspace_member_custom_roles_member_role'))
                throw err;
        }
        this.permissionCache.delete(workspaceMemberId);
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'role.assigned',
            resourceType: 'workspace_member',
            resourceId: workspaceMemberId,
            description: `Assigned role "${role.name}" to member`,
            metadata: { roleId },
        });
    }
    async unassign(workspaceId, workspaceMemberId, roleId, actor) {
        const role = await this.requireRole(workspaceId, roleId);
        await this.db
            .delete(db_1.workspaceMemberCustomRoles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMemberCustomRoles.workspaceMemberId, workspaceMemberId), (0, drizzle_orm_1.eq)(db_1.workspaceMemberCustomRoles.roleId, roleId)));
        this.permissionCache.delete(workspaceMemberId);
        await this.security.logAuditEvent({
            workspaceId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'role.unassigned',
            resourceType: 'workspace_member',
            resourceId: workspaceMemberId,
            description: `Removed role "${role.name}" from member`,
            metadata: { roleId },
        });
    }
    // ------------------------------------------------------ permission API
    /**
     * Resolve the effective permission set for a user within a workspace,
     * unioning the legacy-role grant with every assigned custom role.
     * Returns null if the user is not a member of the workspace.
     */
    async resolveForUser(workspaceId, userId) {
        const [membership] = await this.db
            .select()
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)));
        if (!membership)
            return null;
        return this.resolveForMember(membership.id, membership.role);
    }
    async resolveForMember(workspaceMemberId, legacyRole) {
        const cached = this.permissionCache.get(workspaceMemberId);
        if (cached && cached.legacyRole === legacyRole)
            return cached;
        const assignments = await this.db
            .select({ roleId: db_1.workspaceMemberCustomRoles.roleId })
            .from(db_1.workspaceMemberCustomRoles)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMemberCustomRoles.workspaceMemberId, workspaceMemberId));
        const customRoleIds = assignments.map((a) => a.roleId);
        const customPerms = customRoleIds.length
            ? await this.db
                .select()
                .from(db_1.customRolePermissions)
                .where((0, drizzle_orm_1.inArray)(db_1.customRolePermissions.roleId, customRoleIds))
            : [];
        const merged = new Set((0, permission_catalog_1.effectiveCascade)(legacyRole));
        for (const p of customPerms) {
            if ((0, permission_catalog_1.isKnownPermission)(p.permission))
                merged.add(p.permission);
        }
        const resolution = {
            permissions: Array.from(merged).sort(),
            legacyRole,
            customRoleIds,
        };
        if (this.permissionCache.size >= CustomRolesService_1.CACHE_MAX) {
            // Cheap eviction: drop one arbitrary entry. The set is small enough
            // that occasional rebuilds are fine.
            const firstKey = this.permissionCache.keys().next().value;
            if (firstKey)
                this.permissionCache.delete(firstKey);
        }
        this.permissionCache.set(workspaceMemberId, resolution);
        return resolution;
    }
    /**
     * Convenience helper for callers that already know the workspaceId
     * and userId (e.g. controllers). Returns `false` if the user is not
     * a member of the workspace at all.
     */
    async hasPermission(workspaceId, userId, permission) {
        const resolution = await this.resolveForUser(workspaceId, userId);
        if (!resolution)
            return false;
        return resolution.permissions.includes(permission);
    }
    // ----------------------------------------------------------- helpers
    async requireRole(workspaceId, roleId) {
        const [role] = await this.db
            .select()
            .from(db_1.customRoles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customRoles.id, roleId), (0, drizzle_orm_1.eq)(db_1.customRoles.workspaceId, workspaceId)));
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        return role;
    }
    async requireMember(workspaceId, workspaceMemberId) {
        const [member] = await this.db
            .select()
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.id, workspaceMemberId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId)));
        if (!member)
            throw new common_1.NotFoundException('Member not found');
        return member;
    }
    async assertNameAvailable(workspaceId, name) {
        const [existing] = await this.db
            .select({ id: db_1.customRoles.id })
            .from(db_1.customRoles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customRoles.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.customRoles.name, name)));
        if (existing)
            throw new common_1.ConflictException('A role with that name already exists');
    }
    invalidateAfterRoleChange() {
        // Any member with this role might now have a stale resolution.
        // We don't know which ones without an extra query, so just nuke
        // the whole cache. It's small.
        this.permissionCache.clear();
    }
    normaliseName(raw) {
        const trimmed = raw.trim();
        if (!trimmed)
            throw new common_1.BadRequestException('Name is required');
        if (trimmed.length > NAME_MAX)
            throw new common_1.BadRequestException(`Name must be ${NAME_MAX} characters or fewer`);
        if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
            throw new common_1.BadRequestException(`"${trimmed}" is reserved — pick a different name`);
        }
        return trimmed;
    }
    normaliseDescription(raw) {
        if (raw === null)
            return null;
        const trimmed = raw.trim();
        if (!trimmed)
            return null;
        if (trimmed.length > DESCRIPTION_MAX) {
            throw new common_1.BadRequestException(`Description must be ${DESCRIPTION_MAX} characters or fewer`);
        }
        return trimmed;
    }
    normaliseColor(raw) {
        if (!raw)
            return '#64748b';
        if (!COLOR_RE.test(raw))
            throw new common_1.BadRequestException('Color must be a #RRGGBB hex value');
        return raw.toLowerCase();
    }
    normalisePermissions(raw) {
        const seen = new Set();
        // Guard non-array input (e.g. permissions:{}) — otherwise `for…of` on a
        // non-iterable threw and surfaced as a 500 instead of a clean 400.
        if (!Array.isArray(raw)) {
            throw new common_1.BadRequestException('permissions must be an array of permission keys');
        }
        for (const candidate of raw) {
            if (typeof candidate !== 'string')
                continue;
            const trimmed = candidate.trim();
            if (!trimmed)
                continue;
            if (!(0, permission_catalog_1.isKnownPermission)(trimmed)) {
                throw new common_1.BadRequestException(`Unknown permission: ${trimmed}`);
            }
            seen.add(trimmed);
        }
        return Array.from(seen).sort();
    }
    toView(row, permissions, memberCount) {
        return {
            id: row.id,
            workspaceId: row.workspaceId,
            name: row.name,
            description: row.description,
            color: row.color,
            isLocked: row.isLocked,
            position: row.position,
            permissions,
            memberCount,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
    /**
     * Static export of the catalog so the controller can serve it without
     * needing to inject the service in a request scope. Lives here so
     * future filtering by feature flag stays in one place.
     */
    getCatalog() {
        return permission_catalog_1.PERMISSION_CATALOG;
    }
};
exports.CustomRolesService = CustomRolesService;
CustomRolesService.CACHE_MAX = 500;
exports.CustomRolesService = CustomRolesService = CustomRolesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService])
], CustomRolesService);
//# sourceMappingURL=custom-roles.service.js.map