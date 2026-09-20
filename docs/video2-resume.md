# Where this stands, and how to pick it up

Written at the end of a session that was itself a recovery: a container was
reclaimed with about eighty-six unpushed commits on it, and a week of work went
with them. Everything below is pushed. Nothing here depends on a machine that
still exists.

Read this with `docs/video2-reaudit-process.md` (the thirteen steps, the six
defect classes, and the trap list) and `docs/video2-reaudit.md` (the ledger).

---

## 1. The count

**173 rows — 104 built · 20 partial · 49 missing.** `docs/video2-reaudit.md`
§4 carries the arithmetic; §5 holds the 41 rows recovered from
`docs/video2-frame-observations.md` after the originals were lost, and every
row closed this session carries a `closed by:` line naming the suite and its
check count.

A row moves to built when a suite exercises it against a real API, a real
Postgres and a real browser — never because the code was written.

## 2. What is verified, and what is not

**96 suites exist. 96 are registered in `ci.yml`. All run green locally.**

**Break-testing is the incomplete part**, and it is the step that separates a
check from decoration. Of the patches that have been applied and observed:

```
174 / 179 reddened the check they were aimed at
```

**All five that did not are in `folder-create`, and they are a pattern rather
than five accidents.** Five of that suite's twelve patches left it green, and
four of them attack the same thing from different angles:

| patch | what it breaks |
| --- | --- |
| `folder-create-2-no-index` | drops the unique index |
| `folder-create-3-case-sensitive` | drops the `lower(name)` half |
| `folder-create-6-rename-door-open` | removes the guard on rename |
| `folder-create-8-move-door-open` | removes the guard on move |
| `folder-create-12-toast-bottom-right` | moves the toast; edits `packages/ui`, outside the row's ownership |

The suite claims twenty checks including "the INDEX refuses a direct SQL
insert" and 409s on rename and on move. If removing the index, the
case-folding, the rename guard and the move guard all leave it green, then
those checks are very likely resting on the API's own 409 — which
`assertFolderNameFree` raises before anything reaches the database — rather
than on the constraint and the guards themselves. **Treat `folder-create` as
unverified until this is settled**, and start here: it is the clearest live
lead in the whole queue.

**Not yet applied at all — about 66 patches across 8 suites:**

```
tab-title-countdown (7)   task-cover (3)          focus-pill (12)
list-card-cover (8)       task-header-status (7)  task-activity-filter (8)
task-field-create (9)     integration-error-card (2, the new facet pair)
```

`scripts/e2e-lanes/drain.sh` walks that queue, one suite per worktree, waiting
for a lane rather than assuming one. The patch scripts themselves live in the
scratch directory and do NOT survive the container — see §5.

Two of those sets exist because an earlier run found the patch at fault rather
than the check: `tab-title-countdown-2-norestore` was inert until a third
title-restore path was removed, and `task-cover-1-nocustom` was inert twice —
first because `hidden` loses to Tailwind's `flex`, then because a later `style`
prop on the same element wins over an earlier one. Both are rewritten and
awaiting a run.

## 3. Defects still open

Around fifty were found. Most were fixed inside the row that exposed them.
These are the ones still standing:

1. **Container CREATE is completely ungated.** `lists.service.ts` and
   `projects.service.ts` check workspace membership and container privacy and
   nothing else, so a member can create a list inside a `view`-only space and
   is only refused when they try to edit it. The update/delete half is now
   gated (`space-default-permission`, 18 checks); this is the other half.
2. **`gmail` is a federated search source that can never be connected.**
   `search/sources.ts` names it and the command palette ships a tab for it,
   but no provider exists and no Gmail search path exists. A confident zero
   with a "connect it" affordance pointing at nothing. SharePoint is the same.
3. **292 inert `.catch(() => {})` across 63 suites.** `apiClient` never throws,
   so these catch nothing: cleanup that silently does not clean up, and setup
   that silently does not set up. `docs/e2e-shared-state-audit.md` has the
   count and the shape of the fix.
4. **`GET /tasks/workspace/:id/timeline` accepts `projectId` and no client
   sends it.** The same shape as the `/ai/activity` `userId` defect, which was
   fixed; this one has not been.
5. **A ledger row marked built is incomplete.** The Gantt today-line/zoom row
   claims the `Today` control, which did not exist until this session. The row
   needs re-reading against what is now there.
6. **Sticky headers inside `overflow-hidden`** — fixed by bounding the panes,
   but the fix has not been observed green. `.card-glass` carries
   `@apply overflow-hidden` in `packages/ui`, which is why the obvious fix
   does not work.
7. **A clip's "Copy link" yields a link that expires in 24 hours and says
   nothing about it.** One of three share paths states the expiry, and it is
   not the one people use.
8. **`email.service.send()` has no `replyTo`**, so an outbound mail cannot
   carry the address that brings a reply back into the task. Blocks the
   composer-as-email row; `task_comments` also needs a channel column.

## 4. Two rows assessed but not built

- **The composer posts as Email.** About 60% of the plumbing exists; the
  inbound direction already threads replies back onto a task. Missing:
  `replyTo`/`cc` on `send()`, a channel column on `task_comments`, a route
  that sends a composed body, and the mode menu. If the channel is stored and
  the thread does not render it, that is the mirror defect.
- **A pasted clip link renders as the clip.** Larger than it looks: there is
  no `clips` table at all. A clip is an object under a storage prefix, and
  "Copy link" signs the storage object, so the link carries no clip identity
  and no title. Order is forced — a `clips` record and a stable app route come
  before any paste handling.

## 5. Rebuilding the environment

The scripts that matter are **in the repo**: `scripts/e2e-lanes/`. Its README
has the full recipe and the two traps that cost the most time. In short:

```bash
bash scripts/e2e-lanes/fleet-up.sh 4     # N independent lanes from a dump
bash scripts/e2e-lanes/fleet-sync.sh 4   # push the CURRENT schema, restart
bash scripts/e2e-lanes/verify.sh <suite> 2
```

Two things that are not obvious and will waste an hour each:

- **A running API already has the schema your WORKING TREE has.** The build
  emits extensionless imports into `packages/db/src`, so it only runs under
  the tsx loader, which compiles the schema from source at require time. Add a
  column and every running instance starts writing it while the database still
  lacks it.
- **`apps/web/dist` is shared and read-only during a run.** Break tests
  rebuild, so they need their own tree. Git worktrees with `node_modules`
  symlinked in work, and `scripts/e2e-lanes/wt-break.sh` does exactly that —
  it is in the repo now, along with `drain.sh`, which walks a queue of
  patch sets across the worktrees. Both carry the reasons for their locking
  and rebuild rules in comments, because all three of this session's
  false-green incidents were in those two files.

The frames come from the walkthrough video, which is also not in the repo. The
transcript timecodes in the ledger and in `video2-frame-observations.md` are
enough to re-extract any frame once the video is to hand.

## 6. CI

**CI is red for one reason and it is not this branch.** Both jobs complete in
two to three seconds and return HTTP 404 for their logs — they never start.
The same signature appears on an unrelated branch by a different author. The
monthly Actions allowance is exhausted.

The last run that genuinely executed on this branch was
[532](https://github.com/iamreebskhan/rundesk/actions/runs/34601298029) at
`5b30bd1`: green, twenty-nine minutes. It is recorded on PR #1 with the
evidence.

**When the allowance resets**, do not wait for a push to coincide with it.
`ci.yml` carries a `workflow_dispatch` trigger; fire a run at the branch head.
Expect the first one to take around 110 minutes — `postgres-harnesses` runs 96
suites at roughly 1.1 minutes each, and its `timeout-minutes` is 150 with that
arithmetic written beside it. **If you add a suite, redo that arithmetic**;
the number has gone 50 → 85 → 88 → 93 → 96 in a day and has already been
stale twice.

## 7. The thing most worth remembering

Three separate times this session, a harness manufactured green:

- `pkill -f` matched a command line while the API was being killed by an
  environment variable, so the old unpatched server kept the port and every
  API-side break patch reported its suite still passing;
- after a web patch the built bundle stayed patched, so the next API-only
  patch measured the previous patch's breakage;
- a queue runner claimed a lane with its own marker rather than the real lock,
  never checked the return code, and reported eight successes having run
  nothing.

And a break patch reached a commit — a testid renamed `-DISABLED` with
`hidden`, shipping a control that rendered and did nothing. It was found only
because the agent whose patch it was went back through HEAD looking for its own
signatures. `scripts/check-no-break-patches.mjs` now fails the build on that,
and it runs in `Verify Monorepo`, which is four minutes and always runs.

The lesson is not "be careful". It is that a step which verifies other work
needs verifying too, and the cheapest way to check a harness is to ask whether
its failures and its successes look different from each other.
