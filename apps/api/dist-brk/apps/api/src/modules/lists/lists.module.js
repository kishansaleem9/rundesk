"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListsModule = void 0;
const common_1 = require("@nestjs/common");
const lists_service_1 = require("./lists.service");
const lists_controller_1 = require("./lists.controller");
const list_statuses_service_1 = require("./list-statuses.service");
const list_statuses_controller_1 = require("./list-statuses.controller");
const scoped_statuses_service_1 = require("./scoped-statuses.service");
const scoped_statuses_controller_1 = require("./scoped-statuses.controller");
const security_module_1 = require("../security/security.module");
let ListsModule = class ListsModule {
};
exports.ListsModule = ListsModule;
exports.ListsModule = ListsModule = __decorate([
    (0, common_1.Module)({
        imports: [security_module_1.SecurityModule],
        providers: [lists_service_1.ListsService, list_statuses_service_1.ListStatusesService, scoped_statuses_service_1.ScopedStatusesService],
        controllers: [
            lists_controller_1.ListsController,
            list_statuses_controller_1.ListStatusesController,
            scoped_statuses_controller_1.SpaceStatusesController,
            scoped_statuses_controller_1.ProjectStatusesController,
        ],
        exports: [lists_service_1.ListsService, list_statuses_service_1.ListStatusesService, scoped_statuses_service_1.ScopedStatusesService],
    })
], ListsModule);
//# sourceMappingURL=lists.module.js.map