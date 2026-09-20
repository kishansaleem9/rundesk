"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerMembersModule = void 0;
const common_1 = require("@nestjs/common");
const container_members_service_1 = require("./container-members.service");
const space_members_controller_1 = require("./space-members.controller");
const project_members_controller_1 = require("./project-members.controller");
let ContainerMembersModule = class ContainerMembersModule {
};
exports.ContainerMembersModule = ContainerMembersModule;
exports.ContainerMembersModule = ContainerMembersModule = __decorate([
    (0, common_1.Module)({
        controllers: [space_members_controller_1.SpaceMembersController, project_members_controller_1.ProjectMembersController],
        providers: [container_members_service_1.ContainerMembersService],
        exports: [container_members_service_1.ContainerMembersService],
    })
], ContainerMembersModule);
//# sourceMappingURL=container-members.module.js.map