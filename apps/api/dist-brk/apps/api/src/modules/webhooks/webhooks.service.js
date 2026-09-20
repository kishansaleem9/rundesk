"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const crypto = __importStar(require("crypto"));
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const safe_fetch_1 = require("../../common/http/safe-fetch");
const WEBHOOK_EVENTS = [
    'task.created',
    'task.updated',
    'task.deleted',
    'task.status_changed',
    'task.assigned',
    'task.assignee_changed',
    'comment.created',
    'project.created',
    'project.updated',
    'member.invited',
    'member.joined',
    'member.removed',
    'time.logged',
    'form.submitted',
];
let WebhooksService = class WebhooksService {
    constructor(db) {
        this.db = db;
    }
    getAvailableEvents() {
        return WEBHOOK_EVENTS;
    }
    async list(workspaceId) {
        return this.db
            .select()
            .from(db_1.webhooks)
            .where((0, drizzle_orm_1.eq)(db_1.webhooks.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.webhooks.createdAt));
    }
    /**
     * Reject a webhook target URL that is not a public http/https endpoint before
     * it is ever persisted: non-http(s) schemes and literal private/reserved IPs
     * (loopback, link-local incl. the 169.254.169.254 cloud-metadata endpoint,
     * RFC-1918, CGNAT, …) are refused here. Hostnames that resolve to a private
     * address are additionally blocked at delivery time by {@link safeFetch}'s
     * DNS-pinned guard, so DNS-rebinding cannot repoint a "public" host inward.
     */
    assertPublicHttpUrl(url) {
        try {
            (0, safe_fetch_1.assertSafeUrl)(url);
        }
        catch (err) {
            if (err instanceof safe_fetch_1.SsrfBlockedError) {
                throw new common_1.BadRequestException(`url is not an allowed webhook target: ${err.message}`);
            }
            throw new common_1.BadRequestException('url must be a valid absolute http(s) URL');
        }
    }
    async create(workspaceId, userId, dto) {
        if (typeof dto?.name !== 'string' || !dto.name.trim())
            throw new common_1.BadRequestException('name is required');
        if (typeof dto?.url !== 'string' || !dto.url.trim())
            throw new common_1.BadRequestException('url is required');
        this.assertPublicHttpUrl(dto.url);
        if (!Array.isArray(dto.events) || dto.events.length === 0) {
            throw new common_1.BadRequestException('events must be a non-empty array');
        }
        const unknown = dto.events.filter((e) => !WEBHOOK_EVENTS.includes(e));
        if (unknown.length)
            throw new common_1.BadRequestException(`Unknown webhook events: ${unknown.join(', ')}`);
        const secret = dto.secret || crypto.randomBytes(20).toString('hex');
        const [row] = await this.db
            .insert(db_1.webhooks)
            .values({ workspaceId, createdById: userId, ...dto, secret })
            .returning();
        return row;
    }
    async assertOwnership(workspaceId, webhookId) {
        const [row] = await this.db
            .select()
            .from(db_1.webhooks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.webhooks.id, webhookId), (0, drizzle_orm_1.eq)(db_1.webhooks.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Webhook not found');
        return row;
    }
    async update(workspaceId, webhookId, patch) {
        await this.assertOwnership(workspaceId, webhookId);
        // Re-validate the target on update too: without this an admin could create a
        // benign webhook and later PATCH `url` to an internal address (SSRF).
        if (typeof patch.url === 'string')
            this.assertPublicHttpUrl(patch.url);
        const [row] = await this.db
            .update(db_1.webhooks)
            .set({ ...patch, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.webhooks.id, webhookId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Webhook not found');
        return row;
    }
    async delete(workspaceId, webhookId) {
        await this.assertOwnership(workspaceId, webhookId);
        await this.db.delete(db_1.webhooks).where((0, drizzle_orm_1.eq)(db_1.webhooks.id, webhookId));
        return { ok: true };
    }
    async listDeliveries(workspaceId, webhookId) {
        await this.assertOwnership(workspaceId, webhookId);
        return this.db
            .select()
            .from(db_1.webhookDeliveries)
            .where((0, drizzle_orm_1.eq)(db_1.webhookDeliveries.webhookId, webhookId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.webhookDeliveries.deliveredAt))
            .limit(50);
    }
    // ─── Fire event to all matching webhooks ──────────────────────────────────
    async fire(workspaceId, event, payload) {
        const hooks = await this.db
            .select()
            .from(db_1.webhooks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.webhooks.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.webhooks.isEnabled, true)));
        const matching = hooks.filter((h) => {
            const events = h.events;
            return events.includes(event) || events.includes('*');
        });
        await Promise.allSettled(matching.map((hook) => this.deliver(hook, event, payload)));
    }
    async deliver(hook, event, payload) {
        const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
        const signature = hook.secret
            ? `sha256=${crypto.createHmac('sha256', hook.secret).update(body).digest('hex')}`
            : undefined;
        const start = Date.now();
        const { attempts, lastStatus, lastBody, lastError } = await this.postWithRetry(hook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Rundesk-Event': event,
                'X-Rundesk-Delivery-Id': crypto.randomUUID(),
                ...(signature ? { 'X-Rundesk-Signature': signature } : {}),
            },
            body,
        });
        const statusCode = lastStatus;
        const responseBody = lastBody ?? lastError;
        const success = typeof lastStatus === 'number' && lastStatus >= 200 && lastStatus < 300;
        if (success) {
            await this.db
                .update(db_1.webhooks)
                .set({ successCount: hook.successCount + 1, lastDeliveredAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.webhooks.id, hook.id));
        }
        else {
            await this.db
                .update(db_1.webhooks)
                .set({ failureCount: hook.failureCount + 1, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.webhooks.id, hook.id));
        }
        await this.db.insert(db_1.webhookDeliveries).values({
            webhookId: hook.id,
            event,
            payload,
            statusCode,
            responseBody: responseBody?.slice(0, 1000),
            duration: Date.now() - start,
            attempts,
            success,
        });
    }
    async testWebhook(workspaceId, webhookId) {
        const hook = await this.assertOwnership(workspaceId, webhookId);
        await this.deliver(hook, 'webhook.test', { message: 'Test delivery from Rundesk' });
        return { ok: true };
    }
    /**
     * Post with retry. Retries on network errors AND on HTTP 5xx responses with
     * exponential backoff (250ms, 750ms, 1.5s). 4xx responses are treated as
     * permanent failures and not retried.
     *
     * All delivery traffic goes through {@link safeFetch}, which enforces
     * http/https only, blocks private/reserved IPs with DNS pinning, and
     * re-validates every redirect hop — so a webhook can never be used to read an
     * internal endpoint (e.g. the cloud-metadata service). A {@link SsrfBlockedError}
     * is a permanent block: it is recorded as a failed delivery and never retried.
     */
    async postWithRetry(url, init) {
        const maxAttempts = 3;
        let attempt = 0;
        let lastStatus;
        let lastBody;
        let lastError;
        while (attempt < maxAttempts) {
            attempt++;
            try {
                const res = await (0, safe_fetch_1.safeFetch)(url, {
                    method: init.method,
                    headers: init.headers,
                    body: init.body,
                    timeoutMs: 10_000,
                });
                lastStatus = res.status;
                lastBody = res.text();
                lastError = undefined;
                // Success — done
                if (res.status >= 200 && res.status < 300)
                    return { attempts: attempt, lastStatus, lastBody };
                // 4xx — permanent failure, do not retry
                if (res.status >= 400 && res.status < 500) {
                    return { attempts: attempt, lastStatus, lastBody };
                }
                // 5xx — fall through to retry
            }
            catch (err) {
                // SSRF-blocked targets are permanent: don't retry, record the failure.
                if (err instanceof safe_fetch_1.SsrfBlockedError) {
                    return { attempts: attempt, lastStatus: undefined, lastBody: undefined, lastError: `Blocked: ${err.message}` };
                }
                lastError = err?.message ?? 'Delivery failed';
                lastStatus = undefined;
                lastBody = undefined;
            }
            if (attempt < maxAttempts) {
                const backoffMs = 250 * Math.pow(3, attempt - 1);
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
        }
        return { attempts: attempt, lastStatus, lastBody, lastError };
    }
};
exports.WebhooksService = WebhooksService;
exports.WebhooksService = WebhooksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], WebhooksService);
//# sourceMappingURL=webhooks.service.js.map