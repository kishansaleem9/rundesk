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
var WorkloadAlertService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkloadAlertService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const ai_service_1 = require("./ai.service");
const notifications_service_1 = require("../notifications/notifications.service");
/**
 * §7.12 — proactive workload alerts. A daily guarded check that, per workspace
 * with open work, flags anyone significantly overloaded relative to the team and
 * notifies that workspace's managers/admins with a `workload_alert` notification
 * deep-linking to the insights page. Deduped so the same overloaded person can't
 * spam managers day after day (a prior alert within the dedupe window suppresses
 * a re-send). All computation reuses AiService's real per-assignee load query and
 * the pure `findOverloadedAssignees` selector, so it is testable without a model.
 */
let WorkloadAlertService = WorkloadAlertService_1 = class WorkloadAlertService {
    constructor(ai, notifications) {
        this.ai = ai;
        this.notifications = notifications;
        this.logger = new common_1.Logger(WorkloadAlertService_1.name);
    }
    async runDaily() {
        return this.dispatch(new Date());
    }
    /**
     * Scan every workspace with open work, alert managers about overloaded
     * teammates, and skip anyone alerted within the dedupe window. Returns counts
     * so tests/ops can assert selection. Best-effort per workspace.
     */
    async dispatch(now = new Date()) {
        const workspaceIds = await this.ai.workspacesWithOpenWork();
        let alerts = 0;
        for (const workspaceId of workspaceIds) {
            try {
                alerts += await this.checkWorkspace(workspaceId, now);
            }
            catch (err) {
                this.logger.error(`Workload alert check failed for ${workspaceId}: ${err.message}`);
            }
        }
        if (alerts > 0)
            this.logger.log(`Sent ${alerts} workload alert(s) across ${workspaceIds.length} workspace(s)`);
        return { workspaces: workspaceIds.length, alerts };
    }
    /** Alert managers about newly-overloaded teammates in one workspace. Returns # alerted people. */
    async checkWorkspace(workspaceId, now = new Date()) {
        const loads = await this.ai.collectWorkloadLoads(workspaceId);
        const overloaded = (0, ai_service_1.findOverloadedAssignees)(loads.map((l) => ({ userId: l.userId, name: l.name, open: l.open })));
        if (overloaded.length === 0)
            return 0;
        // Dedupe: don't re-alert about the same person within ~20h (daily cron).
        const cutoff = new Date(now.getTime() - 20 * 3_600_000);
        const alreadyAlerted = await this.ai.recentlyWorkloadAlerted(workspaceId, cutoff);
        const fresh = overloaded.filter((o) => !alreadyAlerted.has(o.userId));
        if (fresh.length === 0)
            return 0;
        const managers = await this.ai.workspaceManagers(workspaceId);
        if (managers.length === 0)
            return 0;
        let count = 0;
        for (const person of fresh) {
            for (const mgr of managers) {
                // Don't notify the overloaded person about themselves.
                if (mgr.userId === person.userId)
                    continue;
                await this.notifications.create({
                    userId: mgr.userId,
                    workspaceId,
                    type: 'workload_alert',
                    title: `${person.name} is overloaded`,
                    body: `${person.name} has ${person.open} open tasks (team average ${person.average}). Consider rebalancing their workload.`,
                    target: { entityType: 'workload', entityId: person.userId, url: `/app/${workspaceId}/insights` },
                });
            }
            count += 1;
        }
        return count;
    }
};
exports.WorkloadAlertService = WorkloadAlertService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_9AM, { name: 'workload-alert-daily' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WorkloadAlertService.prototype, "runDaily", null);
exports.WorkloadAlertService = WorkloadAlertService = WorkloadAlertService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ai_service_1.AiService,
        notifications_service_1.NotificationsService])
], WorkloadAlertService);
//# sourceMappingURL=workload-alert.service.js.map