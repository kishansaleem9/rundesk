"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotGuestGuard = void 0;
const common_1 = require("@nestjs/common");
/**
 * Blocks users whose global role is 'guest'. Apply AFTER JwtAuthGuard on
 * endpoints that guests may not use (e.g. AI agents, Plan §3.3). Guests can
 * still view/comment through the resource-level guards.
 */
let NotGuestGuard = class NotGuestGuard {
    canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        if (!req.user?.id)
            throw new common_1.ForbiddenException('Not authenticated');
        if (req.user.role === 'guest')
            throw new common_1.ForbiddenException('Guests cannot use this feature');
        return true;
    }
};
exports.NotGuestGuard = NotGuestGuard;
exports.NotGuestGuard = NotGuestGuard = __decorate([
    (0, common_1.Injectable)()
], NotGuestGuard);
//# sourceMappingURL=not-guest.guard.js.map