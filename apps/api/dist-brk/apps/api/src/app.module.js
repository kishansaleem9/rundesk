"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const csrf_guard_1 = require("./common/guards/csrf.guard");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const workspaces_module_1 = require("./modules/workspaces/workspaces.module");
const organizations_module_1 = require("./modules/organizations/organizations.module");
const invitations_module_1 = require("./modules/invitations/invitations.module");
const feature_flags_module_1 = require("./modules/feature-flags/feature-flags.module");
const spaces_module_1 = require("./modules/spaces/spaces.module");
const projects_module_1 = require("./modules/projects/projects.module");
const clients_module_1 = require("./modules/clients/clients.module");
const folders_module_1 = require("./modules/folders/folders.module");
const trash_module_1 = require("./modules/trash/trash.module");
const shares_module_1 = require("./modules/shares/shares.module");
const container_members_module_1 = require("./modules/container-members/container-members.module");
const lists_module_1 = require("./modules/lists/lists.module");
const tasks_module_1 = require("./modules/tasks/tasks.module");
const meetings_module_1 = require("./modules/meetings/meetings.module");
const bookmarks_module_1 = require("./modules/bookmarks/bookmarks.module");
const calls_module_1 = require("./modules/calls/calls.module");
const labels_module_1 = require("./modules/labels/labels.module");
const docs_module_1 = require("./modules/docs/docs.module");
const chat_module_1 = require("./modules/chat/chat.module");
const goals_module_1 = require("./modules/goals/goals.module");
const favorites_module_1 = require("./modules/favorites/favorites.module");
const reminders_module_1 = require("./modules/reminders/reminders.module");
const presence_module_1 = require("./modules/presence/presence.module");
// §G06 [05:35] — the person profile panel: who somebody is and what they are on.
const people_module_1 = require("./modules/people/people.module");
const time_off_module_1 = require("./modules/time-off/time-off.module");
const personal_tasks_module_1 = require("./modules/personal-tasks/personal-tasks.module");
const skills_module_1 = require("./modules/skills/skills.module");
const sprints_module_1 = require("./modules/sprints/sprints.module");
const time_entries_module_1 = require("./modules/time-entries/time-entries.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const views_module_1 = require("./modules/views/views.module");
const planner_module_1 = require("./modules/planner/planner.module");
const forms_module_1 = require("./modules/forms/forms.module");
const automations_module_1 = require("./modules/automations/automations.module");
const ai_module_1 = require("./modules/ai/ai.module");
const reports_module_1 = require("./modules/reports/reports.module");
const security_module_1 = require("./modules/security/security.module");
const export_module_1 = require("./modules/export/export.module");
const webhooks_module_1 = require("./modules/webhooks/webhooks.module");
const inbound_webhooks_module_1 = require("./modules/inbound-webhooks/inbound-webhooks.module");
const zapier_module_1 = require("./modules/zapier/zapier.module");
const slack_module_1 = require("./modules/integrations/slack/slack.module");
const clickup_import_module_1 = require("./modules/integrations/clickup-import/clickup-import.module");
const integration_connections_module_1 = require("./modules/integrations/connections/integration-connections.module");
const external_link_sync_module_1 = require("./modules/integrations/external-link-sync/external-link-sync.module");
const project_templates_module_1 = require("./modules/project-templates/project-templates.module");
const custom_fields_module_1 = require("./modules/custom-fields/custom-fields.module");
const search_module_1 = require("./modules/search/search.module");
const realtime_module_1 = require("./modules/realtime/realtime.module");
const health_module_1 = require("./modules/health/health.module");
const dashboards_module_1 = require("./modules/dashboards/dashboards.module");
const database_module_1 = require("./common/database/database.module");
const storage_module_1 = require("./common/storage/storage.module");
const clips_module_1 = require("./modules/clips/clips.module");
const canvases_module_1 = require("./modules/canvases/canvases.module");
const announcements_module_1 = require("./modules/announcements/announcements.module");
const sso_module_1 = require("./modules/sso/sso.module");
const workspace_groups_module_1 = require("./modules/workspace-groups/workspace-groups.module");
const calendar_sync_module_1 = require("./modules/calendar-sync/calendar-sync.module");
const email_to_task_module_1 = require("./modules/email-to-task/email-to-task.module");
const custom_roles_module_1 = require("./modules/custom-roles/custom-roles.module");
const task_templates_module_1 = require("./modules/task-templates/task-templates.module");
const sample_data_module_1 = require("./modules/sample-data/sample-data.module");
const billing_module_1 = require("./modules/billing/billing.module");
const support_module_1 = require("./modules/support/support.module");
const client_portal_module_1 = require("./modules/client-portal/client-portal.module");
const ops_module_1 = require("./modules/ops/ops.module");
const client_invoicing_module_1 = require("./modules/client-invoicing/client-invoicing.module");
const tenant_databases_module_1 = require("./modules/tenant-databases/tenant-databases.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: [
                    // App-local override first, then the monorepo root .env
                    '.env',
                    '../../.env',
                ],
            }),
            schedule_1.ScheduleModule.forRoot(),
            database_module_1.DatabaseModule,
            storage_module_1.StorageModule,
            realtime_module_1.RealtimeModule,
            search_module_1.SearchModule,
            health_module_1.HealthModule,
            users_module_1.UsersModule,
            auth_module_1.AuthModule,
            organizations_module_1.OrganizationsModule,
            invitations_module_1.InvitationsModule,
            workspaces_module_1.WorkspacesModule,
            feature_flags_module_1.FeatureFlagsModule,
            spaces_module_1.SpacesModule,
            projects_module_1.ProjectsModule,
            clients_module_1.ClientsModule,
            folders_module_1.FoldersModule,
            trash_module_1.TrashModule,
            shares_module_1.SharesModule,
            container_members_module_1.ContainerMembersModule,
            lists_module_1.ListsModule,
            tasks_module_1.TasksModule,
            meetings_module_1.MeetingsModule,
            bookmarks_module_1.BookmarksModule,
            calls_module_1.CallsModule,
            labels_module_1.LabelsModule,
            docs_module_1.DocsModule,
            chat_module_1.ChatModule,
            goals_module_1.GoalsModule,
            favorites_module_1.FavoritesModule,
            reminders_module_1.RemindersModule,
            presence_module_1.PresenceModule,
            people_module_1.PeopleModule,
            time_off_module_1.TimeOffModule,
            personal_tasks_module_1.PersonalTasksModule,
            skills_module_1.SkillsModule,
            sprints_module_1.SprintsModule,
            time_entries_module_1.TimeEntriesModule,
            notifications_module_1.NotificationsModule,
            views_module_1.ViewsModule,
            planner_module_1.PlannerModule,
            forms_module_1.FormsModule,
            automations_module_1.AutomationsModule,
            ai_module_1.AiModule,
            reports_module_1.ReportsModule,
            security_module_1.SecurityModule,
            export_module_1.ExportModule,
            webhooks_module_1.WebhooksModule,
            inbound_webhooks_module_1.InboundWebhooksModule,
            zapier_module_1.ZapierModule,
            slack_module_1.SlackModule,
            clickup_import_module_1.ClickUpImportModule,
            integration_connections_module_1.IntegrationConnectionsModule,
            external_link_sync_module_1.ExternalLinkSyncModule,
            project_templates_module_1.ProjectTemplatesModule,
            custom_fields_module_1.CustomFieldsModule,
            dashboards_module_1.DashboardsModule,
            clips_module_1.ClipsModule,
            canvases_module_1.CanvasesModule,
            announcements_module_1.AnnouncementsModule,
            sso_module_1.SsoModule,
            workspace_groups_module_1.WorkspaceGroupsModule,
            calendar_sync_module_1.CalendarSyncModule,
            email_to_task_module_1.EmailToTaskModule,
            custom_roles_module_1.CustomRolesModule,
            task_templates_module_1.TaskTemplatesModule,
            sample_data_module_1.SampleDataModule,
            billing_module_1.BillingModule,
            support_module_1.SupportModule,
            client_portal_module_1.ClientPortalModule,
            ops_module_1.OpsModule,
            client_invoicing_module_1.ClientInvoicingModule,
            tenant_databases_module_1.TenantDatabasesModule,
        ],
        providers: [
            // Global double-submit CSRF guard. It only enforces on cookie-authenticated,
            // state-changing requests; Bearer and safe (GET/HEAD/OPTIONS) requests pass
            // through untouched, so existing API clients are unaffected.
            { provide: core_1.APP_GUARD, useClass: csrf_guard_1.CsrfGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map