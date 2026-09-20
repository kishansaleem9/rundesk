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
exports.PlansService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const plans_constants_1 = require("./plans.constants");
/**
 * PlansService (Plan §14.1) — reads a workspace's commercial plan and enforces
 * its limits/features. Depends only on the DB, so every consumer (workspaces,
 * projects, invitations, ai) can import PlansModule without a cycle.
 *
 * Every assertion is a NO-OP for an unlimited/enabled plan, so an enterprise
 * workspace (the default for all existing workspaces) is never restricted.
 */
let PlansService = class PlansService {
    constructor(db) {
        this.db = db;
    }
    /** Resolve the effective plan config for a workspace (throws 404 if missing). */
    async getWorkspacePlan(workspaceId) {
        const [ws] = await this.db
            .select({ plan: db_1.workspaces.plan, planLimits: db_1.workspaces.planLimits })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .limit(1);
        if (!ws)
            throw new common_1.NotFoundException('Workspace not found');
        const override = (ws.planLimits ?? null);
        const resolved = (0, plans_constants_1.resolvePlanConfig)(ws.plan, override);
        return { ...resolved, raw: ws.plan, override };
    }
    async hasFeature(workspaceId, feature) {
        const plan = await this.getWorkspacePlan(workspaceId);
        return plan.features[feature] === true;
    }
    /** Throw 403 if the workspace's plan does not include `feature`. No-op for enterprise. */
    async assertFeature(workspaceId, feature) {
        const plan = await this.getWorkspacePlan(workspaceId);
        if (plan.features[feature] !== true) {
            throw new common_1.ForbiddenException(`Your ${plan.label} plan does not include this capability (${feature}). Upgrade your plan to enable it.`);
        }
    }
    async countMembers(workspaceId) {
        const [row] = await this.db
            .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
        return row?.c ?? 0;
    }
    /** Non-archived projects across every space in the workspace. */
    async countProjects(workspaceId) {
        const [row] = await this.db
            .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.projects.isArchived, false)));
        return row?.c ?? 0;
    }
    /**
     * Throw 403 if adding `adding` member(s) would exceed the plan's member cap.
     * Returns immediately (no count query) when the plan is unlimited — so an
     * enterprise workspace never even runs the check.
     */
    async assertCanAddMembers(workspaceId, adding = 1) {
        const plan = await this.getWorkspacePlan(workspaceId);
        const max = plan.limits.maxMembers;
        if (max == null)
            return; // unlimited (enterprise)
        const current = await this.countMembers(workspaceId);
        if (current + adding > max) {
            throw new common_1.ForbiddenException(`Your ${plan.label} plan allows up to ${max} member${max === 1 ? '' : 's'} (currently ${current}). Upgrade your plan to add more.`);
        }
    }
    /** Throw 403 if creating `adding` project(s) would exceed the plan's project cap. No-op for enterprise. */
    async assertCanCreateProjects(workspaceId, adding = 1) {
        const plan = await this.getWorkspacePlan(workspaceId);
        const max = plan.limits.maxProjects;
        if (max == null)
            return; // unlimited (enterprise)
        const current = await this.countProjects(workspaceId);
        if (current + adding > max) {
            throw new common_1.ForbiddenException(`Your ${plan.label} plan allows up to ${max} project${max === 1 ? '' : 's'} (currently ${current}). Upgrade your plan to add more.`);
        }
    }
    /** Plan + limits + features + current usage for the plan card / GET endpoint. */
    async getUsage(workspaceId) {
        const plan = await this.getWorkspacePlan(workspaceId);
        const [members, projectCount] = await Promise.all([
            this.countMembers(workspaceId),
            this.countProjects(workspaceId),
        ]);
        return {
            plan: plan.id,
            rawPlan: plan.raw,
            label: plan.label,
            description: plan.description,
            limits: plan.limits,
            features: plan.features,
            usage: { members, projects: projectCount },
            catalog: (0, plans_constants_1.planCatalog)(),
        };
    }
    /**
     * Set a workspace's plan (super-admin action — the controller enforces the
     * super_admin gate). Validates the plan id and, optionally, a numeric-limit
     * override. Returns the fresh usage snapshot.
     */
    async setWorkspacePlan(workspaceId, planId, override) {
        if (!(0, plans_constants_1.isPlanId)(planId)) {
            throw new common_1.BadRequestException(`Unknown plan '${planId}'. Must be one of: free, pro, business, enterprise`);
        }
        const set = { plan: planId, updatedAt: new Date() };
        // Only touch plan_limits when the caller explicitly passes an override
        // (undefined = leave as-is; null = clear back to tier defaults).
        if (override !== undefined)
            set.planLimits = override;
        const [row] = await this.db
            .update(db_1.workspaces)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .returning({ id: db_1.workspaces.id });
        if (!row)
            throw new common_1.NotFoundException('Workspace not found');
        return this.getUsage(workspaceId);
    }
};
exports.PlansService = PlansService;
exports.PlansService = PlansService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], PlansService);
//# sourceMappingURL=plans.service.js.map