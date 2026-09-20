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
exports.SignupDto = exports.InviteItemDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class InviteItemDto {
}
exports.InviteItemDto = InviteItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'teammate@company.com' }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], InviteItemDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['admin', 'member'], default: 'member' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['admin', 'member']),
    __metadata("design:type", String)
], InviteItemDto.prototype, "orgRole", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['workspace_admin', 'manager', 'member', 'guest'], default: 'member' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['workspace_admin', 'manager', 'member', 'guest']),
    __metadata("design:type", String)
], InviteItemDto.prototype, "workspaceRole", void 0);
class SignupDto {
}
exports.SignupDto = SignupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Ada Lovelace' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], SignupDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ada@analytics.io' }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SignupDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Secr3t!Pass' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], SignupDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Acme Corp' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], SignupDto.prototype, "organizationName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'acme-corp' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SignupDto.prototype, "organizationSlug", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String], example: ['core', 'ai', 'chat'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], SignupDto.prototype, "features", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [InviteItemDto] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => InviteItemDto),
    __metadata("design:type", Array)
], SignupDto.prototype, "invites", void 0);
//# sourceMappingURL=signup.dto.js.map