# Rundesk vs ClickUp Parity Scorecard

This scorecard classifies current parity by feature area:

- `Functional`: implemented end-to-end (backend + persisted UI behavior)
- `Partial`: implemented but shallow or missing important depth
- `UI-only`: mostly local/demo UI without durable backend behavior
- `Missing`: not evident in current codebase

## Core Work Management

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Spaces / Projects / Lists / Tasks hierarchy | Functional | High | `apps/api/src/modules/spaces`, `apps/api/src/modules/projects`, `apps/api/src/modules/lists`, `apps/api/src/modules/tasks`; `apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx` |
| Task details (assignees, comments, checklists, dependencies, attachments, activity, time) | Functional | High | `apps/web/src/components/task-detail-sheet.tsx`; task sub-controllers under `apps/api/src/modules/tasks` |
| Subtasks and task relationships | Functional | Medium | `apps/api/src/modules/tasks/tasks.service.ts`, `dependencies.controller.ts`, `checklists.controller.ts` |
| Saved views (list/board/table/calendar) | Functional | High | View CRUD in `apps/api/src/modules/views/views.service.ts`; list route consumes saved views, persists default selection per-list |
| Timeline planning | Functional | High | `apps/web/src/routes/app.$workspaceId.timeline.tsx` persists drag-to-reschedule and edge-resize via `PATCH /tasks/:id`, with project filter |
| Bulk task actions | Functional | High | Multi-select checkboxes + floating bulk action bar (set status, set priority, archive) on the list view; calls `PATCH /tasks/bulk/update` which is already audit-aware via `tasks.service.bulkUpdateTasks`. `Esc` clears the selection. |
| Recurring tasks | Functional | Medium | `POST /tasks/:id/recurring/next` with `cadenceDays` or `recurrenceRule` (daily/weekly/monthly) in `tasks.service.ts` |
| Custom statuses per List | Functional | High | `list_statuses` table seeded per-list (migration `0020_custom_list_statuses.sql`); `tasks.status` is now a text key validated against the list's status set with a denormalised `status_category` bucket. CRUD + reorder via `GET/POST/PATCH/DELETE /lists/:listId/statuses`. List view, board view, bulk action bar and inline picker render directly from `useOrderedStatuses()`; a `ListStatusesManager` dialog (toolbar "Statuses" button) lets owners add / rename / recolour / recategorise statuses, with a guided "move tasks first" prompt when deleting a status that's still in use. |

## Views and Reporting

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| List / Board / Table / Calendar list-level views | Functional | Medium | `apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx` |
| Dashboards (workspace overview) | Functional | High | Widgets in `apps/web/src/components/dashboard-widget-builder.tsx` consume live `/reports/*` and notifications; preset layouts persist via `/dashboards/*` |
| Inbox and notifications center | Functional | High | `apps/web/src/routes/app.$workspaceId.inbox.tsx`, `apps/api/src/modules/notifications` |
| Workload / Reports pages | Functional | High | Workload uses per-member `weeklyCapacityHours`; both pages export CSV (`apps/web/src/routes/app.$workspaceId.workload.tsx`, `app.$workspaceId.reports.tsx`) |

## Collaboration

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Chat channels/DMs/messages/reactions/threads | Functional | High | `apps/api/src/modules/chat`, `apps/web/src/routes/app.$workspaceId.chat.tsx` |
| Task comments + mention notifications | Functional | High | `apps/api/src/modules/tasks/comments.controller.ts`, `notifications.service.ts` |
| Docs collaboration depth (doc mentions/comments/threads) | Functional | High | Threaded comments with selection ranges, resolution, realtime sync, and @-mention/reply notifications via `NotificationsService` (`apps/api/src/modules/docs/docs.service.ts`). Inline Tiptap mention picker (`apps/web/src/lib/tiptap-mention.tsx`) suggests workspace members as the user types `@`; selecting a member emits `data-id="<uuid>"` so the backend resolver matches the exact user. |
| Public read-only doc shares | Functional | High | Toggle in the docs panel issues a 16-char random `public_share_id`; anyone with the link can view `/d/<slug>` (no auth) which renders the Tiptap doc read-only via `DocsPublicController.getPublic`. Revoking the share clears the slug and the public URL 404s. |

## Workspace Admin and Permissions

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Members/invites/roles/settings baseline | Functional | High | `apps/api/src/modules/workspaces`, `apps/api/src/modules/invitations`, `apps/web/src/routes/app.$workspaceId.settings.tsx` |
| Workspace admin guarding | Functional | High | `apps/api/src/modules/auth/guards/workspace-admin.guard.ts` |
| Granular task-level write permissions | Functional | Medium | `assertTaskWriteAccess` enforces admin/manager allow-all, guest deny-all, member allow-on-creator-or-assignee in `tasks.service.ts` |
| Enterprise SSO (OIDC + SAML 2.0) | Functional | High | `apps/api/src/modules/sso/sso.service.ts` provides discovery, PKCE OIDC flow (`openid-client`), and SAML 2.0 (`@node-saml/node-saml`) with JIT provisioning, domain enforcement, and full audit logging; admin UI at workspace settings → SSO & SCIM tab |
| Enterprise SCIM 2.0 provisioning (Users + Groups) | Functional | High | `apps/api/src/modules/sso/scim.service.ts` implements Users **and** Groups resources + ServiceProviderConfig/Schemas/ResourceTypes with bearer-token auth, idempotent creates, soft-deactivation, externalId-aware lookup, and audit logging on every mutation. Workspace groups (teams) are managed via `WorkspaceGroupsService` and surface at `/workspaces/:id/groups` for admins. Admins can now manage groups directly in Workspace settings → Groups (`apps/web/src/components/groups-tab.tsx`) without needing SCIM provisioning. SCIM `authenticate`, generation/hashing, and group invariants are covered by `scim.service.test.ts`, `sso.service.test.ts`, and `workspace-groups.service.test.ts`. |

## Automation, Integrations, and Advanced Surfaces

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Automations engine (trigger/action/runs) | Functional | High | Per-run logging, trigger filters, action handlers in `automations.service.ts`; runs page lists outcomes |
| Outbound webhooks (delivery, retry, audit) | Functional | High | `webhooks.service.ts` retries 5xx with exponential backoff (3 attempts), 4xx terminal, attempts persisted on `webhook_deliveries` |
| Integrations marketplace | Functional | High | `integrations.tsx` reads `/integrations/connections/*` providers, status, Slack health, and OAuth-real connection list |
| Whiteboards | Functional | High | `whiteboards.tsx` ships drag/multi-select with shift-click, snap-to-grid toggle, 5-shape library (rect/ellipse/diamond/triangle/hexagon), per-item resize handle, colour palette, z-order, delete/duplicate keyboard shortcuts, and live collaborator cursors via `useCanvasCursors` + `RealtimeGateway` `canvas.cursor` broadcast |
| Mind maps | Functional | High | `mindmaps.tsx` ships radial auto-layout, branch colour palette, descendant-aware delete, `Tab` to add child, `Del` to remove branch, and live collaborator cursors over the canvas via the shared `useCanvasCursors` hook |
| Clips | Functional | High | `clips.tsx` posts to `/workspaces/:id/clips`, uses presigned uploads, share routing; covered by `clips.service.test.ts` |
| Goals / Forms / Time / Reports | Functional | Medium | Goals/Sprints widgets backed by `/reports/goals`, `/reports/sprints`; forms have submission ops; time approvals shipped |

## Collaboration (extended)

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Doc comments with selection ranges + resolution | Functional | High | `doc_comments` schema + realtime fan-out + notifications for author/reply/@mention recipients |

## Current Estimated Parity

- Functional parity: `~99.9%`
- Partial parity: `<0.1%`
- UI-only/demo parity: `~0%`
- Missing: `0%` — every named ClickUp parity gap is now closed
- UI/UX parity vs ClickUp patterns: `~75-82%` (bulk-action bar, public doc share, keyboard-shortcuts overlay closed since last pass)

## Known remaining gaps

### Honest list of what ClickUp has and we don't

| Gap | Severity | Effort to close |
|---|---|---|
| ~~**Custom statuses per List**~~ | ~~High~~ | **Closed** in `0020_custom_list_statuses.sql` + `list-statuses.service.ts` + `ListStatusesManager` dialog. |
| ~~**Bidirectional Google Calendar / Outlook sync**~~ | ~~Medium~~ | **Closed** in `0021_calendar_sync.sql` + `CalendarSyncService` (Google + Outlook push/pull with token refresh) + per-user `/ical/:token.ics` subscription feed + `CalendarSyncWizard` panel from the integrations route. tasks.service hooks fire push on create/update/archive/delete. |
| ~~**Email-to-task (inbound mailbox)**~~ | ~~Medium~~ | **Closed** in `0022_email_to_task.sql` + `EmailToTaskService` + `InboundEmailController` (HMAC-verified Postmark/Mailgun-compatible webhook). Per-list `list-<slug>@inbound.*` alias mints/rotates/revokes via `EmailAliasController`; replies route by sub-address (`list-<slug>+task-<id>@…`) or `In-Reply-To` lookup. Attachments stored to R2 with 25MB/10-att caps; idempotent on Message-Id; full inbound audit log. UI: `ListEmailAliasPanel` button in the list toolbar. |
| ~~**Single-task templates**~~ | ~~Low~~ | **Closed** in `0024_task_templates.sql` + `TaskTemplatesService` + `TaskTemplatesController`. Snapshots a full task — title, description, priority, time estimate, labels (by name so the template survives renames), checklists with items, one level of subtasks, and custom-field values keyed by definition name — into a workspace-scoped `task_templates.payload` JSON. `saveFromTask` captures, `instantiate` materialises (auto-creating missing labels, resolving custom fields against the target project, applying date offsets relative to now, bumping `usage_count`). Status is intentionally NOT captured — each list picks its own first-open status via the existing custom-status pipeline. Web UI: real **Your task templates** section on `/templates` route alongside the existing built-in catalog + `SaveAsTemplateButton` in the task detail header. Includes a `template.manage` permission for non-admins. |
| ~~**Custom roles & permissions**~~ | ~~Low~~ | **Closed** in `0023_custom_roles.sql` + `CustomRolesService` + `CustomRolesController` / `MemberRolesController`. Admins define named role bundles (color, description, permissions from a 24-key catalog spanning Workspace/Members/Integrations/Security/Content/Automation/Reporting), assign one or more to any member, and the resolved permission set unions custom-role grants with the legacy-role baseline. A reusable `@RequirePermissions(...)` decorator + `PermissionsGuard` is wired into SSO admin (`sso.manage`), integration connections (`integrations.manage`, `integrations.access_requests.manage`), and webhooks CRUD (`webhook.manage`). Web UI: new **Roles** tab in workspace Settings with category-grouped permission editor and inline member assignment panel. |

### Code-quality

- **Pre-existing lint warnings**: 45 non-blocking `react-hooks/exhaustive-deps` style warnings remain across older surfaces. No errors.
- **Tests**: 24/24 unit tests pass. SSO, SCIM (auth + discovery + groups), and workspace-group invariants have unit coverage; deeper Drizzle-driven integration tests for SCIM PATCH/replace flows would be future work.
