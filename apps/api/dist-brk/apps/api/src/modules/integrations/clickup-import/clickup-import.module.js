"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClickUpImportModule = void 0;
const common_1 = require("@nestjs/common");
const clickup_import_service_1 = require("./clickup-import.service");
const clickup_import_controller_1 = require("./clickup-import.controller");
const spreadsheet_import_service_1 = require("./spreadsheet-import.service");
const spreadsheet_import_controller_1 = require("./spreadsheet-import.controller");
const database_module_1 = require("../../../common/database/database.module");
const storage_module_1 = require("../../../common/storage/storage.module");
const workspace_member_guard_1 = require("../../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../../auth/guards/workspace-admin.guard");
let ClickUpImportModule = class ClickUpImportModule {
};
exports.ClickUpImportModule = ClickUpImportModule;
exports.ClickUpImportModule = ClickUpImportModule = __decorate([
    (0, common_1.Module)({
        // StorageModule (R2Service) is global, but imported explicitly so the ClickUp
        // API enrichment path can re-upload attachment bytes even in isolated wiring.
        imports: [database_module_1.DatabaseModule, storage_module_1.StorageModule],
        // §V2-S13 frame `12:08` — the generic spreadsheet importer rides in the same
        // module because it shares the job table, the poller and the progress shape.
        controllers: [clickup_import_controller_1.ClickUpImportController, spreadsheet_import_controller_1.SpreadsheetImportController],
        providers: [clickup_import_service_1.ClickUpImportService, spreadsheet_import_service_1.SpreadsheetImportService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [clickup_import_service_1.ClickUpImportService, spreadsheet_import_service_1.SpreadsheetImportService],
    })
], ClickUpImportModule);
//# sourceMappingURL=clickup-import.module.js.map