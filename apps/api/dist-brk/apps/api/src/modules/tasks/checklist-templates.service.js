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
exports.ChecklistTemplatesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/** Longest a template name may be, and the most items one may carry. */
const MAX_NAME = 200;
const MAX_ITEMS = 200;
/**
 * Reusable checklists a task can be seeded from — the client's "main template
 * se bhi checklist kar sakti hoon".
 *
 * Applying copies rows rather than pointing at the template, so editing a
 * template later never rewrites checklists already made from it.
 */
let ChecklistTemplatesService = class ChecklistTemplatesService {
    constructor(db) {
        this.db = db;
    }
    /** The workspace a task belongs to, walking list → project → space. */
    async workspaceOfTask(taskId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Task not found');
        return row.workspaceId;
    }
    async assertMember(workspaceId, userId) {
        const [m] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!m)
            throw new common_1.ForbiddenException('Workspace membership required');
    }
    /** Templates available in a workspace, newest first, with their items. */
    async list(workspaceId, userId) {
        await this.assertMember(workspaceId, userId);
        const rows = await this.db
            .select()
            .from(db_1.checklistTemplates)
            .where((0, drizzle_orm_1.eq)(db_1.checklistTemplates.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.checklistTemplates.name));
        if (rows.length === 0)
            return [];
        const items = await this.db
            .select()
            .from(db_1.checklistTemplateItems)
            .where((0, drizzle_orm_1.inArray)(db_1.checklistTemplateItems.templateId, rows.map((r) => r.id)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.checklistTemplateItems.position));
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            createdAt: r.createdAt,
            items: items
                .filter((i) => i.templateId === r.id)
                .map((i) => ({ id: i.id, content: i.content, position: i.position })),
        }));
    }
    async create(workspaceId, userId, input) {
        await this.assertMember(workspaceId, userId);
        const name = (input.name ?? '').trim();
        if (!name)
            throw new common_1.BadRequestException('A template name is required');
        if (name.length > MAX_NAME)
            throw new common_1.BadRequestException(`Name must be ${MAX_NAME} characters or fewer`);
        const contents = (input.items ?? []).map((c) => c.trim()).filter(Boolean);
        if (contents.length > MAX_ITEMS)
            throw new common_1.BadRequestException(`A template may hold at most ${MAX_ITEMS} items`);
        const [tpl] = await this.db
            .insert(db_1.checklistTemplates)
            .values({ workspaceId, name, createdById: userId })
            .returning();
        if (contents.length) {
            await this.db.insert(db_1.checklistTemplateItems).values(contents.map((content, position) => ({ templateId: tpl.id, content, position })));
        }
        return { id: tpl.id, name: tpl.name, itemCount: contents.length };
    }
    /**
     * Save an existing checklist as a template, so a list someone already built
     * by hand can be reused instead of retyped.
     */
    async createFromChecklist(checklistId, userId, name) {
        const [cl] = await this.db.select().from(db_1.taskChecklists).where((0, drizzle_orm_1.eq)(db_1.taskChecklists.id, checklistId)).limit(1);
        if (!cl)
            throw new common_1.NotFoundException('Checklist not found');
        const workspaceId = await this.workspaceOfTask(cl.taskId);
        await this.assertMember(workspaceId, userId);
        const items = await this.db
            .select({ content: db_1.taskChecklistItems.content })
            .from(db_1.taskChecklistItems)
            .where((0, drizzle_orm_1.eq)(db_1.taskChecklistItems.checklistId, checklistId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.taskChecklistItems.position));
        return this.create(workspaceId, userId, {
            name: (name ?? cl.title).trim() || cl.title,
            items: items.map((i) => i.content),
        });
    }
    /**
     * Drop a template onto a task as a fresh checklist. Items are copied, and
     * they start unchecked and unassigned — a template describes the work, not
     * who did it last time.
     */
    async applyToTask(taskId, templateId, userId) {
        const workspaceId = await this.workspaceOfTask(taskId);
        await this.assertMember(workspaceId, userId);
        const [tpl] = await this.db
            .select()
            .from(db_1.checklistTemplates)
            .where((0, drizzle_orm_1.eq)(db_1.checklistTemplates.id, templateId))
            .limit(1);
        if (!tpl)
            throw new common_1.NotFoundException('Checklist template not found');
        // Templates are workspace-scoped; refuse one borrowed from another tenant.
        if (tpl.workspaceId !== workspaceId) {
            throw new common_1.NotFoundException('Checklist template not found');
        }
        const tplItems = await this.db
            .select()
            .from(db_1.checklistTemplateItems)
            .where((0, drizzle_orm_1.eq)(db_1.checklistTemplateItems.templateId, templateId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.checklistTemplateItems.position));
        // Append after whatever checklists the task already has.
        const existing = await this.db
            .select({ position: db_1.taskChecklists.position })
            .from(db_1.taskChecklists)
            .where((0, drizzle_orm_1.eq)(db_1.taskChecklists.taskId, taskId));
        const nextPos = existing.reduce((max, r) => Math.max(max, r.position + 1), 0);
        const [checklist] = await this.db
            .insert(db_1.taskChecklists)
            .values({ taskId, title: tpl.name, position: nextPos })
            .returning();
        if (tplItems.length) {
            await this.db.insert(db_1.taskChecklistItems).values(tplItems.map((i, position) => ({ checklistId: checklist.id, content: i.content, position })));
        }
        return { id: checklist.id, title: checklist.title, itemCount: tplItems.length };
    }
    async remove(templateId, userId) {
        const [tpl] = await this.db
            .select()
            .from(db_1.checklistTemplates)
            .where((0, drizzle_orm_1.eq)(db_1.checklistTemplates.id, templateId))
            .limit(1);
        if (!tpl)
            throw new common_1.NotFoundException('Checklist template not found');
        await this.assertMember(tpl.workspaceId, userId);
        // Items cascade with the template row.
        await this.db.delete(db_1.checklistTemplates).where((0, drizzle_orm_1.eq)(db_1.checklistTemplates.id, templateId));
        return { ok: true };
    }
};
exports.ChecklistTemplatesService = ChecklistTemplatesService;
exports.ChecklistTemplatesService = ChecklistTemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ChecklistTemplatesService);
//# sourceMappingURL=checklist-templates.service.js.map