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
exports.PublicStatusController = exports.SupportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const support_service_1 = require("./support.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
/**
 * Customer Support & Help Center (Plan §14.4). Ticket CRUD + the ticket-thread
 * conversation, plus super-admin management of the public status page
 * (components + incidents). Every route here requires authentication; access to
 * a specific ticket is enforced in the service (creator / workspace staff /
 * super_admin). The unauthenticated public status read lives in
 * PublicStatusController.
 */
let SupportController = class SupportController {
    constructor(support) {
        this.support = support;
    }
    // ── Tickets ─────────────────────────────────────────────────────────────────
    createTicket(user, body) {
        return this.support.createTicket(user, body);
    }
    listTickets(user, scope, status, priority, workspaceId) {
        return this.support.listTickets(user, { scope, status, priority, workspaceId });
    }
    getTicket(user, id) {
        return this.support.getTicket(user, id);
    }
    addMessage(user, id, body) {
        return this.support.addMessage(user, id, body);
    }
    updateTicket(user, id, body) {
        return this.support.updateTicket(user, id, body);
    }
    // ── Status page management (super_admin only, enforced in the service) ───────
    createComponent(user, body) {
        return this.support.createComponent(user, body);
    }
    updateComponent(user, id, body) {
        return this.support.updateComponent(user, id, body);
    }
    deleteComponent(user, id) {
        return this.support.deleteComponent(user, id);
    }
    createIncident(user, body) {
        return this.support.createIncident(user, body);
    }
    updateIncident(user, id, body) {
        return this.support.updateIncident(user, id, body);
    }
};
exports.SupportController = SupportController;
__decorate([
    (0, common_1.Post)('tickets'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a support ticket (auto-sets SLA due dates from priority)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "createTicket", null);
__decorate([
    (0, common_1.Get)('tickets'),
    (0, swagger_1.ApiOperation)({ summary: 'List tickets visible to the caller (scope=all for super-admin/support)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('scope')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('priority')),
    __param(4, (0, common_1.Query)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "listTickets", null);
__decorate([
    (0, common_1.Get)('tickets/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a ticket with its message thread' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "getTicket", null);
__decorate([
    (0, common_1.Post)('tickets/:id/messages'),
    (0, swagger_1.ApiOperation)({ summary: 'Reply to a ticket (a staff reply stamps first_response_at)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "addMessage", null);
__decorate([
    (0, common_1.Patch)('tickets/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a ticket status/priority/assignee (staff only; resolving stamps resolved_at)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "updateTicket", null);
__decorate([
    (0, common_1.Post)('status/components'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a status-page component (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "createComponent", null);
__decorate([
    (0, common_1.Patch)('status/components/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a status-page component (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "updateComponent", null);
__decorate([
    (0, common_1.Delete)('status/components/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a status-page component (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "deleteComponent", null);
__decorate([
    (0, common_1.Post)('status/incidents'),
    (0, swagger_1.ApiOperation)({ summary: 'Post a status-page incident (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "createIncident", null);
__decorate([
    (0, common_1.Patch)('status/incidents/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a status-page incident (super admin; resolving stamps resolved_at)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "updateIncident", null);
exports.SupportController = SupportController = __decorate([
    (0, swagger_1.ApiTags)('support'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('support'),
    __metadata("design:paramtypes", [support_service_1.SupportService])
], SupportController);
/**
 * Public status page (Plan §14.4). No auth — anyone can read the current
 * component health + recent incidents. Served at GET /api/v1/status.
 */
let PublicStatusController = class PublicStatusController {
    constructor(support) {
        this.support = support;
    }
    getStatus() {
        return this.support.getStatusPage();
    }
};
exports.PublicStatusController = PublicStatusController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Public status page: components + recent incidents + overall banner' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PublicStatusController.prototype, "getStatus", null);
exports.PublicStatusController = PublicStatusController = __decorate([
    (0, swagger_1.ApiTags)('support'),
    (0, common_1.Controller)('status'),
    __metadata("design:paramtypes", [support_service_1.SupportService])
], PublicStatusController);
//# sourceMappingURL=support.controller.js.map