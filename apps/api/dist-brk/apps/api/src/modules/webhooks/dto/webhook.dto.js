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
exports.UpdateWebhookDto = exports.CreateWebhookDto = void 0;
const class_validator_1 = require("class-validator");
/**
 * Webhook create/update DTOs.
 *
 * These are the HTTP-boundary guard for the outbound-webhook SSRF sink: the
 * global ValidationPipe (whitelist + transform) rejects malformed input and,
 * crucially, `@IsUrl` restricts `url` to http/https so a webhook can never be
 * created — or later repointed — at a `file:`/`gopher:` or otherwise exotic
 * scheme. The private/reserved-IP rejection (literal IPs at write time, and
 * DNS-pinned re-validation on every redirect hop at delivery time) is enforced
 * in the service via the shared `safeFetch`/`assertSafeUrl` guard, using the
 * same canonical classifier for both create/update and delivery.
 *
 * `require_tld: false` keeps `@IsUrl` from false-rejecting otherwise-valid
 * hosts; the authoritative host/IP safety check is `assertSafeUrl` in the
 * service, not this decorator.
 */
const WEBHOOK_URL_OPTS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };
class CreateWebhookDto {
}
exports.CreateWebhookDto = CreateWebhookDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateWebhookDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsUrl)(WEBHOOK_URL_OPTS),
    __metadata("design:type", String)
], CreateWebhookDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateWebhookDto.prototype, "events", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateWebhookDto.prototype, "secret", void 0);
class UpdateWebhookDto {
}
exports.UpdateWebhookDto = UpdateWebhookDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UpdateWebhookDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(WEBHOOK_URL_OPTS),
    __metadata("design:type", String)
], UpdateWebhookDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateWebhookDto.prototype, "events", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateWebhookDto.prototype, "isEnabled", void 0);
//# sourceMappingURL=webhook.dto.js.map