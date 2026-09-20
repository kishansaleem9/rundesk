"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalLinkSyncModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../../common/database/database.module");
const external_link_refresh_service_1 = require("./external-link-refresh.service");
/**
 * §12.2 — hosts the background @Cron that keeps task↔external links in sync
 * (Drive/Dropbox names, GitHub/GitLab PR & issue state). The service must be
 * provided here (and the module imported in AppModule) for its cron to register
 * with the already-configured ScheduleModule.
 */
let ExternalLinkSyncModule = class ExternalLinkSyncModule {
};
exports.ExternalLinkSyncModule = ExternalLinkSyncModule;
exports.ExternalLinkSyncModule = ExternalLinkSyncModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        providers: [external_link_refresh_service_1.ExternalLinkRefreshService],
        exports: [external_link_refresh_service_1.ExternalLinkRefreshService],
    })
], ExternalLinkSyncModule);
//# sourceMappingURL=external-link-sync.module.js.map