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
exports.ZapierController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zapier_service_1 = require("./zapier.service");
const zapier_api_key_guard_1 = require("./zapier-api-key.guard");
const zapier_app_manifest_1 = require("./zapier-app-manifest");
/**
 * Zapier REST-Hooks contract (Plan §12.4). Every route is authenticated by a
 * workspace API key ({@link ZapierApiKeyGuard}) — the key resolves both the
 * caller and the workspace, which is why these routes carry no `:workspaceId`.
 */
let ZapierController = class ZapierController {
    constructor(svc) {
        this.svc = svc;
    }
    authTest(ctx) {
        return this.svc.authTest(ctx.workspaceId, ctx.userId);
    }
    subscribe(ctx, body) {
        return this.svc.subscribe(ctx.workspaceId, ctx.userId, body);
    }
    unsubscribe(ctx, id) {
        return this.svc.unsubscribe(ctx.workspaceId, id);
    }
    sample(ctx, event) {
        return this.svc.sample(ctx.workspaceId, event, ctx.userId);
    }
    manifest() {
        return zapier_app_manifest_1.zapierAppManifest;
    }
};
exports.ZapierController = ZapierController;
__decorate([
    (0, common_1.Get)('auth/test'),
    (0, swagger_1.ApiOperation)({ summary: 'Zapier auth connection test — returns the authenticated workspace & user' }),
    __param(0, (0, zapier_api_key_guard_1.ZapierCtx)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ZapierController.prototype, "authTest", null);
__decorate([
    (0, common_1.Post)('subscribe'),
    (0, swagger_1.ApiOperation)({ summary: 'REST Hook subscribe — create an outbound webhook to a Zapier target URL' }),
    __param(0, (0, zapier_api_key_guard_1.ZapierCtx)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ZapierController.prototype, "subscribe", null);
__decorate([
    (0, common_1.Delete)('subscribe/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'REST Hook unsubscribe — delete the webhook subscription (workspace-scoped)' }),
    __param(0, (0, zapier_api_key_guard_1.ZapierCtx)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ZapierController.prototype, "unsubscribe", null);
__decorate([
    (0, common_1.Get)('triggers/:event/sample'),
    (0, swagger_1.ApiOperation)({ summary: 'Perform-list / sample data for a trigger — recent real, workspace-scoped items' }),
    __param(0, (0, zapier_api_key_guard_1.ZapierCtx)()),
    __param(1, (0, common_1.Param)('event')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ZapierController.prototype, "sample", null);
__decorate([
    (0, common_1.Get)('app-manifest'),
    (0, swagger_1.ApiOperation)({ summary: 'Static Zapier app definition (auth, triggers, subscribe/unsubscribe/list URLs)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ZapierController.prototype, "manifest", null);
exports.ZapierController = ZapierController = __decorate([
    (0, swagger_1.ApiTags)('zapier'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(zapier_api_key_guard_1.ZapierApiKeyGuard),
    (0, common_1.Controller)('zapier'),
    __metadata("design:paramtypes", [zapier_service_1.ZapierService])
], ZapierController);
//# sourceMappingURL=zapier.controller.js.map