"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const feature_flag_decorator_1 = require("../decorators/feature-flag.decorator");
const feature_flags_service_1 = require("../../modules/feature-flags/feature-flags.service");
let FeatureFlagGuard = class FeatureFlagGuard {
    constructor(reflector, featureFlagsService) {
        this.reflector = reflector;
        this.featureFlagsService = featureFlagsService;
    }
    async canActivate(context) {
        const requiredFlags = this.reflector.getAllAndOverride(feature_flag_decorator_1.FEATURE_FLAG_KEY, [context.getHandler(), context.getClass()]);
        if (!requiredFlags?.length)
            return true;
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        for (const flag of requiredFlags) {
            const enabled = await this.featureFlagsService.isEnabled(flag, {
                userId: user?.id,
                workspaceId: request.params?.workspaceId ?? user?.activeWorkspaceId,
                role: user?.role,
            });
            // Return 404 — feature does not exist when disabled
            if (!enabled)
                throw new common_1.NotFoundException();
        }
        return true;
    }
};
exports.FeatureFlagGuard = FeatureFlagGuard;
exports.FeatureFlagGuard = FeatureFlagGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        feature_flags_service_1.FeatureFlagsService])
], FeatureFlagGuard);
//# sourceMappingURL=feature-flag.guard.js.map