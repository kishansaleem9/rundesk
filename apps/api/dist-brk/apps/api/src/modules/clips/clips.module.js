"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClipsModule = void 0;
const common_1 = require("@nestjs/common");
const clips_controller_1 = require("./clips.controller");
const clips_service_1 = require("./clips.service");
const email_module_1 = require("../email/email.module");
let ClipsModule = class ClipsModule {
};
exports.ClipsModule = ClipsModule;
exports.ClipsModule = ClipsModule = __decorate([
    (0, common_1.Module)({
        imports: [email_module_1.EmailModule],
        controllers: [clips_controller_1.ClipsController],
        providers: [clips_service_1.ClipsService],
    })
], ClipsModule);
//# sourceMappingURL=clips.module.js.map