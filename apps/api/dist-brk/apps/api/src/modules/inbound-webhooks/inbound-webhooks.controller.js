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
exports.InboundZoomWebhookController = exports.InboundGitWebhookController = exports.InboundWebhookReceiverController = exports.InboundWebhooksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const node_crypto_1 = require("node:crypto");
const inbound_webhooks_service_1 = require("./inbound-webhooks.service");
const git_commit_links_service_1 = require("./git-commit-links.service");
const zoom_recordings_service_1 = require("./zoom-recordings.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let InboundWebhooksController = class InboundWebhooksController {
    constructor(hooks) {
        this.hooks = hooks;
    }
    list(listId) {
        return this.hooks.listForList(listId);
    }
    create(listId, user, body) {
        return this.hooks.create(listId, body?.name ?? '', user.id);
    }
    remove(listId, id) {
        return this.hooks.remove(id, listId);
    }
};
exports.InboundWebhooksController = InboundWebhooksController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], InboundWebhooksController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], InboundWebhooksController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], InboundWebhooksController.prototype, "remove", null);
exports.InboundWebhooksController = InboundWebhooksController = __decorate([
    (0, swagger_1.ApiTags)('inbound-webhooks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('lists/:listId/inbound-webhooks'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [inbound_webhooks_service_1.InboundWebhooksService])
], InboundWebhooksController);
// Public, unauthenticated receiver — external systems POST here with the token.
let InboundWebhookReceiverController = class InboundWebhookReceiverController {
    constructor(hooks) {
        this.hooks = hooks;
    }
    receive(token, body) {
        return this.hooks.receive(token, body ?? {});
    }
};
exports.InboundWebhookReceiverController = InboundWebhookReceiverController;
__decorate([
    (0, common_1.Post)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], InboundWebhookReceiverController.prototype, "receive", null);
exports.InboundWebhookReceiverController = InboundWebhookReceiverController = __decorate([
    (0, swagger_1.ApiTags)('inbound-webhooks'),
    (0, common_1.Controller)('inbound/webhook'),
    __metadata("design:paramtypes", [inbound_webhooks_service_1.InboundWebhooksService])
], InboundWebhookReceiverController);
/**
 * §12.8 — public GitHub/GitLab **push** receiver. External VCS hosts POST push
 * events here; each commit message is scanned for a Rundesk task reference
 * (see git-commit-links.util) and auto-linked to the task (kind:'commit').
 *
 * Signature/secret verification (env-gated, degrades to permissive when the
 * secret env var is unset — matching the existing inbound-email receiver):
 *   • GitHub → HMAC-SHA256 of the RAW body under `GITHUB_WEBHOOK_SECRET`,
 *     compared to `X-Hub-Signature-256`.
 *   • GitLab → the `X-Gitlab-Token` header compared to `GITLAB_WEBHOOK_SECRET`.
 * The raw body is available because the app is bootstrapped with
 * `{ rawBody: true }` (see main.ts — the same mechanism the Stripe webhook uses).
 */
let InboundGitWebhookController = class InboundGitWebhookController {
    constructor(commitLinks) {
        this.commitLinks = commitLinks;
    }
    async receive(providerRaw, req, githubSignature, gitlabToken, githubEvent, gitlabEvent, body) {
        const provider = this.assertGitProvider(providerRaw);
        const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
        if (provider === 'github') {
            this.verifyGithubSignature(raw, githubSignature);
            // GitHub sends a `ping` on hook creation and many non-push events; only
            // push carries commits to scan. Ack everything else with a no-op.
            if (githubEvent && githubEvent !== 'push')
                return { ok: true, event: githubEvent, linked: 0 };
        }
        else {
            this.verifyGitlabToken(gitlabToken);
            if (gitlabEvent && gitlabEvent !== 'Push Hook')
                return { ok: true, event: gitlabEvent, linked: 0 };
        }
        return this.commitLinks.ingestPush(provider, body);
    }
    assertGitProvider(raw) {
        if (raw === 'github' || raw === 'gitlab')
            return raw;
        throw new common_1.BadRequestException(`Unsupported git provider: ${raw}`);
    }
    verifyGithubSignature(raw, signature) {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!secret)
            return; // intentionally permissive when unset (dev / local)
        if (!signature)
            throw new common_1.UnauthorizedException('Missing X-Hub-Signature-256 header');
        const expected = `sha256=${(0, node_crypto_1.createHmac)('sha256', secret).update(raw).digest('hex')}`;
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b)) {
            throw new common_1.UnauthorizedException('GitHub webhook signature mismatch');
        }
    }
    verifyGitlabToken(token) {
        const secret = process.env.GITLAB_WEBHOOK_SECRET;
        if (!secret)
            return; // intentionally permissive when unset (dev / local)
        if (!token)
            throw new common_1.UnauthorizedException('Missing X-Gitlab-Token header');
        // Constant-time compare of equal-length digests (avoids leaking length).
        const a = (0, node_crypto_1.createHmac)('sha256', secret).update(token).digest();
        const b = (0, node_crypto_1.createHmac)('sha256', secret).update(secret).digest();
        if (!(0, node_crypto_1.timingSafeEqual)(a, b))
            throw new common_1.UnauthorizedException('GitLab webhook token mismatch');
    }
};
exports.InboundGitWebhookController = InboundGitWebhookController;
__decorate([
    (0, common_1.Post)(':provider'),
    (0, swagger_1.ApiExcludeEndpoint)(),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Headers)('x-hub-signature-256')),
    __param(3, (0, common_1.Headers)('x-gitlab-token')),
    __param(4, (0, common_1.Headers)('x-github-event')),
    __param(5, (0, common_1.Headers)('x-gitlab-event')),
    __param(6, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], InboundGitWebhookController.prototype, "receive", null);
exports.InboundGitWebhookController = InboundGitWebhookController = __decorate([
    (0, swagger_1.ApiTags)('inbound-webhooks'),
    (0, common_1.Controller)('inbound/git'),
    __metadata("design:paramtypes", [git_commit_links_service_1.GitCommitLinksService])
], InboundGitWebhookController);
/**
 * §12.9 — public Zoom event receiver. Handles the one-time `endpoint.url_validation`
 * challenge and the `recording.completed` event: on the latter we fetch the
 * meeting's cloud recording and attach its share URL to the linked task(s).
 *
 * Signature verification (env-gated on `ZOOM_WEBHOOK_SECRET_TOKEN`): Zoom signs
 * `v0:<timestamp>:<raw body>` with HMAC-SHA256 and sends it as `x-zm-signature`.
 */
let InboundZoomWebhookController = class InboundZoomWebhookController {
    constructor(recordings) {
        this.recordings = recordings;
    }
    async receive(req, signature, timestamp, body) {
        const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
        // Zoom's endpoint validation: echo back plainToken + its HMAC. Returned
        // before signature verification because the challenge itself carries none.
        if (body?.event === 'endpoint.url_validation') {
            const plainToken = body.payload?.plainToken ?? '';
            const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '';
            return {
                plainToken,
                encryptedToken: (0, node_crypto_1.createHmac)('sha256', secret).update(plainToken).digest('hex'),
            };
        }
        this.verifyZoomSignature(raw, signature, timestamp);
        if (body?.event === 'recording.completed') {
            return this.recordings.handleRecordingCompleted(body);
        }
        return { ok: true, event: body?.event ?? null };
    }
    verifyZoomSignature(raw, signature, timestamp) {
        const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
        if (!secret)
            return; // intentionally permissive when unset (dev / local)
        if (!signature || !timestamp)
            throw new common_1.UnauthorizedException('Missing Zoom signature headers');
        const message = `v0:${timestamp}:${raw.toString('utf8')}`;
        const expected = `v0=${(0, node_crypto_1.createHmac)('sha256', secret).update(message).digest('hex')}`;
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b)) {
            throw new common_1.UnauthorizedException('Zoom webhook signature mismatch');
        }
    }
};
exports.InboundZoomWebhookController = InboundZoomWebhookController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiExcludeEndpoint)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('x-zm-signature')),
    __param(2, (0, common_1.Headers)('x-zm-request-timestamp')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], InboundZoomWebhookController.prototype, "receive", null);
exports.InboundZoomWebhookController = InboundZoomWebhookController = __decorate([
    (0, swagger_1.ApiTags)('inbound-webhooks'),
    (0, common_1.Controller)('inbound/zoom'),
    __metadata("design:paramtypes", [zoom_recordings_service_1.ZoomRecordingsService])
], InboundZoomWebhookController);
//# sourceMappingURL=inbound-webhooks.controller.js.map