"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasesModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../common/database/database.module");
const canvases_controller_1 = require("./canvases.controller");
const canvases_service_1 = require("./canvases.service");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
let CanvasesModule = class CanvasesModule {
};
exports.CanvasesModule = CanvasesModule;
exports.CanvasesModule = CanvasesModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        controllers: [canvases_controller_1.CanvasesController],
        providers: [canvases_service_1.CanvasesService, workspace_member_guard_1.WorkspaceMemberGuard],
        exports: [canvases_service_1.CanvasesService],
    })
], CanvasesModule);
//# sourceMappingURL=canvases.module.js.map