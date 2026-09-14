This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Automations

A Trigger + Condition + Action rules engine lives under `lib/automation`, with a
builder UI at [`/automations`](http://localhost:3000/automations) and JSON API
routes under `app/api/automations`.

- `AUTOMATION_REPO=memory` (default): in-memory workflows and mock tasks, no DB needed.
- `AUTOMATION_REPO=prisma`: workflows and run logs persist in MySQL via the
  `Workflow`, `Trigger`, `Condition`, `Action` and `AutomationRun` models.
- Run the unit tests with `npm test` (Vitest, no database required).

## Timesheets

Weekly time tracking against the signed-in user's assigned tasks lives at
[`/timesheets`](http://localhost:3000/timesheets) (linked from the chat sidebar).

- One row per task assigned to the user (via `TaskAssignee`), one column per day,
  with per-task, per-day and weekly totals. Tasks with no time still appear.
- Track time with a per-task timer (one running timer per user, stored server-side
  in `TimeEntry` with `endedAt = NULL`, so it survives refreshes and re-logins),
  or add time manually as a duration ("1h 30m") or an exact start/end range.
- Click any cell to see, edit or delete the individual entries behind it. The
  "Time entries" toggle shows the same week as a list grouped by day; the
  "Tracked time" / "Completed tasks" chips and the sort apply to the grid.
- Server code: `lib/server/time-tracking.ts`; routes under `app/api/timesheets`,
  `app/api/time-entries` and `app/api/timer`; UI in `components/timesheets`.
- Workspace admins/owners may pass `?userId=` to review another member's week.
- Requires the `time_entries` and `timesheet_submissions` migrations: `npm run db:migrate`.

### Approval workflow

- "Submit for approval" sends the week (Monday–Sunday, in the browser's time zone)
  to workspace admins. A `TimesheetSubmission` row per user/week holds the status
  (`SUBMITTED`, `APPROVED`, `REJECTED`), a server-computed total snapshot, the
  submitter's note and the reviewer's note. No row means "not submitted".
- Submitted and approved weeks are **locked**: no entry in them can be created,
  edited or deleted and no timer can be started on those days. The server enforces
  this (409 with `code: "TIMESHEET_LOCKED"`) for everyone, admins included; the
  lock is judged in the zone the week was submitted from. Stopping a timer is
  always allowed. Tasks with time in a locked week cannot be deleted.
- The submitter can withdraw a pending week (`POST /api/timesheets/withdraw`),
  which unlocks it. A rejected week is unlocked, shows the reviewer's note and can
  be resubmitted. Submitting requires the week to have started and no timer to be
  running inside it.
- Capacity bars in the grid header assume an 8h day and a 40h week.

### Admin tabs

Workspace owners and admins get two more tabs on `/timesheets` (members only see
"My timesheet"; the tabs, the viewed member and the week are mirrored in the URL as
`?tab=all|approvals&user=<id>&week=YYYY-MM-DD`, so any view can be shared or reloaded):

- **All timesheets** — one row per workspace member for the chosen week: avatar, name,
  the 40h reference capacity, that week's submission status, a pulsing dot while they
  are tracking, Mon–Sun totals with 8h bars and a weekly total. "Groups" are channels:
  the "All members ▾" dropdown narrows the grid to a channel's members (public channels
  plus private ones the admin belongs to). "Tracked time" hides people without time.
  "Open →" jumps to that person's week. Everyone is bucketed in the viewer's time zone.
  Backed by `GET /api/timesheets/overview?week&tz&channelId`.
- **Approvals** — submitted weeks grouped by week with Pending / Approved / Rejected /
  All chips (with counts) and an "Assigned to me" filter. Each row shows the submitter,
  the total, the status, who is responsible and the actions: **Approve** (one click),
  **Reject** (dialog with an optional note), **Reopen** an approved week (marks it
  rejected so it can be edited), **Open**, and **Assign / Reassign / Unassign** to
  another admin. Assignment is only a responsibility marker: any admin may still
  approve or reject; it survives resubmission and is cleared when the assignee is
  demoted or removed from the workspace. The tab badge counts pending weeks.
  Backed by `GET /api/timesheets/approvals?status&assignedTo=me|none|<id>&userId&week`,
  `PATCH /api/timesheets/approvals/:id { status, reviewNote? }` and
  `PATCH /api/timesheets/approvals/:id/assignee { assigneeId | null }`.

### Track time inside tasks

- Clicking a task in the Tasks panel, a task chip in a message or a task in search
  opens a task detail slide-over: editable title and description, Status, Priority,
  Due date, Assignees and a **Track time** row with a play/stop button, a live clock,
  the task's total tracked time (everyone; "you Xh" when it differs), "Add time" for a
  manual entry and a "View in Timesheets" link. Backed by `GET /api/tasks/:id`, which
  adds `permissions` and a `time` summary to the task.
- The chat top bar shows the running timer (task name, elapsed time, Stop) on every
  screen; clicking the task name opens it. The Tasks panel rows also have play/stop.
- Only assignees, the task creator and workspace admins can track time on a task; a
  week that is pending approval or approved refuses new timers with the usual message.
