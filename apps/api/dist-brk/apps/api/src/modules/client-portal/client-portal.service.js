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
exports.ClientPortalService = void 0;
exports.humanizeStatusKey = humanizeStatusKey;
exports.toClientTask = toClientTask;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const container_access_guard_helper_1 = require("../../common/permissions/container-access.guard-helper");
/** Humanise a raw status key when no list_status row resolves its label. */
function humanizeStatusKey(key) {
    const s = (key ?? '').replace(/[_-]+/g, ' ').trim();
    if (!s)
        return 'Status';
    return s.charAt(0).toUpperCase() + s.slice(1);
}
/**
 * Pure, allow-list projection of a task down to client-safe fields. Even if the
 * caller hands a row carrying internal fields, only the whitelisted keys are
 * emitted — a second guard behind the already-narrowed SQL select.
 */
function toClientTask(row) {
    return {
        id: row.id,
        title: row.title,
        status: row.statusLabel && row.statusLabel.trim() ? row.statusLabel : humanizeStatusKey(row.status),
        statusCategory: row.statusCategory,
        statusColor: row.statusColor ?? null,
        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
        isMilestone: !!row.isMilestone,
    };
}
let ClientPortalService = class ClientPortalService {
    constructor(db) {
        this.db = db;
    }
    // ─── Admin: resolve + authorize ────────────────────────────────────────────
    /** Resolve a project's owning workspace + container visibility chain. */
    async resolveProject(projectId) {
        const [row] = await this.db
            .select({
            projectId: db_1.projects.id,
            projectName: db_1.projects.name,
            projectVisibility: db_1.projects.visibility,
            spaceId: db_1.spaces.id,
            spaceVisibility: db_1.spaces.visibility,
            workspaceId: db_1.spaces.workspaceId,
        })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
            .limit(1);
        return row ?? null;
    }
    /**
     * Assert the actor may manage portals for a project: workspace member with
     * container (private space/project) access. Reuses the same helper the
     * ResourceMemberGuard applies to project routes.
     */
    async assertProjectManageAccess(projectId, userId) {
        const proj = await this.resolveProject(projectId);
        if (!proj)
            throw new common_1.NotFoundException('Project not found');
        const [member] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, proj.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!member)
            throw new common_1.ForbiddenException('You are not a member of this workspace');
        const ok = await (0, container_access_guard_helper_1.checkContainerAccess)(this.db, {
            spaceId: proj.spaceId,
            spaceVisibility: proj.spaceVisibility,
            projectId: proj.projectId,
            projectVisibility: proj.projectVisibility,
        }, { userId, workspaceRole: member.role });
        if (!ok)
            throw new common_1.ForbiddenException('This space or project is private');
        return proj;
    }
    async getPortalOr404(portalId) {
        const [portal] = await this.db.select().from(db_1.clientPortals).where((0, drizzle_orm_1.eq)(db_1.clientPortals.id, portalId)).limit(1);
        if (!portal)
            throw new common_1.NotFoundException('Portal not found');
        return portal;
    }
    toAdminView(p) {
        return {
            id: p.id,
            projectId: p.projectId,
            clientId: p.clientId,
            token: p.token,
            url: `/portal/${p.token}`,
            name: p.name,
            isEnabled: p.isEnabled,
            showCompleted: p.showCompleted,
            createdById: p.createdById,
            createdAt: p.createdAt,
            lastViewedAt: p.lastViewedAt,
        };
    }
    // ─── Admin: CRUD ───────────────────────────────────────────────────────────
    async create(projectId, userId, body = {}) {
        const proj = await this.assertProjectManageAccess(projectId, userId);
        let clientId = null;
        if (body.clientId) {
            const [client] = await this.db
                .select({ id: db_1.clients.id })
                .from(db_1.clients)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.clients.id, body.clientId), (0, drizzle_orm_1.eq)(db_1.clients.workspaceId, proj.workspaceId)))
                .limit(1);
            if (!client)
                throw new common_1.BadRequestException('Client not found in this workspace');
            clientId = client.id;
        }
        // Unguessable token; retry on the (astronomically unlikely) unique clash.
        for (let attempt = 0; attempt < 5; attempt++) {
            const token = (0, node_crypto_1.randomBytes)(18).toString('base64url'); // 24 chars
            const [row] = await this.db
                .insert(db_1.clientPortals)
                .values({
                workspaceId: proj.workspaceId,
                projectId,
                clientId,
                token,
                name: typeof body.name === 'string' ? body.name.trim() || null : null,
                showCompleted: body.showCompleted ?? true,
                createdById: userId,
            })
                .onConflictDoNothing({ target: db_1.clientPortals.token })
                .returning();
            if (row)
                return this.toAdminView(row);
        }
        throw new common_1.BadRequestException('Could not allocate a portal token, please retry');
    }
    async listForProject(projectId, userId) {
        await this.assertProjectManageAccess(projectId, userId);
        const rows = await this.db
            .select()
            .from(db_1.clientPortals)
            .where((0, drizzle_orm_1.eq)(db_1.clientPortals.projectId, projectId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.clientPortals.createdAt));
        return rows.map((r) => this.toAdminView(r));
    }
    async update(portalId, userId, body) {
        const portal = await this.getPortalOr404(portalId);
        await this.assertProjectManageAccess(portal.projectId, userId);
        const patch = {};
        if (body.name !== undefined)
            patch.name = typeof body.name === 'string' ? body.name.trim() || null : null;
        if (body.isEnabled !== undefined)
            patch.isEnabled = body.isEnabled;
        if (body.showCompleted !== undefined)
            patch.showCompleted = body.showCompleted;
        if (Object.keys(patch).length === 0)
            return this.toAdminView(portal);
        const [row] = await this.db.update(db_1.clientPortals).set(patch).where((0, drizzle_orm_1.eq)(db_1.clientPortals.id, portalId)).returning();
        return this.toAdminView(row);
    }
    async remove(portalId, userId) {
        const portal = await this.getPortalOr404(portalId);
        await this.assertProjectManageAccess(portal.projectId, userId);
        await this.db.delete(db_1.clientPortals).where((0, drizzle_orm_1.eq)(db_1.clientPortals.id, portalId));
        return { ok: true };
    }
    // ─── Public: token-only, read-only, strictly one-project projection ─────────
    /**
     * SECURITY-CRITICAL. Anonymous read by token. Returns ONLY:
     *   - workspace branding (name, logo, primary/accent color)
     *   - the linked project's display name (+ optional portal/client name)
     *   - that ONE project's tasks, projected to client-safe fields only
     *   - a coarse progress summary
     * Nothing internal (assignee emails, comments, notes, priority, estimates,
     * other projects) is ever queried or returned. Disabled portal → 404;
     * `show_completed=false` hides closed tasks from the list.
     */
    async getPublicView(token) {
        if (!token || token.length > 64)
            throw new common_1.NotFoundException('Portal not found');
        const [portal] = await this.db.select().from(db_1.clientPortals).where((0, drizzle_orm_1.eq)(db_1.clientPortals.token, token)).limit(1);
        // Missing OR disabled → the same opaque 404 (never reveal a disabled link).
        if (!portal || !portal.isEnabled)
            throw new common_1.NotFoundException('Portal not found');
        const [meta] = await this.db
            .select({
            projectName: db_1.projects.name,
            workspaceName: db_1.workspaces.name,
            workspaceLogoUrl: db_1.workspaces.logoUrl,
            workspacePrimaryColor: db_1.workspaces.primaryColor,
            workspaceAccentColor: db_1.workspaces.accentColor,
        })
            .from(db_1.projects)
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, portal.workspaceId))
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, portal.projectId))
            .limit(1);
        if (!meta)
            throw new common_1.NotFoundException('Portal not found');
        let clientName = null;
        if (portal.clientId) {
            const [client] = await this.db
                .select({ name: db_1.clients.name })
                .from(db_1.clients)
                .where((0, drizzle_orm_1.eq)(db_1.clients.id, portal.clientId))
                .limit(1);
            clientName = client?.name ?? null;
        }
        // Tasks scoped to THIS project only (via its lists), non-archived. The
        // select is the security boundary: client-safe columns exclusively.
        const rows = (await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            statusLabel: db_1.listStatuses.name,
            statusColor: db_1.listStatuses.color,
            dueDate: db_1.tasks.dueDate,
            completedAt: db_1.tasks.completedAt,
            isMilestone: db_1.tasks.isMilestone,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .leftJoin(db_1.listStatuses, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.listStatuses.listId, db_1.tasks.listId), (0, drizzle_orm_1.eq)(db_1.listStatuses.key, db_1.tasks.status)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.lists.projectId, portal.projectId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, false), 
        // §2 per-item privacy: an anonymous client portal never exposes a
        // private task or a task inside a private list.
        (0, drizzle_orm_1.ne)(db_1.tasks.visibility, 'private'), (0, drizzle_orm_1.ne)(db_1.lists.visibility, 'private')))
            .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.position)));
        // Progress is computed over ALL non-archived tasks so the bar stays honest
        // even when completed tasks are hidden from the visible list.
        const total = rows.length;
        const completed = rows.filter((r) => r.statusCategory === 'closed').length;
        const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
        const visible = portal.showCompleted ? rows : rows.filter((r) => r.statusCategory !== 'closed');
        const clientTasks = visible.map(toClientTask);
        // Best-effort view stamp; never block or fail the read on it.
        void (async () => {
            try {
                await this.db.update(db_1.clientPortals).set({ lastViewedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.clientPortals.id, portal.id));
            }
            catch {
                /* ignore */
            }
        })();
        return {
            portal: { name: portal.name || meta.projectName },
            project: { name: meta.projectName },
            client: clientName ? { name: clientName } : null,
            workspace: {
                name: meta.workspaceName,
                logoUrl: meta.workspaceLogoUrl,
                primaryColor: meta.workspacePrimaryColor,
                accentColor: meta.workspaceAccentColor,
            },
            showCompleted: portal.showCompleted,
            progress: { total, completed, percent },
            tasks: clientTasks,
        };
    }
};
exports.ClientPortalService = ClientPortalService;
exports.ClientPortalService = ClientPortalService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ClientPortalService);
//# sourceMappingURL=client-portal.service.js.map