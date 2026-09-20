"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FoldersModule = void 0;
const common_1 = require("@nestjs/common");
const folders_service_1 = require("./folders.service");
const folders_controller_1 = require("./folders.controller");
const custom_roles_module_1 = require("../custom-roles/custom-roles.module");
const security_module_1 = require("../security/security.module");
let FoldersModule = class FoldersModule {
};
exports.FoldersModule = FoldersModule;
exports.FoldersModule = FoldersModule = __decorate([
    (0, common_1.Module)({
        imports: [custom_roles_module_1.CustomRolesModule, security_module_1.SecurityModule],
        controllers: [folders_controller_1.FoldersController],
        providers: [folders_service_1.FoldersService],
        exports: [folders_service_1.FoldersService],
    })
], FoldersModule);
//# sourceMappingURL=folders.module.js.map