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
| Custom statuses per List | **Missing** | High | Task `status` is a fixed `pgEnum` of 6 values (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled`). ClickUp's hallmark fully-customisable status pipelines per Space/List are not present. Closing this gap is a schema-rewrite of `task_status_enum` → `list_statuses` join table and touches every status reader. |

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

- Functional parity: `~96-98%`
- Partial parity: `~2-3%` (Calendar OAuth without two-way event sync; status-enum prevents fully-custom workflows)
- UI-only/demo parity: `~0-1%`
- Missing: `~1-2%` (see below)
- UI/UX parity vs ClickUp patterns: `~75-82%` (bulk-action bar, public doc share, keyboard-shortcuts overlay closed since last pass)

## Known remaining gaps

### Honest list of what ClickUp has and we don't

| Gap | Severity | Effort to close |
|---|---|---|
| **Custom statuses per List** | High (foundational ClickUp differentiator) | Big — DB enum → join table migration, plus rewrites at every status reader / board column / automation trigger |
| **Bidirectional Google Calendar / Outlook sync** | Medium | Medium — OAuth scope and `gcal` provider already wired in `integration-connections.service.ts`, but no event push/pull logic; needs a sync worker + iCal feed |
| **Email-to-task (inbound mailbox)** | Medium | Medium — needs an inbound SMTP webhook or provider (Postmark/Mailgun) and a parser that creates tasks with reply-to threading |
| **Single-task templates** | Low | Low — existing `project_templates` table already covers most use cases via "starter project"; ClickUp adds a separate save-as-task-template flow. Deferred until users ask. |
| **Custom roles & permissions** | Low | Medium — current roles are fixed (`admin`/`manager`/`member`/`guest`); ClickUp adds custom roles you can scope. |

### Code-quality

- **Pre-existing lint warnings**: 45 non-blocking `react-hooks/exhaustive-deps` style warnings remain across older surfaces. No errors.
- **Tests**: 24/24 unit tests pass. SSO, SCIM (auth + discovery + groups), and workspace-group invariants have unit coverage; deeper Drizzle-driven integration tests for SCIM PATCH/replace flows would be future work.
