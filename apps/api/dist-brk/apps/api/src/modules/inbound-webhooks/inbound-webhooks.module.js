"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboundWebhooksModule = void 0;
const common_1 = require("@nestjs/common");
const inbound_webhooks_service_1 = require("./inbound-webhooks.service");
const git_commit_links_service_1 = require("./git-commit-links.service");
const zoom_recordings_service_1 = require("./zoom-recordings.service");
const inbound_webhooks_controller_1 = require("./inbound-webhooks.controller");
const database_module_1 = require("../../common/database/database.module");
const tasks_module_1 = require("../tasks/tasks.module");
let InboundWebhooksModule = class InboundWebhooksModule {
};
exports.InboundWebhooksModule = InboundWebhooksModule;
exports.InboundWebhooksModule = InboundWebhooksModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, tasks_module_1.TasksModule],
        controllers: [
            inbound_webhooks_controller_1.InboundWebhooksController,
            inbound_webhooks_controller_1.InboundWebhookReceiverController,
            inbound_webhooks_controller_1.InboundGitWebhookController,
            inbound_webhooks_controller_1.InboundZoomWebhookController,
        ],
        // GitCommitLinksService (§12.8) and ZoomRecordingsService (§12.9) back the two
        // new public receivers; both talk to the DB directly (DatabaseModule) and are
        // env-gated on the relevant provider connection.
        providers: [inbound_webhooks_service_1.InboundWebhooksService, git_commit_links_service_1.GitCommitLinksService, zoom_recordings_service_1.ZoomRecordingsService],
    })
], InboundWebhooksModule);
//# sourceMappingURL=inbound-webhooks.module.js.map