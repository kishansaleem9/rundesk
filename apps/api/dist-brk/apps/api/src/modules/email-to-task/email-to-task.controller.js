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
exports.InboundEmailController = exports.EmailAliasController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const node_crypto_1 = require("node:crypto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const email_to_task_service_1 = require("./email-to-task.service");
/**
 * Authenticated: per-list inbound alias CRUD.
 */
let EmailAliasController = class EmailAliasController {
    constructor(svc) {
        this.svc = svc;
    }
    async get(listId) {
        return this.svc.getAlias(listId);
    }
    async ensure(user, listId) {
        return this.svc.ensureAlias(listId, user.id);
    }
    async rotate(user, listId) {
        return this.svc.rotateAlias(listId, user.id);
    }
    async revoke(user, listId) {
        return this.svc.revokeAlias(listId, user.id);
    }
};
exports.EmailAliasController = EmailAliasController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EmailAliasController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], EmailAliasController.prototype, "ensure", null);
__decorate([
    (0, common_1.Post)('rotate'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], EmailAliasController.prototype, "rotate", null);
__decorate([
    (0, common_1.Delete)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], EmailAliasController.prototype, "revoke", null);
exports.EmailAliasController = EmailAliasController = __decorate([
    (0, swagger_1.ApiTags)('email-to-task'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('lists/:listId/inbound-email'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [email_to_task_service_1.EmailToTaskService])
], EmailAliasController);
let InboundEmailController = class InboundEmailController {
    constructor(svc) {
        this.svc = svc;
    }
    async ingest(signature, body) {
        this.verifySignature(body, signature);
        const payload = this.normalisePayload(body);
        return this.svc.ingest(payload);
    }
    verifySignature(body, signature) {
        const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
        if (!secret)
            return; // intentionally permissive when unset (dev / local)
        if (!signature) {
            throw new common_1.UnauthorizedException('Missing x-rundesk-signature header');
        }
        // Sign the canonical Message-Id + recipient pair — payloads are large
        // and re-stringification can change byte-for-byte equality. Both fields
        // are unique-ish enough to authenticate the request shape.
        const messageId = body.MessageID ?? body.messageId ?? '';
        const recipient = body.To ?? body.recipient ?? '';
        const expected = (0, node_crypto_1.createHmac)('sha256', secret)
            .update(`${messageId}\n${recipient}`)
            .digest('hex');
        let given;
        try {
            given = Buffer.from(signature, 'hex');
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid signature format');
        }
        const expectedBuf = Buffer.from(expected, 'hex');
        if (given.length !== expectedBuf.length || !(0, node_crypto_1.timingSafeEqual)(given, expectedBuf)) {
            throw new common_1.UnauthorizedException('Signature mismatch');
        }
    }
    normalisePayload(body) {
        const messageId = body.MessageID ?? body.messageId;
        const from = body.From ?? body.fromAddress;
        const recipient = body.To ?? body.recipient;
        if (!messageId || !from || !recipient) {
            throw new common_1.UnauthorizedException('Missing required fields: messageId, from, recipient');
        }
        const postmarkAtt = (body.Attachments ?? []).map((a) => ({
            fileName: a.Name,
            contentType: a.ContentType,
            content: Buffer.from(a.Content, 'base64'),
        }));
        const nativeAtt = (body.attachments ?? []).map((a) => ({
            fileName: a.fileName,
            contentType: a.contentType,
            content: Buffer.from(a.contentBase64, 'base64'),
        }));
        return {
            messageId,
            fromAddress: this.extractEmail(from),
            fromName: body.FromName ?? body.fromName,
            recipient: this.extractEmail(recipient),
            subject: body.Subject ?? body.subject,
            textBody: body.TextBody ?? body.textBody,
            htmlBody: body.HtmlBody ?? body.htmlBody,
            inReplyTo: (body.InReplyTo ?? body.inReplyTo)?.trim(),
            references: body.References ?? body.references,
            attachments: [...postmarkAtt, ...nativeAtt],
        };
    }
    /** `"Alice <alice@example.com>"` -> `alice@example.com` */
    extractEmail(value) {
        const match = value.match(/<([^>]+)>/);
        return (match ? match[1] : value).trim().toLowerCase();
    }
};
exports.InboundEmailController = InboundEmailController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Headers)('x-rundesk-signature')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InboundEmailController.prototype, "ingest", null);
exports.InboundEmailController = InboundEmailController = __decorate([
    (0, swagger_1.ApiTags)('email-to-task'),
    (0, common_1.Controller)('inbound/email'),
    __metadata("design:paramtypes", [email_to_task_service_1.EmailToTaskService])
], InboundEmailController);
//# sourceMappingURL=email-to-task.controller.js.map