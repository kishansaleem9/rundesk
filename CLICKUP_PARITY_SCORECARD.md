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
| Docs collaboration depth (doc mentions/comments/threads) | Functional | High | Threaded comments with selection ranges, resolution, realtime sync, and @-mention/reply notifications via `NotificationsService` (`apps/api/src/modules/docs/docs.service.ts`) |

## Workspace Admin and Permissions

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Members/invites/roles/settings baseline | Functional | High | `apps/api/src/modules/workspaces`, `apps/api/src/modules/invitations`, `apps/web/src/routes/app.$workspaceId.settings.tsx` |
| Workspace admin guarding | Functional | High | `apps/api/src/modules/auth/guards/workspace-admin.guard.ts` |
| Granular task-level write permissions | Partial | Medium | Service-level role checks are being expanded in tasks service |
| Enterprise governance depth (SSO/SCIM/audit maturity) | Missing | Low | Limited evidence in API modules |

## Automation, Integrations, and Advanced Surfaces

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Automations engine (trigger/action/runs) | Partial | High | `apps/api/src/modules/automations/automations.service.ts`, `app.$workspaceId.automations.tsx` |
| Integrations marketplace | UI-only | High | `apps/web/src/routes/app.$workspaceId.integrations.tsx` shows local OAuth simulation |
| Whiteboards | UI-only | High | `apps/web/src/routes/app.$workspaceId.whiteboards.tsx` uses `MOCK_BOARDS` and local state |
| Mind maps | UI-only | High | `apps/web/src/routes/app.$workspaceId.mindmaps.tsx` uses `MOCK_MAPS` and local state |
| Clips | UI-only | High | `apps/web/src/routes/app.$workspaceId.clips.tsx` uses local recordings/list |
| Goals / Forms / Time / Reports | Partial | Medium | Route + API presence with mixed feature completeness |

## Current Estimated Parity

- Functional parity: `~72-78%`
- Partial parity: `~10-15%`
- UI-only/demo parity: `~8-12%`
- UI/UX parity vs ClickUp patterns: `~55-65%`
