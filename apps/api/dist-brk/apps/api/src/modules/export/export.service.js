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
exports.ExportService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const security_service_1 = require("../security/security.service");
let ExportService = class ExportService {
    constructor(db, security) {
        this.db = db;
        this.security = security;
    }
    async exportWorkspace(workspaceId, actor) {
        // §2 per-item privacy: when an actor is supplied, drop private tasks/lists
        // they may not see. Admin / super-admin exporters resolve as managers
        // (undefined filter) and still get everything.
        let taskVis;
        let listVis;
        if (actor) {
            const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actor.id, actor.role);
            taskVis = (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, isManager);
            listVis = (0, item_visibility_1.listVisibilityFilter)(actor.id, isManager);
        }
        // Load all workspace data in parallel
        const [wsData, membersData, spacesData, projectsData, listsData, tasksData, goalsData, sprintsData, formsData,] = await Promise.all([
            this.db.select().from(db_1.workspaces).where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId)),
            this.db
                .select({
                userId: db_1.workspaceMembers.userId,
                role: db_1.workspaceMembers.role,
                joinedAt: db_1.workspaceMembers.joinedAt,
                email: db_1.users.email,
                displayName: db_1.users.displayName,
            })
                .from(db_1.workspaceMembers)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
                .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId)),
            this.db.select().from(db_1.spaces).where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)),
            this.db
                .select()
                .from(db_1.projects)
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
                .where((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)),
            this.db
                .select()
                .from(db_1.lists)
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), listVis)),
            this.db
                .select()
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.tasks.listId, db_1.lists.id))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), taskVis)),
            this.db.select().from(db_1.goals).where((0, drizzle_orm_1.eq)(db_1.goals.workspaceId, workspaceId)),
            this.db.select().from(db_1.sprints).where((0, drizzle_orm_1.eq)(db_1.sprints.workspaceId, workspaceId)),
            this.db.select().from(db_1.forms).where((0, drizzle_orm_1.eq)(db_1.forms.workspaceId, workspaceId)),
        ]);
        return {
            workspace: wsData[0] ?? {},
            members: membersData,
            spaces: spacesData,
            projects: projectsData.map((r) => r.projects ?? r),
            lists: listsData.map((r) => r.lists ?? r),
            tasks: tasksData.map((r) => r.tasks ?? r),
            goals: goalsData,
            sprints: sprintsData,
            forms: formsData.map((f) => ({ ...f, fields: [] })), // fields loaded separately to keep response lean
            exportedAt: new Date().toISOString(),
        };
    }
    async logExport(workspaceId, actorId, format, scope, counts, ipAddress) {
        await this.security.logAuditEvent({
            workspaceId,
            actorId,
            action: 'data.exported',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: `Exported workspace ${scope} as ${format.toUpperCase()}`,
            metadata: { format, scope, ...(counts ?? {}) },
            ipAddress,
        });
    }
    /**
     * §A4.1 roster export. Takes the same rows the People screen renders, so the
     * spreadsheet an admin hands to finance or an auditor can never disagree with
     * what is on screen.
     */
    membersToCsv(members) {
        const headers = [
            'Name',
            'Email',
            'Role',
            'Weekly capacity (h)',
            'Teams',
            'Joined',
            'Invited on',
            'Invited by',
            'Last active',
        ];
        const iso = (value) => value ? new Date(value).toISOString() : '';
        const rows = members.map((m) => [
            m.displayName ?? '',
            m.email ?? '',
            m.role ?? '',
            m.weeklyCapacityHours ?? '',
            (m.teams ?? []).join('; '),
            iso(m.joinedAt),
            iso(m.invitedAt),
            m.invitedByName ?? '',
            iso(m.lastSeenAt),
        ]);
        const escape = (value) => {
            const s = String(value ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
    }
    exportToCsv(tasks) {
        const headers = ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created At', 'List ID'];
        const rows = tasks.map((t) => {
            const task = t.tasks ?? t;
            return [
                task.id ?? '',
                `"${(task.title ?? '').replace(/"/g, '""')}"`,
                task.status ?? '',
                task.priority ?? '',
                task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
                task.createdAt ? new Date(task.createdAt).toISOString() : '',
                task.listId ?? '',
            ].join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }
};
exports.ExportService = ExportService;
exports.ExportService = ExportService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService])
], ExportService);
//# sourceMappingURL=export.service.js.map