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
exports.AddSkillConnectionDto = exports.AddSkillMemoryDto = exports.ApproveSkillProposalDto = exports.UpdateSkillDto = exports.CreateSkillDto = void 0;
const class_validator_1 = require("class-validator");
const skill_templates_1 = require("../skill-templates");
/**
 * §15 — every field here is decorated on purpose.
 *
 * The global ValidationPipe runs with `whitelist: true`, so a property that is
 * declared but not decorated is stripped in transit and the handler sees
 * undefined — no error, no log, nothing to notice. That is exactly how §1.1's
 * `taskTypeId` went missing for a week: the client sent it, the server never
 * saw it, and every test passed.
 */
class CreateSkillDto {
}
exports.CreateSkillDto = CreateSkillDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], CreateSkillDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], CreateSkillDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20_000),
    __metadata("design:type", String)
], CreateSkillDto.prototype, "instructions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(skill_templates_1.SKILL_ARCHETYPES),
    __metadata("design:type", String)
], CreateSkillDto.prototype, "archetype", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['private', 'workspace']),
    __metadata("design:type", String)
], CreateSkillDto.prototype, "visibility", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateSkillDto.prototype, "enabled", void 0);
class UpdateSkillDto {
}
exports.UpdateSkillDto = UpdateSkillDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], UpdateSkillDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], UpdateSkillDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20_000),
    __metadata("design:type", String)
], UpdateSkillDto.prototype, "instructions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['private', 'workspace']),
    __metadata("design:type", String)
], UpdateSkillDto.prototype, "visibility", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSkillDto.prototype, "enabled", void 0);
/**
 * §15 — what a person approved, coming back from the client.
 *
 * The proposal round-trips through the browser, so it is untrusted input like
 * any other body: bounded here, and then put through the same create path as a
 * hand-typed skill. `memories` is validated per element — an @IsArray alone
 * would let anything through inside it.
 */
class ApproveSkillProposalDto {
}
exports.ApproveSkillProposalDto = ApproveSkillProposalDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], ApproveSkillProposalDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], ApproveSkillProposalDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(20_000),
    __metadata("design:type", String)
], ApproveSkillProposalDto.prototype, "instructions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(8),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.MaxLength)(4_000, { each: true }),
    __metadata("design:type", Array)
], ApproveSkillProposalDto.prototype, "memories", void 0);
class AddSkillMemoryDto {
}
exports.AddSkillMemoryDto = AddSkillMemoryDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(4_000),
    __metadata("design:type", String)
], AddSkillMemoryDto.prototype, "content", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['chat', 'manual']),
    __metadata("design:type", String)
], AddSkillMemoryDto.prototype, "source", void 0);
class AddSkillConnectionDto {
}
exports.AddSkillConnectionDto = AddSkillConnectionDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], AddSkillConnectionDto.prototype, "provider", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AddSkillConnectionDto.prototype, "connectionId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], AddSkillConnectionDto.prototype, "config", void 0);
//# sourceMappingURL=skill.dto.js.map