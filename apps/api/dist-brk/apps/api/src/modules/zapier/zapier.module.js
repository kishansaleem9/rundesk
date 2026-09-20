"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZapierModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../common/database/database.module");
const webhooks_module_1 = require("../webhooks/webhooks.module");
const zapier_controller_1 = require("./zapier.controller");
const zapier_service_1 = require("./zapier.service");
const zapier_api_key_guard_1 = require("./zapier-api-key.guard");
/**
 * Zapier integration (Plan §12.4). Reuses the outbound WebhooksModule for
 * subscribe/unsubscribe/delivery and authenticates with the existing workspace
 * API keys via {@link ZapierApiKeyGuard}.
 */
let ZapierModule = class ZapierModule {
};
exports.ZapierModule = ZapierModule;
exports.ZapierModule = ZapierModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, webhooks_module_1.WebhooksModule],
        controllers: [zapier_controller_1.ZapierController],
        providers: [zapier_service_1.ZapierService, zapier_api_key_guard_1.ZapierApiKeyGuard],
    })
], ZapierModule);
//# sourceMappingURL=zapier.module.js.map