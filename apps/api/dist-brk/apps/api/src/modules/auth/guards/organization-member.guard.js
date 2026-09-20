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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationMemberGuard = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../../common/database/database.module");
let OrganizationMemberGuard = class OrganizationMemberGuard {
    constructor(db) {
        this.db = db;
    }
    async canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        const user = req.user;
        const organizationId = req.params?.organizationId;
        if (!user?.id) {
            throw new common_1.ForbiddenException('Not authenticated');
        }
        if (!organizationId) {
            throw new common_1.ForbiddenException('Organization context required');
        }
        if (user.role === 'super_admin') {
            const [org] = await this.db
                .select({ id: db_1.organizations.id })
                .from(db_1.organizations)
                .where((0, drizzle_orm_1.eq)(db_1.organizations.id, organizationId))
                .limit(1);
            if (!org)
                throw new common_1.NotFoundException('Organization not found');
            req.organizationMember = { userId: user.id, organizationId, role: 'owner' };
            return true;
        }
        const [member] = await this.db
            .select()
            .from(db_1.organizationMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, user.id)))
            .limit(1);
        if (!member) {
            throw new common_1.NotFoundException('Organization not found');
        }
        req.organizationMember = member;
        return true;
    }
};
exports.OrganizationMemberGuard = OrganizationMemberGuard;
exports.OrganizationMemberGuard = OrganizationMemberGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], OrganizationMemberGuard);
//# sourceMappingURL=organization-member.guard.js.map