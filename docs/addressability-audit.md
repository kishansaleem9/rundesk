# The addressability audit

An audit for repeats of four defect classes that had just been fixed one at a
time, and the fixes for what it found. Run after the reported symptom "I have no
idea where tasks are going" turned out to be one instance of a pattern rather
than a bug of its own.

## The four classes

| | Class | Smell |
|---|---|---|
| **A** | No address | Feature state in `useState` that a user would want to link to, bookmark, or come back to |
| **B** | Context-loss dead end | A route you can reach but cannot leave |
| **C** | Post-limit filtering | `LIMIT` applied, and only then rows the caller may not see are dropped |
| **D** | Built but not joined up | A feature that works and nothing leads to |

Class C is the one that had already reached production twice: Meilisearch
returned `limit` hits and archived ones were filtered out afterwards, so a
search could answer "nothing" while live matching tasks existed.

## What was fixed

| # | Finding | Where |
|---|---|---|
| 1 | ⌘K hid every result that matched on body text | `command-palette.tsx` |
| 2 | `/app/profile` and `/app/help` had no way back; the sidebar named no workspace | `workspace-sidebar.tsx`, `last-workspace.ts` |
| 3 | Opening a task never wrote `?task=` | `…$listId.tsx` |
| 4 | Sprints was unreachable from anywhere | `workspace-sidebar.tsx`, `command-palette.tsx` |
| 5 | Chat channel and thread were not addressable | `workspace-chat-page.tsx` |
| 6 | Which doc is open was not addressable | `docs-panel.tsx` |
| 7 | A shareable dashboard preset had no link | `app.$workspaceId.dashboard.tsx` |
| 8 | Dashboard counted the viewer's work out of a 500-row window | `tasks.service.ts`, dashboard |
| 9 | `?tab=` read once, never written, on four pages | settings, profile, reports, form builder |

Every fix carries checks that were **run against the unfixed code first**, to
establish they fail. Three would not have:

- The docs check first asserted on page text, and passed unfixed — the tree
  lists every doc, so the title appeared whatever the editor showed. Anchored
  on the active-doc heading instead.
- The first chat control run hand-reverted the URL logic into a broken hybrid
  that failed at the composer, proving nothing. The honest control is the
  original file plus only the new testids.
- The `?task=` control was contaminated by an ambiguous locator: `getByText`
  with `exact: false` also matched a sibling task created by an earlier check.

## Two tests were leaning on the bug

Both invisible while closing a task sheet left the address untouched:

- `task-depth` "renders as a real table" blurs the editor by clicking
  `body(5,5)`, which also lands on the sheet's full-screen overlay and closes
  it. The following reload only restored the sheet because `?task=` was stale.
- `ui-sweep` reloads and calls `openAnyTask()` again. With the sheet now
  surviving a reload, that click hit the overlay and timed out. CI caught this
  one; local runs had not, because only the suites judged relevant were being
  run. The whole Postgres-harness set is run before pushing now.

## Coverage — what this does not establish

- **`packages/db`, `packages/ui` internals, and everything outside
  `apps/web/src` and `apps/api/src` were not looked at.**
- **Class A was not swept exhaustively.** Automations, goals, skills, clips,
  whiteboards, templates, import, integrations, replies, shared, timeline,
  meetings and the space/project routes were pattern-scanned, not read.
  Whiteboards holds `activeBoardId` in `useState` with the same shape as the
  mind-maps case, which was rejected on impact; the same verdict probably
  applies, but it was not examined.
- **Class C in the API beyond the endpoints swept.** Candidates in AI knowledge
  retrieval, the notifications list and the external-link refresh cron were each
  rejected on reading, for reasons recorded in the audit. If more exist, this
  did not find them.
- **Severity of #8 depends on workspace size.** It was demonstrated with 600
  seeded tasks; under a few hundred it is invisible.
- Roughly two dozen candidate findings were rejected during verification. The
  ones most likely to be re-reported: list-detail toolbar state (saved views
  restore it on mount, and named views are the deliberate share mechanism);
  mind maps and whiteboards (edits persist server-side, one click to recover);
  the Insights page (unlinked in nav, but a live notification destination whose
  content is duplicated on Home and Reports).
