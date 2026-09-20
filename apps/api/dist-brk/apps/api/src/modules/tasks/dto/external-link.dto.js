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
exports.CreateExternalLinkDto = void 0;
const class_validator_1 = require("class-validator");
const PROVIDERS = ['github', 'gitlab', 'google_drive', 'dropbox', 'link'];
/**
 * Create a task ↔ external-service link (Plan §12.8 / §12.2). Only `url` is
 * required — the server parses it to detect provider + kind. `provider` is an
 * optional hint that disambiguates a generic link (e.g. an explicit
 * `google_drive` attach). `commentId` (§12.6) optionally scopes the link to a
 * specific comment on the task (e.g. a Dropbox file shared in a comment);
 * omitted → a task-level link, exactly as before.
 */
class CreateExternalLinkDto {
}
exports.CreateExternalLinkDto = CreateExternalLinkDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateExternalLinkDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(PROVIDERS),
    __metadata("design:type", Object)
], CreateExternalLinkDto.prototype, "provider", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateExternalLinkDto.prototype, "commentId", void 0);
//# sourceMappingURL=external-link.dto.js.map