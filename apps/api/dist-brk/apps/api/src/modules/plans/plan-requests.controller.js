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
exports.PlanRequestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const drizzle_orm_1 = require("drizzle-orm");
const common_2 = require("@nestjs/common");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const notifications_service_1 = require("../notifications/notifications.service");
const plans_service_1 = require("./plans.service");
const plans_constants_1 = require("./plans.constants");
/**
 * §V2-13, frame `09:26` — the button under the paywall.
 *
 * The frame's call to action is **"Contact your admin"**, and it is the whole
 * reason the modal is worth building: a person who cannot buy anything is being
 * shown a price, so the only useful thing the dialog can do is put the ask in
 * front of somebody who can.
 *
 * A PLAN feature is not a feature FLAG, so `POST /feature-flags/request/:key`
 * could not serve this — it validates against the flag registry and 400s on
 * anything else. Rather than invent a flag that mirrors a plan tier (the
 * duplicated-list defect, in its most expensive form: two switches for one
 * capability that drift), this is the same ask against the plan model, and it
 * answers in the SAME `{ status, notified }` shape the flag route does so the
 * dialog's outcome strings and its "can I press it again" rule are shared.
 *
 * `already_asked` is deliberately NOT a state here. The flag route has a
 * `feature_flag_requests` table to read a recent ask out of; there is no
 * equivalent for plans, and inventing a throttle that no row backs would be a
 * rule that silently never fires.
 */
let PlanRequestsController = class PlanRequestsController {
    constructor(db, plans, notifications) {
        this.db = db;
        this.plans = plans;
        this.notifications = notifications;
    }
    async request(workspaceId, body, user) {
        const feature = body?.feature;
        if (!feature || !plans_constants_1.PLAN_FEATURES.includes(feature)) {
            throw new common_1.BadRequestException(`Unknown plan feature "${feature ?? ''}"`);
        }
        // Asking for something the workspace already has would send an admin
        // chasing a purchase they have already made.
        const plan = await this.plans.getWorkspacePlan(workspaceId);
        if (plan.features[feature] === true) {
            return { status: 'already_enabled', notified: 0 };
        }
        const admins = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.role, ['workspace_admin', 'super_admin'])));
        const recipients = admins.map((a) => a.userId).filter((id) => id !== user?.id);
        if (recipients.length === 0)
            return { status: 'no_admins', notified: 0 };
        const who = user?.name?.trim() || user?.email || 'Someone';
        let notified = 0;
        for (const userId of recipients) {
            // DELIVERY, not the row — see the same note in feature-flags.service.ts.
            // An admin who reads notifications by email only has `create()` return
            // null, and counting rows would tell the asker nobody heard them.
            const outcome = await this.notifications.createWithOutcome({
                userId,
                workspaceId,
                actorId: user?.id,
                type: 'access_requested',
                title: `${who} asked to unlock ${feature}`,
                body: `${who} hit the paywall for "${feature}". The ${plan.label} plan does not include it — ` +
                    'upgrading the workspace turns it on.',
                target: { entityType: 'plan_feature', entityId: feature, url: `/app/${workspaceId}/settings/plan` },
            });
            if (outcome?.delivered)
                notified++;
        }
        return { status: 'sent', notified };
    }
};
exports.PlanRequestsController = PlanRequestsController;
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/plan/request'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Ask this workspace’s admins to unlock a plan feature' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], PlanRequestsController.prototype, "request", null);
exports.PlanRequestsController = PlanRequestsController = __decorate([
    (0, swagger_1.ApiTags)('plans'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    __param(0, (0, common_2.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, plans_service_1.PlansService,
        notifications_service_1.NotificationsService])
], PlanRequestsController);
//# sourceMappingURL=plan-requests.controller.js.map