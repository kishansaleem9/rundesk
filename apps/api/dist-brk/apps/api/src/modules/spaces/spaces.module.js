"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpacesModule = void 0;
const common_1 = require("@nestjs/common");
const spaces_service_1 = require("./spaces.service");
const spaces_controller_1 = require("./spaces.controller");
const custom_roles_module_1 = require("../custom-roles/custom-roles.module");
const security_module_1 = require("../security/security.module");
const lists_module_1 = require("../lists/lists.module");
const plans_module_1 = require("../plans/plans.module");
let SpacesModule = class SpacesModule {
};
exports.SpacesModule = SpacesModule;
exports.SpacesModule = SpacesModule = __decorate([
    (0, common_1.Module)({
        // §V2-06 — a preset seeds the space's first lists through the lists
        // service, so a seeded list is made by the same path a hand-made one is.
        // PlansModule for the ClickApps plan gate (`[07:20]`); it depends only on the
        // global DatabaseModule, so it brings no cycle with it.
        imports: [custom_roles_module_1.CustomRolesModule, security_module_1.SecurityModule, lists_module_1.ListsModule, plans_module_1.PlansModule],
        providers: [spaces_service_1.SpacesService],
        controllers: [spaces_controller_1.SpacesController, spaces_controller_1.SpacePresetsController],
        exports: [spaces_service_1.SpacesService],
    })
], SpacesModule);
//# sourceMappingURL=spaces.module.js.map