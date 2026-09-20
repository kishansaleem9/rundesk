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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const container_access_1 = require("../../common/permissions/container-access");
const container_access_guard_helper_1 = require("../../common/permissions/container-access.guard-helper");
const webhooks_service_1 = require("../webhooks/webhooks.service");
const slack_service_1 = require("../integrations/slack/slack.service");
const plans_service_1 = require("../plans/plans.service");
const security_service_1 = require("../security/security.service");
let ProjectsService = class ProjectsService {
    constructor(db, webhooks, slack, plans, security) {
        this.db = db;
        this.webhooks = webhooks;
        this.slack = slack;
        this.plans = plans;
        this.security = security;
    }
    /**
     * Best-effort fan-out of a project lifecycle event to webhooks + Slack
     * (Plan §12.1 project update alerts, §12.4 webhooks). Mirrors
     * TasksService.fireTaskEvent: the workspace is resolved via the project's
     * space, delivery is non-blocking, and any failure is logged but never
     * propagated so a downed webhook/Slack channel can't break the mutation.
     */
    async fireProjectEvent(eventType, project, actorId) {
        const [space] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.spaces)
            .where((0, drizzle_orm_1.eq)(db_1.spaces.id, project.spaceId))
            .limit(1);
        if (!space)
            return;
        const workspaceId = space.workspaceId;
        const payload = {
            project: { id: project.id, name: project.name, spaceId: project.spaceId, workspaceId },
            actorId: actorId ?? null,
        };
        try {
            await this.webhooks.fire(workspaceId, eventType, payload);
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[webhooks.fire] ${eventType} failed:`, e);
        }
        try {
            const message = eventType === 'project.created'
                ? `:file_folder: New project created: *${project.name}*`
                : `:pencil2: Project updated: *${project.name}*`;
            // Routes through the same per-channel routing rules task events use —
            // rules are keyed by event filter (+ optional project scope), so
            // project events are eligible without any routing-model change.
            await this.slack.notify(workspaceId, eventType, message, { projectId: project.id });
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[slack.notify] ${eventType} failed:`, e);
        }
    }
    async createProject(spaceId, data, actorId) {
        // Plan §14.1: enforce the plan's project cap. Resolve the owning workspace via
        // the space, then check. No-op for enterprise (unlimited) — every existing
        // workspace by default.
        const [space] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.spaces)
            .where((0, drizzle_orm_1.eq)(db_1.spaces.id, spaceId))
            .limit(1);
        if (space)
            await this.plans.assertCanCreateProjects(space.workspaceId);
        const result = await this.db
            .insert(db_1.projects)
            .values({
            spaceId,
            name: data.name,
            description: data.description,
            color: data.color || '#354fb0',
            icon: data.icon,
            folderId: data.folderId ?? null,
            createdById: actorId ?? null,
        })
            .returning();
        const project = result[0];
        // Seed the creator as an admin member (mirrors the 0035 backfill).
        if (actorId && project) {
            await this.db
                .insert(db_1.projectMembers)
                .values({ projectId: project.id, userId: actorId, role: 'admin', addedById: actorId })
                .onConflictDoNothing();
        }
        if (project)
            void this.fireProjectEvent('project.created', project, actorId);
        return project;
    }
    /** List only the archived projects of a space (for the restore UI). */
    async getArchivedProjectsBySpace(spaceId) {
        return this.db
            .select()
            .from(db_1.projects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.projects.isArchived, true)));
    }
    async getProjectsBySpace(spaceId, actorId) {
        /*
         * §G15-10 — the space's hidden container is never listed.
         *
         * Fourteen surfaces in the web app render a space's projects, and every one
         * of them reads this endpoint. Excluding the container HERE hides it from
         * all fourteen at once — the tree, the Move dialog, the palette's Location
         * filter, every project picker — which is the difference between one
         * decision and fourteen chances to forget.
         */
        const base = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.projects.isArchived, false), (0, drizzle_orm_1.eq)(db_1.projects.isDefaultContainer, false));
        if (!actorId || (await this.canSeeAllProjects(spaceId, actorId))) {
            return this.db.select().from(db_1.projects).where(base);
        }
        // Otherwise: non-private projects (public/inherit) plus the private ones the
        // caller is a member of.
        return this.db
            .select()
            .from(db_1.projects)
            .where((0, drizzle_orm_1.and)(base, (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql) `${db_1.projects.visibility} is distinct from 'private'`, (0, drizzle_orm_1.inArray)(db_1.projects.id, this.db.select({ id: db_1.projectMembers.projectId }).from(db_1.projectMembers).where((0, drizzle_orm_1.eq)(db_1.projectMembers.userId, actorId))))));
    }
    /** Managers and admins of the owning space see every project in it. */
    async canSeeAllProjects(spaceId, actorId) {
        const [sp] = await this.db.select({ workspaceId: db_1.spaces.workspaceId }).from(db_1.spaces).where((0, drizzle_orm_1.eq)(db_1.spaces.id, spaceId)).limit(1);
        if (sp && (await (0, container_access_guard_helper_1.isWorkspaceManager)(this.db, sp.workspaceId, actorId)))
            return true;
        const [sm] = await this.db
            .select({ role: db_1.spaceMembers.role })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actorId)))
            .limit(1);
        return sm?.role === 'admin';
    }
    async getProject(projectId) {
        const [project] = await this.db
            .select()
            .from(db_1.projects)
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId));
        return project ?? null;
    }
    async updateProject(projectId, data, actorId) {
        if (actorId)
            await this.assertManageable(projectId, actorId);
        // Whitelist the updatable columns instead of spreading the raw body: the
        // controller body is untyped at runtime, so a stray field like `position: true`
        // would otherwise reach the integer column (500) and any real column could be
        // mass-assigned. Only copy a field when it was actually provided.
        const set = { updatedAt: new Date() };
        for (const key of ['name', 'description', 'color', 'icon', 'folderId', 'defaultBillable', 'clientId']) {
            if (data[key] !== undefined)
                set[key] = data[key];
        }
        const result = await this.db
            .update(db_1.projects)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
            .returning();
        if (result[0])
            void this.fireProjectEvent('project.updated', result[0], actorId);
        return result[0];
    }
    async deleteProject(projectId, actorId, ipAddress) {
        const ctx = actorId ? await this.assertManageable(projectId, actorId, 'delete') : null;
        await this.db
            .update(db_1.projects)
            .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId));
        if (actorId && ctx) {
            // §13.3 — audit the container deletion (project archival).
            await this.security.logAuditEvent({
                workspaceId: ctx.workspaceId,
                actorId,
                action: 'project.deleted',
                resourceType: 'project',
                resourceId: projectId,
                description: `Archived project "${ctx.name}"`,
                ipAddress,
            });
        }
    }
    /** Restore an archived project (Plan §2.4 / §13.4). */
    async restoreProject(projectId, actorId) {
        if (actorId)
            await this.assertManageable(projectId, actorId);
        const [row] = await this.db
            .update(db_1.projects)
            .set({ isArchived: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Project not found');
        return row;
    }
    /**
     * Move a project to another space and/or folder. Its lists and tasks follow
     * automatically because they hang off the project.
     *
     * `folderId: null` moves the project out of its folder to sit directly under
     * the space (the client's "move back"). A folder target must belong to the
     * destination space, and the destination must be in the same workspace.
     */
    async moveProject(projectId, target, actorId, ipAddress) {
        const [src] = await this.db
            .select({ name: db_1.projects.name, spaceId: db_1.projects.spaceId, workspaceId: db_1.spaces.workspaceId })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
            .limit(1);
        if (!src)
            throw new common_1.NotFoundException('Project not found');
        if (actorId)
            await this.assertManageable(projectId, actorId);
        const destSpaceId = target.spaceId ?? src.spaceId;
        if (destSpaceId !== src.spaceId) {
            const [dest] = await this.db
                .select({ workspaceId: db_1.spaces.workspaceId, isArchived: db_1.spaces.isArchived })
                .from(db_1.spaces)
                .where((0, drizzle_orm_1.eq)(db_1.spaces.id, destSpaceId))
                .limit(1);
            if (!dest)
                throw new common_1.NotFoundException('Target space not found');
            if (dest.workspaceId !== src.workspaceId) {
                throw new common_1.BadRequestException('A project can only be moved within its own workspace');
            }
            if (dest.isArchived)
                throw new common_1.BadRequestException('Cannot move into a deleted space');
        }
        // A folder target must actually live in the destination space, otherwise the
        // project would be grouped under a folder from a different space.
        if (target.folderId) {
            const [folder] = await this.db
                .select({ spaceId: db_1.folders.spaceId, isArchived: db_1.folders.isArchived })
                .from(db_1.folders)
                .where((0, drizzle_orm_1.eq)(db_1.folders.id, target.folderId))
                .limit(1);
            if (!folder)
                throw new common_1.NotFoundException('Target folder not found');
            if (folder.isArchived)
                throw new common_1.BadRequestException('Cannot move into a deleted folder');
            if (folder.spaceId !== destSpaceId) {
                throw new common_1.BadRequestException('That folder does not belong to the destination space');
            }
        }
        // Resolve the destination folder explicitly so it can be both persisted and
        // audited without reading back through an untyped record.
        let destFolderId;
        if (target.folderId !== undefined)
            destFolderId = target.folderId;
        // Moving to a different space must clear a stale folder reference.
        else if (destSpaceId !== src.spaceId)
            destFolderId = null;
        const set = { spaceId: destSpaceId, updatedAt: new Date() };
        if (destFolderId !== undefined)
            set.folderId = destFolderId;
        const [row] = await this.db.update(db_1.projects).set(set).where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId)).returning();
        if (actorId) {
            await this.security.logAuditEvent({
                workspaceId: src.workspaceId,
                actorId,
                action: 'project.moved',
                resourceType: 'project',
                resourceId: projectId,
                description: `Moved project "${src.name}"`,
                ipAddress,
                metadata: { fromSpaceId: src.spaceId, toSpaceId: destSpaceId, toFolderId: destFolderId ?? null },
            });
        }
        return row;
    }
    async assertManageable(projectId, actorId, action = 'manage') {
        const [row] = await this.db
            .select({
            createdById: db_1.projects.createdById,
            workspaceId: db_1.spaces.workspaceId,
            name: db_1.projects.name,
            spaceId: db_1.projects.spaceId,
        })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Project not found');
        await (0, container_access_1.assertCanManageContainer)(this.db, {
            workspaceId: row.workspaceId,
            createdById: row.createdById,
            actorId,
            kind: 'project',
            action,
            // Managers may delete a project only within a space they belong to.
            spaceId: row.spaceId,
        });
        return row;
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, webhooks_service_1.WebhooksService,
        slack_service_1.SlackService,
        plans_service_1.PlansService,
        security_service_1.SecurityService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map