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
exports.ZapierService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const webhooks_service_1 = require("../webhooks/webhooks.service");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const SAMPLE_LIMIT = 5;
/**
 * Zapier REST-Hooks surface (Plan §12.4).
 *
 * A Zapier "subscription" is nothing more than one of the platform's existing
 * outbound {@link WebhooksService webhooks} pointed at a Zapier-provided target
 * URL — so subscribe/unsubscribe delegate straight to that service and reuse its
 * delivery pipeline (retries, HMAC signing, delivery log). No Zapier-specific
 * table is introduced.
 */
let ZapierService = class ZapierService {
    constructor(db, webhooks) {
        this.db = db;
        this.webhooks = webhooks;
    }
    /** Zapier calls this to validate the API key and label the connection. */
    async authTest(workspaceId, userId) {
        const [workspace] = await this.db
            .select({ id: db_1.workspaces.id, name: db_1.workspaces.name, slug: db_1.workspaces.slug })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .limit(1);
        let user = null;
        if (userId) {
            const [u] = await this.db
                .select({ id: db_1.users.id, email: db_1.users.email, displayName: db_1.users.displayName })
                .from(db_1.users)
                .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
                .limit(1);
            user = u ?? null;
        }
        return {
            ok: true,
            workspace: workspace ?? { id: workspaceId, name: 'Rundesk', slug: null },
            user,
            // Zapier renders this as the connection label in the account list.
            connectionLabel: workspace ? `Rundesk – ${workspace.name}` : 'Rundesk',
        };
    }
    /**
     * REST-Hook subscribe: create an outbound webhook for `event` aimed at
     * Zapier's `targetUrl`. Returns `{ id }`; Zapier stores it and hands it back
     * to {@link unsubscribe}.
     */
    async subscribe(workspaceId, userId, dto) {
        const event = typeof dto?.event === 'string' ? dto.event.trim() : '';
        const targetUrl = typeof dto?.targetUrl === 'string' ? dto.targetUrl.trim() : '';
        if (!event)
            throw new common_1.BadRequestException('event is required');
        if (!targetUrl)
            throw new common_1.BadRequestException('targetUrl is required');
        const known = this.webhooks.getAvailableEvents();
        if (!known.includes(event)) {
            throw new common_1.BadRequestException(`Unknown event "${event}". Supported: ${known.join(', ')}`);
        }
        const hook = await this.webhooks.create(workspaceId, userId, {
            name: `Zapier · ${event}`,
            url: targetUrl,
            events: [event],
        });
        return { id: hook.id };
    }
    /** REST-Hook unsubscribe: delete the webhook, scoped to the caller's workspace. */
    async unsubscribe(workspaceId, id) {
        return this.webhooks.delete(workspaceId, id);
    }
    /**
     * Perform-list / sample data for a trigger: a few recent, REAL, workspace-
     * scoped items wrapped in the exact envelope the live webhook delivers
     * (`{ id, event, payload, timestamp }`), so a Zap built from the sample maps
     * identically to real deliveries.
     */
    async sample(workspaceId, event, userId) {
        const known = this.webhooks.getAvailableEvents();
        if (!known.includes(event))
            throw new common_1.BadRequestException(`Unknown event "${event}"`);
        // Per-item task privacy (§2): the samples are workspace-scoped, so a private
        // task (or its comments / time entries) must be hidden unless the API-key
        // owner may see it. Managers are unrestricted.
        const actorId = userId ?? '';
        const isManager = actorId ? await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actorId) : false;
        if (event.startsWith('comment.'))
            return this.sampleComments(workspaceId, event, actorId, isManager);
        if (event.startsWith('time.'))
            return this.sampleTimeEntries(workspaceId, event, actorId, isManager);
        if (event.startsWith('task.'))
            return this.sampleTasks(workspaceId, event, actorId, isManager);
        // Other real events (project.*, member.*, form.submitted) have no first-class
        // sample source; an empty list is a valid Zapier perform-list response.
        return [];
    }
    async sampleTasks(workspaceId, event, actorId, isManager) {
        const rows = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            listId: db_1.tasks.listId,
            createdAt: db_1.tasks.createdAt,
            updatedAt: db_1.tasks.updatedAt,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, item_visibility_1.taskVisibilityFilter)(this.db, actorId, isManager)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.createdAt))
            .limit(SAMPLE_LIMIT);
        return rows.map((task) => this.envelope(event, { task }, task.id, task.createdAt));
    }
    async sampleComments(workspaceId, event, actorId, isManager) {
        const rows = await this.db
            .select({
            id: db_1.taskComments.id,
            taskId: db_1.taskComments.taskId,
            authorId: db_1.taskComments.authorId,
            body: db_1.taskComments.body,
            createdAt: db_1.taskComments.createdAt,
        })
            .from(db_1.taskComments)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskComments.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, item_visibility_1.taskVisibilityFilter)(this.db, actorId, isManager)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskComments.createdAt))
            .limit(SAMPLE_LIMIT);
        return rows.map((row) => this.envelope(event, { comment: { id: row.id, taskId: row.taskId, authorId: row.authorId, body: (row.body ?? '').slice(0, 2000) } }, row.id, row.createdAt));
    }
    async sampleTimeEntries(workspaceId, event, actorId, isManager) {
        const rows = await this.db
            .select({
            id: db_1.timeEntries.id,
            taskId: db_1.timeEntries.taskId,
            userId: db_1.timeEntries.userId,
            durationSec: db_1.timeEntries.durationSec,
            isBillable: db_1.timeEntries.isBillable,
            createdAt: db_1.timeEntries.createdAt,
            taskTitle: db_1.tasks.title,
        })
            .from(db_1.timeEntries)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, item_visibility_1.taskVisibilityFilter)(this.db, actorId, isManager)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.timeEntries.createdAt))
            .limit(SAMPLE_LIMIT);
        return rows.map((row) => this.envelope(event, {
            timeEntry: {
                id: row.id,
                taskId: row.taskId,
                userId: row.userId,
                durationSec: row.durationSec ?? 0,
                isBillable: row.isBillable,
            },
            task: { id: row.taskId, title: row.taskTitle },
        }, row.id, row.createdAt));
    }
    /**
     * Same shape WebhooksService.deliver() POSTs, plus a top-level `id` Zapier
     * uses to de-duplicate polled items.
     */
    envelope(event, payload, id, ts) {
        const timestamp = ts instanceof Date ? ts : ts ? new Date(ts) : new Date();
        return { id, event, payload, timestamp: timestamp.toISOString() };
    }
};
exports.ZapierService = ZapierService;
exports.ZapierService = ZapierService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, webhooks_service_1.WebhooksService])
], ZapierService);
//# sourceMappingURL=zapier.service.js.map