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
var DashboardsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
let DashboardsService = DashboardsService_1 = class DashboardsService {
    constructor(db) {
        this.db = db;
    }
    // --- Dashboard Presets ---------------------------------------------------
    /**
     * A member sees their own presets plus the admin-set workspace-default preset
     * (which another user may own), so the UI can show and manage it. §5.7
     *
     * A5.11 — plus anything shared with them via `object_shares`, and every row
     * carries the owner and its share count so the hub can render an index with
     * Owner / Sharing columns instead of a bare name dropdown.
     */
    async listPresets(userId, workspaceId) {
        const sharedIds = await this.presetIdsSharedWith(workspaceId, userId);
        const rows = await this.db
            .select({
            id: db_1.dashboardPresets.id,
            userId: db_1.dashboardPresets.userId,
            workspaceId: db_1.dashboardPresets.workspaceId,
            name: db_1.dashboardPresets.name,
            layout: db_1.dashboardPresets.layout,
            isDefault: db_1.dashboardPresets.isDefault,
            isWorkspaceDefault: db_1.dashboardPresets.isWorkspaceDefault,
            createdAt: db_1.dashboardPresets.createdAt,
            updatedAt: db_1.dashboardPresets.updatedAt,
            ownerName: db_1.users.displayName,
            ownerEmail: db_1.users.email,
            shareCount: (0, drizzle_orm_1.sql) `(
          select count(*)::int from object_shares os
          where os.object_type = 'dashboard' and os.object_id = dashboard_presets.id
        )`,
        })
            .from(db_1.dashboardPresets)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.dashboardPresets.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.userId, userId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.isWorkspaceDefault, true), sharedIds.length > 0 ? (0, drizzle_orm_1.inArray)(db_1.dashboardPresets.id, sharedIds) : undefined)));
        return rows.map((row) => ({
            ...row,
            isOwner: row.userId === userId,
            isSharedWithMe: row.userId !== userId && sharedIds.includes(row.id),
        }));
    }
    /** Preset ids in this workspace explicitly granted to `userId` (A5.11). */
    async presetIdsSharedWith(workspaceId, userId) {
        const rows = await this.db
            .select({ objectId: db_1.objectShares.objectId })
            .from(db_1.objectShares)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.objectShares.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.objectShares.objectType, 'dashboard'), (0, drizzle_orm_1.eq)(db_1.objectShares.userId, userId)));
        return rows.map((r) => r.objectId);
    }
    /**
     * Resolve the dashboard preset a user should land on. Their own default wins;
     * otherwise fall back to the admin-set workspace-default preset (§5.7).
     * Returns null when neither exists.
     */
    async getDefaultPreset(userId, workspaceId) {
        const [personal] = await this.db
            .select()
            .from(db_1.dashboardPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.userId, userId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.isDefault, true)))
            .limit(1);
        if (personal)
            return personal;
        const [workspaceDefault] = await this.db
            .select()
            .from(db_1.dashboardPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.isWorkspaceDefault, true)))
            .limit(1);
        return workspaceDefault ?? null;
    }
    async createPreset(userId, dto) {
        if (dto.isDefault) {
            await this.clearDefaultPreset(userId, dto.workspaceId);
        }
        const [preset] = await this.db
            .insert(db_1.dashboardPresets)
            .values({
            userId,
            workspaceId: dto.workspaceId,
            name: dto.name,
            layout: dto.layout,
            isDefault: dto.isDefault ?? false,
        })
            .returning();
        return preset;
    }
    async updatePreset(userId, id, dto) {
        const [existing] = await this.db
            .select()
            .from(db_1.dashboardPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.id, id), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.userId, userId)));
        if (!existing)
            throw new common_1.NotFoundException('Preset not found');
        if (dto.isDefault && !existing.isDefault) {
            await this.clearDefaultPreset(userId, existing.workspaceId);
        }
        const [updated] = await this.db
            .update(db_1.dashboardPresets)
            .set({
            ...dto,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.dashboardPresets.id, id))
            .returning();
        return updated;
    }
    async deletePreset(userId, id) {
        const [existing] = await this.db
            .select()
            .from(db_1.dashboardPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.id, id), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.userId, userId)));
        if (!existing)
            throw new common_1.NotFoundException('Preset not found');
        await this.db.delete(db_1.dashboardPresets).where((0, drizzle_orm_1.eq)(db_1.dashboardPresets.id, id));
        return { ok: true };
    }
    async clearDefaultPreset(userId, workspaceId) {
        await this.db
            .update(db_1.dashboardPresets)
            .set({ isDefault: false })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.userId, userId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId)));
    }
    // --- Workspace-default dashboard (admin) — §5.7 --------------------------
    /**
     * Mark `presetId` as the workspace-wide default and clear the flag on every
     * other preset, keeping at most one workspace-default per workspace. Only a
     * workspace_admin (or super_admin) may do this.
     */
    async setWorkspaceDefault(workspaceId, presetId, actor) {
        await this.assertWorkspaceAdmin(workspaceId, actor);
        const [preset] = await this.db
            .select()
            .from(db_1.dashboardPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.id, presetId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId)))
            .limit(1);
        if (!preset)
            throw new common_1.NotFoundException('Preset not found');
        // Clear the flag on whichever other preset currently holds it, so the
        // "at most one workspace-default per workspace" invariant is preserved.
        await this.db
            .update(db_1.dashboardPresets)
            .set({ isWorkspaceDefault: false })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.isWorkspaceDefault, true), (0, drizzle_orm_1.ne)(db_1.dashboardPresets.id, presetId)));
        const [updated] = await this.db
            .update(db_1.dashboardPresets)
            .set({ isWorkspaceDefault: true, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.dashboardPresets.id, presetId))
            .returning();
        return updated;
    }
    /** Remove the workspace-default flag from every preset in the workspace. §5.7 */
    async clearWorkspaceDefault(workspaceId) {
        await this.db
            .update(db_1.dashboardPresets)
            .set({ isWorkspaceDefault: false })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.dashboardPresets.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.dashboardPresets.isWorkspaceDefault, true)));
        return { ok: true };
    }
    /**
     * Authorize a workspace-default mutation. A global super_admin bypasses the
     * per-workspace lookup (matching the guards); otherwise the actor must be a
     * workspace_admin (or workspace-level super_admin) member. §5.7
     */
    async assertWorkspaceAdmin(workspaceId, actor) {
        if (actor.role === 'super_admin')
            return;
        const [member] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
            .limit(1);
        if (!member || !['workspace_admin', 'super_admin'].includes(member.role)) {
            throw new common_1.ForbiddenException('Only workspace admins can manage the workspace-default dashboard');
        }
    }
    // --- User Dock Config ----------------------------------------------------
    async getDockConfig(userId, workspaceId) {
        const [config] = await this.db
            .select()
            .from(db_1.userDockConfigs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userDockConfigs.userId, userId), (0, drizzle_orm_1.eq)(db_1.userDockConfigs.workspaceId, workspaceId)));
        return config ?? null;
    }
    static navList(value, limit) {
        if (!Array.isArray(value))
            return [];
        return value
            .filter((entry) => !!entry &&
            typeof entry === 'object' &&
            typeof entry.label === 'string' &&
            typeof entry.path === 'string')
            // Only the fields this feature stores. A row is user-supplied jsonb, and
            // echoing back whatever arrived is how a sidebar starts carrying data
            // nothing put there on purpose.
            .map((entry) => {
            const kind = entry.kind;
            return {
                label: String(entry.label).slice(0, 80),
                path: String(entry.path).slice(0, 300),
                ...(typeof kind === 'string' ? { kind: kind.slice(0, 40) } : {}),
            };
        })
            .slice(0, limit);
    }
    async updateDockConfig(userId, workspaceId, patch) {
        const existing = await this.getDockConfig(userId, workspaceId);
        // Whitelist the jsonb columns; never spread the raw body onto the row.
        const set = { updatedAt: new Date() };
        if (patch.pinnedLinks !== undefined)
            set.pinnedLinks = Array.isArray(patch.pinnedLinks) ? patch.pinnedLinks : [];
        if (patch.appearance !== undefined)
            set.appearance = patch.appearance;
        /*
         * Three states, and they are all different answers:
         *
         *   undefined → not part of this patch, leave the column alone
         *   null      → "clear it", back to never-arranged, so the defaults return
         *   an array  → that exact list, even when empty ("I want none")
         *
         * `navList(null)` returns `[]`, so folding null in with the array case made
         * clearing IMPOSSIBLE: it stored a deliberate empty list instead. That is a
         * product bug — nothing could reset the sidebar to its defaults — and it
         * showed up first as a cross-suite failure, because a teardown that passed
         * null left the next suite with an empty sidebar and Docs and Dashboards
         * missing from the nav.
         */
        if (patch.navFavorites !== undefined) {
            set.navFavorites =
                patch.navFavorites === null
                    ? null
                    : DashboardsService_1.navList(patch.navFavorites, DashboardsService_1.NAV_LIMIT.favorites);
        }
        if (patch.navRecents !== undefined) {
            set.navRecents =
                patch.navRecents === null
                    ? null
                    : DashboardsService_1.navList(patch.navRecents, DashboardsService_1.NAV_LIMIT.recents);
        }
        if (existing) {
            const [updated] = await this.db
                .update(db_1.userDockConfigs)
                .set(set)
                .where((0, drizzle_orm_1.eq)(db_1.userDockConfigs.id, existing.id))
                .returning();
            return updated;
        }
        else {
            const [created] = await this.db
                .insert(db_1.userDockConfigs)
                .values({
                userId,
                workspaceId,
                pinnedLinks: patch.pinnedLinks ?? [],
                appearance: patch.appearance ?? { size: 'md', opacity: 0.8, theme: 'system' },
                // Left null when absent: "never arranged it" earns the defaults,
                // "arranged it to be empty" does not.
                navFavorites: patch.navFavorites === undefined
                    ? null
                    : DashboardsService_1.navList(patch.navFavorites, DashboardsService_1.NAV_LIMIT.favorites),
                navRecents: patch.navRecents === undefined
                    ? null
                    : DashboardsService_1.navList(patch.navRecents, DashboardsService_1.NAV_LIMIT.recents),
            })
                .returning();
            return created;
        }
    }
};
exports.DashboardsService = DashboardsService;
/**
 * G04-7 / G07-6 — the nav lists are capped here, not only in the client.
 *
 * They arrive as jsonb straight from a browser, so a caller could otherwise
 * store an unbounded array and make every later read of this row expensive
 * for everybody who shares the workspace.
 */
DashboardsService.NAV_LIMIT = { favorites: 12, recents: 8 };
exports.DashboardsService = DashboardsService = DashboardsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], DashboardsService);
//# sourceMappingURL=dashboards.service.js.map