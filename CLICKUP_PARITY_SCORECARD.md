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
| Granular task-level write permissions | Functional | Medium | `assertTaskWriteAccess` enforces admin/manager allow-all, guest deny-all, member allow-on-creator-or-assignee in `tasks.service.ts` |
| Enterprise governance depth (SSO/SCIM/audit maturity) | Missing | Low | Audit-log trail is comprehensive; SSO/SCIM modules not yet present |

## Automation, Integrations, and Advanced Surfaces

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Automations engine (trigger/action/runs) | Functional | High | Per-run logging, trigger filters, action handlers in `automations.service.ts`; runs page lists outcomes |
| Outbound webhooks (delivery, retry, audit) | Functional | High | `webhooks.service.ts` retries 5xx with exponential backoff (3 attempts), 4xx terminal, attempts persisted on `webhook_deliveries` |
| Integrations marketplace | Functional | High | `integrations.tsx` reads `/integrations/connections/*` providers, status, Slack health, and OAuth-real connection list |
| Whiteboards | Functional | High | `whiteboards.tsx` reads/writes `/workspaces/:id/canvases?type=whiteboard` with optimistic concurrency |
| Mind maps | Functional | High | `mindmaps.tsx` reads/writes `/workspaces/:id/canvases?type=mindmap` with optimistic concurrency |
| Clips | Functional | High | `clips.tsx` posts to `/workspaces/:id/clips`, uses presigned uploads, share routing; covered by `clips.service.test.ts` |
| Goals / Forms / Time / Reports | Functional | Medium | Goals/Sprints widgets backed by `/reports/goals`, `/reports/sprints`; forms have submission ops; time approvals shipped |

## Collaboration (extended)

| Capability | Status | Confidence | Evidence |
|---|---|---:|---|
| Doc comments with selection ranges + resolution | Functional | High | `doc_comments` schema + realtime fan-out + notifications for author/reply/@mention recipients |

## Current Estimated Parity

- Functional parity: `~85-90%`
- Partial parity: `~5-8%`
- UI-only/demo parity: `~0-2%`
- Missing (enterprise depth: SSO/SCIM): `~5-7%`
- UI/UX parity vs ClickUp patterns: `~60-70%`

## Known remaining gaps

- **Enterprise SSO/SCIM**: no SAML/OIDC/SCIM provisioning modules. Workspace audit log + 2FA + API keys are in place, but enterprise identity federation is not yet wired.
- **Pre-existing lint warnings**: 49 non-blocking `react-hooks/exhaustive-deps` style warnings remain across older surfaces. No errors.
- **Documentation surface depth**: docs comments now match ClickUp parity for threading and resolution; inline mention picker UI (Tiptap mention extension wiring in the Tiptap toolbar) is the next polish step but the backend already resolves mentions three ways.
- **Whiteboard/Mindmap fidelity**: storage + realtime sync are live, but advanced authoring tools (shape libraries, snap-to-grid, collaborator cursors) are still feature-gated.
