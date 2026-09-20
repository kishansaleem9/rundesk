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
exports.SlackService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../../common/database/database.module");
let SlackService = class SlackService {
    constructor(db) {
        this.db = db;
    }
    async get(workspaceId) {
        const [row] = await this.db
            .select()
            .from(db_1.slackIntegrations)
            .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.workspaceId, workspaceId))
            .limit(1);
        if (!row)
            return null;
        // Don't leak the full URL to the UI — just show the host fragment.
        return {
            id: row.id,
            isEnabled: row.isEnabled,
            channelName: row.channelName,
            eventFilters: row.eventFilters,
            successCount: row.successCount,
            failureCount: row.failureCount,
            lastNotifiedAt: row.lastNotifiedAt,
            webhookUrlHint: this.hint(row.webhookUrl),
            createdAt: row.createdAt,
        };
    }
    async connect(workspaceId, userId, dto) {
        if (!/^https:\/\/hooks\.slack\.com\//.test(dto.webhookUrl)) {
            throw new common_1.BadRequestException('Invalid Slack incoming webhook URL');
        }
        // Upsert: a workspace has exactly one Slack integration.
        const existing = await this.db
            .select()
            .from(db_1.slackIntegrations)
            .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.workspaceId, workspaceId))
            .limit(1);
        if (existing[0]) {
            const [row] = await this.db
                .update(db_1.slackIntegrations)
                .set({
                webhookUrl: dto.webhookUrl,
                channelName: dto.channelName,
                eventFilters: dto.eventFilters ?? [],
                isEnabled: true,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.id, existing[0].id))
                .returning();
            return this.shape(row);
        }
        const [row] = await this.db
            .insert(db_1.slackIntegrations)
            .values({
            workspaceId,
            webhookUrl: dto.webhookUrl,
            channelName: dto.channelName,
            eventFilters: dto.eventFilters ?? [],
            createdById: userId,
        })
            .returning();
        return this.shape(row);
    }
    async update(workspaceId, patch) {
        const existing = await this.db
            .select()
            .from(db_1.slackIntegrations)
            .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.workspaceId, workspaceId))
            .limit(1);
        if (!existing[0])
            throw new common_1.NotFoundException('Slack integration not configured');
        const [row] = await this.db
            .update(db_1.slackIntegrations)
            .set({ ...patch, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.id, existing[0].id))
            .returning();
        return this.shape(row);
    }
    async disconnect(workspaceId) {
        await this.db.delete(db_1.slackIntegrations).where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.workspaceId, workspaceId));
        return { ok: true };
    }
    async test(workspaceId) {
        const [row] = await this.db
            .select()
            .from(db_1.slackIntegrations)
            .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.workspaceId, workspaceId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Slack integration not configured');
        await this.post(row.webhookUrl, {
            text: ':white_check_mark: Test message from Rundesk — your Slack integration is working.',
        });
        return { ok: true };
    }
    /**
     * Public entry point: called by other modules (TasksService) when an
     * event is worth notifying about. Resolves the workspace's Slack
     * integration if any, applies event filters, and posts.
     */
    matches(filters, event) {
        return filters.length === 0 || filters.includes(event) || filters.includes('*');
    }
    async notify(workspaceId, event, message, opts = {}) {
        // 1) The default single integration (all projects).
        const [row] = await this.db
            .select()
            .from(db_1.slackIntegrations)
            .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.workspaceId, workspaceId))
            .limit(1);
        if (row && row.isEnabled && this.matches(row.eventFilters, event)) {
            try {
                await this.post(row.webhookUrl, { text: message });
                await this.db
                    .update(db_1.slackIntegrations)
                    .set({ successCount: row.successCount + 1, lastNotifiedAt: new Date(), updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.id, row.id));
            }
            catch {
                await this.db
                    .update(db_1.slackIntegrations)
                    .set({ failureCount: row.failureCount + 1, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(db_1.slackIntegrations.id, row.id));
            }
        }
        // 2) Per-channel routing rules — event filter + optional project scope (§12).
        const rules = await this.db
            .select()
            .from(db_1.slackRoutingRules)
            .where((0, drizzle_orm_1.eq)(db_1.slackRoutingRules.workspaceId, workspaceId));
        for (const rule of rules) {
            if (!rule.isEnabled)
                continue;
            if (!this.matches(rule.eventFilters, event))
                continue;
            if (rule.projectId && rule.projectId !== opts.projectId)
                continue;
            try {
                await this.post(rule.webhookUrl, { text: message });
            }
            catch {
                // best-effort per rule
            }
        }
    }
    // ── Per-channel routing rules ─────────────────────────────────────────────
    listRules(workspaceId) {
        return this.db
            .select({
            id: db_1.slackRoutingRules.id,
            channelName: db_1.slackRoutingRules.channelName,
            projectId: db_1.slackRoutingRules.projectId,
            eventFilters: db_1.slackRoutingRules.eventFilters,
            isEnabled: db_1.slackRoutingRules.isEnabled,
            webhookUrl: db_1.slackRoutingRules.webhookUrl,
            createdAt: db_1.slackRoutingRules.createdAt,
        })
            .from(db_1.slackRoutingRules)
            .where((0, drizzle_orm_1.eq)(db_1.slackRoutingRules.workspaceId, workspaceId))
            .then((rows) => rows.map((r) => ({ ...r, webhookUrl: undefined, webhookUrlHint: this.hint(r.webhookUrl) })));
    }
    async addRule(workspaceId, userId, dto) {
        if (!/^https:\/\/hooks\.slack\.com\//.test(dto.webhookUrl ?? '')) {
            throw new common_1.BadRequestException('Invalid Slack incoming webhook URL');
        }
        const [rule] = await this.db
            .insert(db_1.slackRoutingRules)
            .values({
            workspaceId,
            webhookUrl: dto.webhookUrl,
            channelName: dto.channelName ?? null,
            projectId: dto.projectId ?? null,
            eventFilters: dto.eventFilters ?? [],
            createdById: userId,
        })
            .returning();
        return { ...rule, webhookUrl: undefined, webhookUrlHint: this.hint(rule.webhookUrl) };
    }
    async removeRule(id, workspaceId) {
        await this.db
            .delete(db_1.slackRoutingRules)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.slackRoutingRules.id, id), (0, drizzle_orm_1.eq)(db_1.slackRoutingRules.workspaceId, workspaceId)));
        return { ok: true };
    }
    async post(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Slack returned ${res.status}: ${text.slice(0, 200)}`);
        }
    }
    shape(row) {
        return {
            id: row.id,
            isEnabled: row.isEnabled,
            channelName: row.channelName,
            eventFilters: row.eventFilters,
            successCount: row.successCount,
            failureCount: row.failureCount,
            lastNotifiedAt: row.lastNotifiedAt,
            webhookUrlHint: this.hint(row.webhookUrl),
            createdAt: row.createdAt,
        };
    }
    hint(url) {
        // hooks.slack.com/services/T0XXXX/B0YYYY/abcdef -> mask the secret
        return url.replace(/(\/services\/[^/]+\/[^/]+\/).*/, '$1******');
    }
};
exports.SlackService = SlackService;
exports.SlackService = SlackService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], SlackService);
//# sourceMappingURL=slack.service.js.map