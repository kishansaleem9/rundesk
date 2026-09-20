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
var SharesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharesService = exports.SHARE_LEVELS = exports.SHARE_TYPES = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
const email_service_1 = require("../email/email.service");
const config_1 = require("@nestjs/config");
const notifications_service_1 = require("../notifications/notifications.service");
/** Everything that can be shared. */
exports.SHARE_TYPES = ['space', 'folder', 'project', 'list', 'task', 'doc', 'channel', 'dashboard', 'view'];
/**
 * Access levels, weakest → strongest. Mirrors ClickUp:
 *   view < comment < edit < admin ("full edit")
 * `edit` may change the item but NOT delete it; `admin` may delete.
 */
exports.SHARE_LEVELS = ['view', 'comment', 'edit', 'admin'];
const RANK = { view: 0, comment: 1, edit: 2, admin: 3 };
/** Human wording used in the notification email. */
const LEVEL_LABEL = {
    view: 'view only', comment: 'comment', edit: 'edit', admin: 'full edit',
};
let SharesService = SharesService_1 = class SharesService {
    constructor(db, security, email, config, notifications) {
        this.db = db;
        this.security = security;
        this.email = email;
        this.config = config;
        this.notifications = notifications;
        this.logger = new common_1.Logger(SharesService_1.name);
    }
    assertType(t) {
        if (!exports.SHARE_TYPES.includes(t))
            throw new common_1.BadRequestException(`Unknown object type "${t}"`);
        return t;
    }
    assertLevel(l) {
        if (!exports.SHARE_LEVELS.includes(l))
            throw new common_1.BadRequestException(`Unknown permission level "${l}"`);
        return l;
    }
    // ─── locating an object + its ancestor chain ────────────────────────────────
    /**
     * Resolve an object to its workspace, creator and ancestor chain, ordered
     * MOST specific first. Permission resolution walks this list and stops at the
     * first explicit grant — task beats list beats project beats folder beats space.
     */
    async locate(type, id) {
        if (type === 'space') {
            const [r] = await this.db.select({ ws: db_1.spaces.workspaceId, by: db_1.spaces.createdById, name: db_1.spaces.name })
                .from(db_1.spaces).where((0, drizzle_orm_1.eq)(db_1.spaces.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('Space not found');
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain: [{ type: 'space', id }] };
        }
        if (type === 'folder') {
            const [r] = await this.db.select({ ws: db_1.spaces.workspaceId, by: db_1.folders.createdById, name: db_1.folders.name, spaceId: db_1.folders.spaceId })
                .from(db_1.folders).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.folders.spaceId)).where((0, drizzle_orm_1.eq)(db_1.folders.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('Folder not found');
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain: [{ type: 'folder', id }, { type: 'space', id: r.spaceId }] };
        }
        if (type === 'project') {
            const [r] = await this.db.select({ ws: db_1.spaces.workspaceId, by: db_1.projects.createdById, name: db_1.projects.name, spaceId: db_1.projects.spaceId, folderId: db_1.projects.folderId })
                .from(db_1.projects).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId)).where((0, drizzle_orm_1.eq)(db_1.projects.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('Project not found');
            const chain = [{ type: 'project', id }];
            if (r.folderId)
                chain.push({ type: 'folder', id: r.folderId });
            chain.push({ type: 'space', id: r.spaceId });
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain };
        }
        if (type === 'list') {
            const [r] = await this.db.select({ ws: db_1.spaces.workspaceId, by: db_1.lists.createdById, name: db_1.lists.name, projectId: db_1.lists.projectId, folderId: db_1.projects.folderId, spaceId: db_1.projects.spaceId })
                .from(db_1.lists).innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId)).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.lists.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('List not found');
            const chain = [{ type: 'list', id }, { type: 'project', id: r.projectId }];
            if (r.folderId)
                chain.push({ type: 'folder', id: r.folderId });
            chain.push({ type: 'space', id: r.spaceId });
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain };
        }
        if (type === 'task') {
            const [r] = await this.db.select({ ws: db_1.spaces.workspaceId, by: db_1.tasks.createdById, name: db_1.tasks.title, listId: db_1.tasks.listId, projectId: db_1.lists.projectId, folderId: db_1.projects.folderId, spaceId: db_1.projects.spaceId })
                .from(db_1.tasks).innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId)).innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId)).where((0, drizzle_orm_1.eq)(db_1.tasks.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('Task not found');
            const chain = [
                { type: 'task', id }, { type: 'list', id: r.listId }, { type: 'project', id: r.projectId },
            ];
            if (r.folderId)
                chain.push({ type: 'folder', id: r.folderId });
            chain.push({ type: 'space', id: r.spaceId });
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain };
        }
        if (type === 'view') {
            /*
             * §V2-07 "Sharing & Permissions" on a saved view. A view inherits from
             * its list the same way a task does — someone with access to the list
             * already has access to what the view is a lens onto — so the chain is
             * the list's chain with the view in front of it.
             */
            const [r] = await this.db.select({
                ws: db_1.spaces.workspaceId, by: db_1.taskViews.createdById, name: db_1.taskViews.name,
                listId: db_1.taskViews.listId, projectId: db_1.lists.projectId,
                folderId: db_1.projects.folderId, spaceId: db_1.projects.spaceId,
            })
                .from(db_1.taskViews).innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.taskViews.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.taskViews.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('View not found');
            const chain = [
                { type: 'view', id }, { type: 'list', id: r.listId }, { type: 'project', id: r.projectId },
            ];
            if (r.folderId)
                chain.push({ type: 'folder', id: r.folderId });
            chain.push({ type: 'space', id: r.spaceId });
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain };
        }
        if (type === 'dashboard') {
            // A5.11 — a preset's owner IS its creator (`dashboard_presets.userId`), so
            // sharing reuses this table rather than a second model. Presets are flat:
            // nothing to inherit from, hence a single-step chain.
            const [r] = await this.db.select({ ws: db_1.dashboardPresets.workspaceId, by: db_1.dashboardPresets.userId, name: db_1.dashboardPresets.name })
                .from(db_1.dashboardPresets).where((0, drizzle_orm_1.eq)(db_1.dashboardPresets.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('Dashboard not found');
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain: [{ type: 'dashboard', id }] };
        }
        if (type === 'channel') {
            const [r] = await this.db.select({
                ws: db_1.chatChannels.workspaceId, by: db_1.chatChannels.createdById,
                name: db_1.chatChannels.name, spaceId: db_1.chatChannels.spaceId, isDm: db_1.chatChannels.isDm,
            }).from(db_1.chatChannels).where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, id)).limit(1);
            if (!r)
                throw new common_1.NotFoundException('Channel not found');
            // A DM is between its participants — there is no one to share it with.
            if (r.isDm)
                throw new common_1.BadRequestException('Direct messages cannot be shared');
            const chain = [{ type: 'channel', id }];
            if (r.spaceId)
                chain.push({ type: 'space', id: r.spaceId });
            return { workspaceId: r.ws, createdById: r.by, name: r.name, chain };
        }
        const [r] = await this.db.select({ ws: db_1.docs.workspaceId, by: db_1.docs.createdById, name: db_1.docs.title, spaceId: db_1.docs.spaceId })
            .from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, id)).limit(1);
        if (!r)
            throw new common_1.NotFoundException('Doc not found');
        const chain = [{ type: 'doc', id }];
        if (r.spaceId)
            chain.push({ type: 'space', id: r.spaceId });
        return { workspaceId: r.ws, createdById: r.by, name: r.name, chain };
    }
    /**
     * The grant on EXACTLY this object, ignoring ancestors.
     *
     * `resolveLevel` deliberately inherits down the chain, which is right for
     * containers but wrong for a private chat channel: a space-level grant must
     * not quietly open every private channel inside that space. Callers guarding
     * private things ask for the direct grant instead.
     */
    async directLevel(type, id, userId) {
        const [row] = await this.db.select({ level: db_1.objectShares.level }).from(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.objectType, type), (0, drizzle_orm_1.eq)(db_1.objectShares.objectId, id), (0, drizzle_orm_1.eq)(db_1.objectShares.userId, userId))).limit(1);
        return row?.level ?? null;
    }
    // ─── who may share ─────────────────────────────────────────────────────────
    async workspaceRole(workspaceId, userId) {
        const [m] = await this.db.select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        return m?.role ?? null;
    }
    /**
     * Sharing rights are a function of (level, user type) — not level alone.
     * A member with edit+ on the object may share it; a GUEST may never share,
     * even with edit. Admins/managers and the object's creator may always share.
     */
    async canShare(type, id, actor) {
        const loc = await this.locate(type, id);
        if (actor.role === 'super_admin')
            return { allowed: true, loc };
        const wsRole = await this.workspaceRole(loc.workspaceId, actor.id);
        if (!wsRole)
            return { allowed: false, loc };
        if (wsRole === 'guest')
            return { allowed: false, loc };
        if (wsRole === 'workspace_admin' || wsRole === 'manager')
            return { allowed: true, loc };
        if (loc.createdById && loc.createdById === actor.id)
            return { allowed: true, loc };
        const level = await this.resolveLevel(type, id, actor.id);
        return { allowed: level != null && RANK[level] >= RANK.edit, loc };
    }
    async assertCanShare(type, id, actor) {
        const { allowed, loc } = await this.canShare(type, id, actor);
        if (!allowed)
            throw new common_1.ForbiddenException('You do not have permission to share this item');
        return loc;
    }
    // ─── resolution ────────────────────────────────────────────────────────────
    /**
     * The level a user has on an object, or null if nothing was granted anywhere
     * up the chain. Most specific wins: the first ancestor with an explicit grant
     * decides, so a task-level grant overrides a broader space-level one.
     */
    async resolveLevel(type, id, userId) {
        const { chain } = await this.locate(type, id);
        const rows = await this.db
            .select({ objectType: db_1.objectShares.objectType, objectId: db_1.objectShares.objectId, level: db_1.objectShares.level })
            .from(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.userId, userId), (0, drizzle_orm_1.inArray)(db_1.objectShares.objectId, chain.map((c) => c.id))));
        if (rows.length === 0)
            return null;
        for (const step of chain) {
            const hit = rows.find((r) => r.objectType === step.type && r.objectId === step.id);
            if (hit)
                return hit.level;
        }
        return null;
    }
    /** True when the level permits deleting the object itself (edit must not). */
    canDelete(level) {
        return level === 'admin';
    }
    /** The address to notify for a grant made against a known user. */
    async emailOf(userId) {
        const [u] = await this.db.select({ email: db_1.users.email }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, userId)).limit(1);
        return u?.email ?? null;
    }
    // ─── read / write grants ───────────────────────────────────────────────────
    async list(type, id, actor) {
        const loc = await this.locate(type, id);
        if (actor.role !== 'super_admin' && !(await this.workspaceRole(loc.workspaceId, actor.id))) {
            throw new common_1.ForbiddenException('Not a member of this workspace');
        }
        const rows = await this.db
            .select({
            id: db_1.objectShares.id, level: db_1.objectShares.level, invitedEmail: db_1.objectShares.invitedEmail,
            createdAt: db_1.objectShares.createdAt,
            uid: db_1.users.id, uname: db_1.users.displayName, uemail: db_1.users.email, uavatar: db_1.users.avatarUrl,
        })
            .from(db_1.objectShares)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.objectShares.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.objectType, type), (0, drizzle_orm_1.eq)(db_1.objectShares.objectId, id)));
        return rows.map((r) => ({
            id: r.id,
            level: r.level,
            // leftJoin makes the user columns nullable even when uid is present.
            user: r.uid ? { id: r.uid, name: r.uname ?? '', email: r.uemail ?? '', avatarUrl: r.uavatar } : null,
            invitedEmail: r.invitedEmail,
            createdAt: new Date(r.createdAt).toISOString(),
        }));
    }
    // ─── reverse lookup: everything shared with me ─────────────────────────────
    /**
     * Names + deep links for one batch of same-typed shared objects.
     *
     * Deliberately does NOT apply the per-item visibility filters
     * (`item-visibility.ts`): those hide private rows from everyone but the
     * creator and managers, and an explicit share grant is precisely the
     * exception they don't know about. Reaching this code already means the
     * caller holds a row in `object_shares` naming them.
     */
    async resolveSharedBatch(workspaceId, type, ids) {
        const out = new Map();
        if (ids.length === 0)
            return out;
        const base = `/app/${workspaceId}`;
        if (type === 'space') {
            const rows = await this.db.select({ id: db_1.spaces.id, name: db_1.spaces.name })
                .from(db_1.spaces).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.spaces.id, ids)));
            for (const r of rows)
                out.set(r.id, { name: r.name, url: `${base}/${r.id}`, context: null });
            return out;
        }
        if (type === 'folder') {
            // Folders have no route of their own — they render on their space page.
            const rows = await this.db
                .select({ id: db_1.folders.id, name: db_1.folders.name, spaceId: db_1.spaces.id, spaceName: db_1.spaces.name })
                .from(db_1.folders).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.folders.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.folders.id, ids)));
            for (const r of rows)
                out.set(r.id, { name: r.name, url: `${base}/${r.spaceId}`, context: r.spaceName });
            return out;
        }
        if (type === 'project') {
            const rows = await this.db
                .select({ id: db_1.projects.id, name: db_1.projects.name, spaceId: db_1.spaces.id, spaceName: db_1.spaces.name })
                .from(db_1.projects).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.projects.id, ids)));
            for (const r of rows)
                out.set(r.id, { name: r.name, url: `${base}/${r.spaceId}/${r.id}`, context: r.spaceName });
            return out;
        }
        if (type === 'list') {
            const rows = await this.db
                .select({ id: db_1.lists.id, name: db_1.lists.name, projectId: db_1.projects.id, projectName: db_1.projects.name, spaceId: db_1.spaces.id })
                .from(db_1.lists).innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId)).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.lists.id, ids)));
            for (const r of rows) {
                out.set(r.id, { name: r.name, url: `${base}/${r.spaceId}/${r.projectId}/${r.id}`, context: r.projectName });
            }
            return out;
        }
        if (type === 'task') {
            const rows = await this.db
                .select({ id: db_1.tasks.id, title: db_1.tasks.title, listId: db_1.lists.id, listName: db_1.lists.name, projectId: db_1.projects.id, spaceId: db_1.spaces.id })
                .from(db_1.tasks).innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId)).innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.tasks.id, ids)));
            for (const r of rows) {
                out.set(r.id, {
                    name: r.title,
                    url: `${base}/${r.spaceId}/${r.projectId}/${r.listId}?task=${r.id}`,
                    context: r.listName,
                });
            }
            return out;
        }
        if (type === 'view') {
            // A view has no route of its own; it is the list route with ?view=<id>,
            // which is exactly what "Copy link to view" puts on the clipboard.
            const rows = await this.db
                .select({
                id: db_1.taskViews.id, name: db_1.taskViews.name, listId: db_1.lists.id, listName: db_1.lists.name,
                projectId: db_1.projects.id, spaceId: db_1.spaces.id,
            })
                .from(db_1.taskViews).innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.taskViews.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId)).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.taskViews.id, ids)));
            for (const r of rows) {
                out.set(r.id, {
                    name: r.name,
                    url: `${base}/${r.spaceId}/${r.projectId}/${r.listId}?view=${r.id}`,
                    context: r.listName,
                });
            }
            return out;
        }
        if (type === 'channel') {
            const rows = await this.db.select({ id: db_1.chatChannels.id, name: db_1.chatChannels.name })
                .from(db_1.chatChannels).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.chatChannels.id, ids)));
            for (const r of rows)
                out.set(r.id, { name: `#${r.name}`, url: `${base}/chat?channel=${r.id}`, context: null });
            return out;
        }
        if (type === 'dashboard') {
            const rows = await this.db
                .select({ id: db_1.dashboardPresets.id, name: db_1.dashboardPresets.name, ownerName: db_1.users.displayName })
                .from(db_1.dashboardPresets)
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.dashboardPresets.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.dashboardPresets.id, ids)));
            for (const r of rows) {
                out.set(r.id, { name: r.name, url: `${base}/dashboard?preset=${r.id}`, context: r.ownerName });
            }
            return out;
        }
        const rows = await this.db.select({ id: db_1.docs.id, title: db_1.docs.title })
            .from(db_1.docs).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.docs.id, ids)));
        for (const r of rows)
            out.set(r.id, { name: r.title, url: `${base}/docs?doc=${r.id}`, context: null });
        return out;
    }
    /**
     * Everything in a workspace someone has shared *with* the caller — the
     * reverse of the object-keyed routes, and the only way to find a privately
     * shared item without being sent a link. Newest grant first.
     *
     * Grants whose object has since been deleted are skipped rather than
     * reported: `object_shares.object_id` is polymorphic, so no foreign key
     * cleans them up.
     */
    async listSharedWithMe(workspaceId, userId) {
        const rows = await this.db
            .select({
            id: db_1.objectShares.id, objectType: db_1.objectShares.objectType, objectId: db_1.objectShares.objectId,
            level: db_1.objectShares.level, createdAt: db_1.objectShares.createdAt, createdById: db_1.objectShares.createdById,
        })
            .from(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.objectShares.userId, userId)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.objectShares.createdAt));
        if (rows.length === 0)
            return [];
        const byType = new Map();
        for (const r of rows) {
            const ids = byType.get(r.objectType) ?? [];
            ids.push(r.objectId);
            byType.set(r.objectType, ids);
        }
        const meta = new Map(); // key: `${type}:${id}`
        for (const [type, ids] of byType) {
            const resolved = await this.resolveSharedBatch(workspaceId, type, ids);
            for (const [id, m] of resolved)
                meta.set(`${type}:${id}`, m);
        }
        const sharerIds = [...new Set(rows.map((r) => r.createdById).filter((id) => !!id))];
        const sharers = sharerIds.length
            ? await this.db.select({ id: db_1.users.id, name: db_1.users.displayName, avatarUrl: db_1.users.avatarUrl })
                .from(db_1.users).where((0, drizzle_orm_1.inArray)(db_1.users.id, sharerIds))
            : [];
        const sharerById = new Map(sharers.map((u) => [u.id, u]));
        const out = [];
        for (const r of rows) {
            const m = meta.get(`${r.objectType}:${r.objectId}`);
            if (!m)
                continue;
            const sharer = r.createdById ? sharerById.get(r.createdById) : undefined;
            out.push({
                id: r.id,
                objectType: r.objectType,
                objectId: r.objectId,
                level: r.level,
                name: m.name,
                url: m.url,
                context: m.context,
                sharedAt: new Date(r.createdAt).toISOString(),
                sharedBy: sharer ? { id: sharer.id, name: sharer.name ?? '', avatarUrl: sharer.avatarUrl } : null,
            });
        }
        return out;
    }
    /**
     * Grant access by user id OR by email. An email that matches an existing
     * workspace user is bound straight to that user; anything else is stored as a
     * pending invite so an OUTSIDER can be shared with before they sign up.
     */
    async share(type, id, actor, input, ip) {
        const loc = await this.assertCanShare(type, id, actor);
        const level = this.assertLevel(input.level ?? 'view');
        let userId = input.userId ?? null;
        let invitedEmail = null;
        if (!userId) {
            const email = (input.email ?? '').trim().toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new common_1.BadRequestException('A userId or a valid email is required');
            }
            const [existing] = await this.db.select({ id: db_1.users.id }).from(db_1.users)
                .where((0, drizzle_orm_1.sql) `lower(${db_1.users.email}) = ${email}`).limit(1);
            if (existing)
                userId = existing.id;
            else
                invitedEmail = email;
        }
        // Re-sharing with the same principal updates the level rather than erroring.
        if (userId) {
            const [dupe] = await this.db.select({ id: db_1.objectShares.id }).from(db_1.objectShares)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.objectType, type), (0, drizzle_orm_1.eq)(db_1.objectShares.objectId, id), (0, drizzle_orm_1.eq)(db_1.objectShares.userId, userId)))
                .limit(1);
            if (dupe) {
                await this.db.update(db_1.objectShares).set({ level, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.objectShares.id, dupe.id));
                return { ok: true, updated: true };
            }
        }
        else if (invitedEmail) {
            const [dupe] = await this.db.select({ id: db_1.objectShares.id }).from(db_1.objectShares)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.objectType, type), (0, drizzle_orm_1.eq)(db_1.objectShares.objectId, id), (0, drizzle_orm_1.sql) `lower(${db_1.objectShares.invitedEmail}) = ${invitedEmail}`))
                .limit(1);
            if (dupe) {
                await this.db.update(db_1.objectShares).set({ level, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.objectShares.id, dupe.id));
                return { ok: true, updated: true };
            }
        }
        const [row] = await this.db.insert(db_1.objectShares).values({
            workspaceId: loc.workspaceId, objectType: type, objectId: id,
            userId, invitedEmail, level, createdById: actor.id,
        }).returning({ id: db_1.objectShares.id });
        await this.security.logAuditEvent({
            workspaceId: loc.workspaceId, actorId: actor.id, action: 'share.granted',
            resourceType: type, resourceId: id,
            description: `Shared ${type} "${loc.name}" with ${invitedEmail ?? userId} (${level})`,
            ipAddress: ip, metadata: { level, invitedEmail, userId },
        });
        // §2.2 — "[shared with] mujhe na show ho" is a choice she makes in the
        // Primary customiser, and it can only be offered if the type exists. An
        // email already goes out below; this is the in-app half, which is what the
        // Inbox filters over. Only for an existing member — an invited address has
        // no account to notify yet.
        if (userId && userId !== actor.id) {
            await this.notifications
                .create({
                userId,
                workspaceId: loc.workspaceId,
                actorId: actor.id,
                type: 'shared_with_me',
                title: loc.name,
                target: { entityType: type, entityId: id },
            })
                .catch(() => undefined);
        }
        // Tell the person they were given access. Never let a mail failure undo a
        // grant that is already committed — the share stands either way.
        const notifyAddress = invitedEmail ?? (await this.emailOf(userId));
        if (notifyAddress) {
            try {
                const [inviter] = await this.db.select({ name: db_1.users.displayName }).from(db_1.users)
                    .where((0, drizzle_orm_1.eq)(db_1.users.id, actor.id)).limit(1);
                const base = (this.config.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
                await this.email.sendShareInviteEmail({
                    to: notifyAddress,
                    inviter: inviter?.name ?? 'A teammate',
                    objectType: type,
                    objectName: loc.name,
                    level: LEVEL_LABEL[level],
                    url: invitedEmail ? `${base}/register?email=${encodeURIComponent(invitedEmail)}` : base,
                    isOutsider: !!invitedEmail,
                });
            }
            catch (err) {
                this.logger.warn(`Share succeeded but the notification email failed: ${err.message}`);
            }
        }
        return { ok: true, id: row.id };
    }
    async updateLevel(type, id, shareId, actor, level, ip) {
        const loc = await this.assertCanShare(type, id, actor);
        const lvl = this.assertLevel(level);
        const [row] = await this.db.update(db_1.objectShares).set({ level: lvl, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.id, shareId), (0, drizzle_orm_1.eq)(db_1.objectShares.objectType, type), (0, drizzle_orm_1.eq)(db_1.objectShares.objectId, id)))
            .returning({ id: db_1.objectShares.id });
        if (!row)
            throw new common_1.NotFoundException('Share not found');
        await this.security.logAuditEvent({
            workspaceId: loc.workspaceId, actorId: actor.id, action: 'share.level_changed',
            resourceType: type, resourceId: id, description: `Changed a share on "${loc.name}" to ${lvl}`, ipAddress: ip,
        });
        return { ok: true };
    }
    async revoke(type, id, shareId, actor, ip) {
        const loc = await this.assertCanShare(type, id, actor);
        const [row] = await this.db.delete(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.id, shareId), (0, drizzle_orm_1.eq)(db_1.objectShares.objectType, type), (0, drizzle_orm_1.eq)(db_1.objectShares.objectId, id)))
            .returning({ id: db_1.objectShares.id });
        if (!row)
            throw new common_1.NotFoundException('Share not found');
        await this.security.logAuditEvent({
            workspaceId: loc.workspaceId, actorId: actor.id, action: 'share.revoked',
            resourceType: type, resourceId: id, description: `Removed a share from "${loc.name}"`, ipAddress: ip,
        });
        return { ok: true };
    }
    /**
     * Bind pending email invites to a user once they exist (call on signup /
     * accept), so an outsider who was shared with before signing up lands with
     * their access already in place.
     */
    async claimInvites(userId, email) {
        const claimed = await this.db.update(db_1.objectShares)
            .set({ userId, invitedEmail: null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.sql) `lower(${db_1.objectShares.invitedEmail}) = ${email.trim().toLowerCase()}`)
            .returning({ id: db_1.objectShares.id });
        return { claimed: claimed.length };
    }
    /**
     * §G10 [12:16–12:20] — "someone asked for access to something".
     *
     * The `access_requested` notification kind has existed since the enum was
     * written and was only ever emitted for FEATURE requests. Somebody who hit a
     * doc, list or space they could not see had no way to ask for it — the wall
     * was the end of the road.
     *
     * Modelled on the feature-flag request flow rather than reinvented, because
     * that one already learned two things the hard way, and both apply here.
     */
    async requestAccess(workspaceId, type, objectId, requester) {
        if (!exports.SHARE_TYPES.includes(type))
            throw new common_1.BadRequestException('unknown object type');
        /*
         * Who can actually grant it: whoever holds admin on the object itself, plus
         * the workspace's admins. Anyone below admin on the object cannot widen it,
         * so telling them would be noise they can do nothing about.
         */
        const objectAdmins = await this.db
            .select({ userId: db_1.objectShares.userId })
            .from(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.objectShares.objectType, type), (0, drizzle_orm_1.eq)(db_1.objectShares.objectId, objectId), (0, drizzle_orm_1.eq)(db_1.objectShares.level, 'admin')));
        const wsAdmins = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.role, ['workspace_admin', 'super_admin'])));
        const recipients = [
            ...new Set([...objectAdmins.map((a) => a.userId), ...wsAdmins.map((a) => a.userId)]),
        ].filter((id) => !!id && id !== requester.id);
        if (recipients.length === 0)
            return { status: 'no_owners', notified: 0 };
        /*
         * One ask per person per object per day, read from the ASKS rather than
         * from the notifications they produced. A notification row only exists for
         * a recipient with in-app switched on, so counting rows let an email-only
         * owner be re-mailed on every press — the exact bug the feature-flag flow
         * hit and documented.
         */
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recent] = await this.db
            .select({ id: db_1.contentAccessRequests.id })
            .from(db_1.contentAccessRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.contentAccessRequests.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.contentAccessRequests.requesterId, requester.id), (0, drizzle_orm_1.eq)(db_1.contentAccessRequests.objectType, type), (0, drizzle_orm_1.eq)(db_1.contentAccessRequests.objectId, objectId), (0, drizzle_orm_1.gte)(db_1.contentAccessRequests.createdAt, since)))
            .limit(1);
        if (recent)
            return { status: 'already_asked', notified: 0 };
        // Recorded BEFORE the fan-out, so a request that dies partway through is
        // still an ask that happened rather than one that can be repeated at will.
        await this.db
            .insert(db_1.contentAccessRequests)
            .values({ workspaceId, objectType: type, objectId, requesterId: requester.id })
            .catch(() => undefined);
        const meta = (await this.resolveSharedBatch(workspaceId, type, [objectId])).get(objectId);
        const what = meta?.name ?? `this ${type}`;
        const who = requester.name?.trim() || requester.email || 'Someone';
        let notified = 0;
        for (const userId of recipients) {
            const outcome = await this.notifications.createWithOutcome({
                userId,
                workspaceId,
                actorId: requester.id,
                type: 'access_requested',
                title: `${who} asked for access to ${what}`,
                body: `${who} tried to open ${what} and could not. You can give them access from its Share panel.`,
                target: { entityType: type, entityId: objectId, url: meta?.url ?? `/app/${workspaceId}` },
            });
            // Delivery, not the row — see the de-dup note above. Somebody who took
            // the email and not the bell was told.
            if (outcome?.delivered)
                notified += 1;
        }
        return { status: 'sent', notified };
    }
};
exports.SharesService = SharesService;
exports.SharesService = SharesService = SharesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService,
        email_service_1.EmailService,
        config_1.ConfigService,
        notifications_service_1.NotificationsService])
], SharesService);
//# sourceMappingURL=shares.service.js.map