"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagsModule = void 0;
const common_1 = require("@nestjs/common");
const feature_flags_service_1 = require("./feature-flags.service");
const feature_flags_controller_1 = require("./feature-flags.controller");
const security_module_1 = require("../security/security.module");
const notifications_module_1 = require("../notifications/notifications.module");
let FeatureFlagsModule = class FeatureFlagsModule {
};
exports.FeatureFlagsModule = FeatureFlagsModule;
exports.FeatureFlagsModule = FeatureFlagsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        // §2.8 gap 11 — "Contact your admin" tells the admins, so this module needs
        // to be able to write a notification.
        imports: [security_module_1.SecurityModule, notifications_module_1.NotificationsModule],
        controllers: [feature_flags_controller_1.FeatureFlagsController],
        providers: [feature_flags_service_1.FeatureFlagsService],
        exports: [feature_flags_service_1.FeatureFlagsService],
    })
], FeatureFlagsModule);
//# sourceMappingURL=feature-flags.module.js.map