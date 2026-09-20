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
exports.ClientInvoicingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_invoicing_service_1 = require("./client-invoicing.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const permissions_guard_1 = require("../custom-roles/permissions.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
/**
 * §12.10 Client invoicing. Workspace-scoped routes for generating client
 * invoices from billable project time and walking them through their lifecycle
 * (draft → sent → paid, or void). Gated by the billing permission — the same
 * one that guards the workspace's Stripe billing surface.
 */
let ClientInvoicingController = class ClientInvoicingController {
    constructor(invoicing) {
        this.invoicing = invoicing;
    }
    generate(workspaceId, user, body) {
        return this.invoicing.generateFromProject(workspaceId, body?.projectId ?? '', {
            ratePerHourCents: body?.ratePerHourCents,
            currency: body?.currency,
            dueInDays: body?.dueInDays,
            notes: body?.notes,
            createdById: user.id,
            createdByRole: user.role,
        });
    }
    list(workspaceId) {
        return this.invoicing.list(workspaceId);
    }
    get(workspaceId, id) {
        return this.invoicing.get(workspaceId, id);
    }
    markSent(workspaceId, id) {
        return this.invoicing.markSent(workspaceId, id);
    }
    markPaid(workspaceId, id) {
        return this.invoicing.markPaid(workspaceId, id);
    }
    void(workspaceId, id) {
        return this.invoicing.void(workspaceId, id);
    }
};
exports.ClientInvoicingController = ClientInvoicingController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate a draft invoice from a project’s unbilled billable time' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ClientInvoicingController.prototype, "generate", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List the workspace’s client invoices' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ClientInvoicingController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a client invoice with its line items' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ClientInvoicingController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':id/send'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark an invoice as sent' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ClientInvoicingController.prototype, "markSent", null);
__decorate([
    (0, common_1.Post)(':id/paid'),
    (0, swagger_1.ApiOperation)({ summary: 'Mark an invoice as paid' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ClientInvoicingController.prototype, "markPaid", null);
__decorate([
    (0, common_1.Post)(':id/void'),
    (0, swagger_1.ApiOperation)({ summary: 'Void an invoice and release its time entries' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ClientInvoicingController.prototype, "void", null);
exports.ClientInvoicingController = ClientInvoicingController = __decorate([
    (0, swagger_1.ApiTags)('client-invoicing'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('workspace.billing'),
    (0, common_1.Controller)('workspaces/:workspaceId/client-invoices'),
    __metadata("design:paramtypes", [client_invoicing_service_1.ClientInvoicingService])
], ClientInvoicingController);
//# sourceMappingURL=client-invoicing.controller.js.map