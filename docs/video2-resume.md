# Where this stands, and how to pick it up

> **Superseded for current state by `docs/resume-2026-09-28.md`** (and before it `docs/resume-2026-09-26.md`, whose process and rebuilding notes still hold) (the counts, what closed on 25–26 September, the break runs still owed, and what comes next). This file is an earlier session's; its process notes still hold.

Written at the end of a session that was itself a recovery: a container was
reclaimed with about eighty-six unpushed commits on it, and a week of work went
with them. Everything below is pushed. Nothing here depends on a machine that
still exists.

Read this with `docs/video2-reaudit-process.md` (the thirteen steps, the six
defect classes, and the trap list) and `docs/video2-reaudit.md` (the ledger).

---

## 1. The count

**174 rows — 167 built · 3 partial · 4 missing.** `docs/video2-reaudit.md`
§4 carries the arithmetic. §5 holds the 41 rows recovered from
`docs/video2-frame-observations.md` after the originals were lost, and every
row closed this session carries a `closed by:` line naming the suite and its
check count.

THIS READ `104 · 20 · 50` UNTIL THE SPLIT WAS CHECKED. Nothing regressed and
nothing was inflated: §4's table was crediting §2 with the split §2 had when
the table was written, while keeping the §5 figure beside it live, so it was
adding a stale number to a fresh one. Twenty-six closures in §2 had never
reached the headline. The guard now compares §4's §2 row against §2 itself,
B, P and M each — see the note under §4.

`scripts/check-video2-counts.mjs` now checks that arithmetic on every build,
because it had already gone wrong: §4's headline read `88 built · 21 partial ·
64 missing` while the table directly under it — printed under the words *"so
the number can be checked rather than believed"* — read `104 · 20 · 49`. Both
summed to 173, so nothing looked wrong at a glance and it survived several
passes. **Do not edit the headline by hand;** change the table and let the
check tell you what the headline should say.

A row moves to built when a suite exercises it against a real API, a real
Postgres and a real browser — never because the code was written.

## 2. What is verified, and what is not

**239 suites exist and all 239 are registered in `ci.yml`**, by `node
scripts/check-suites-registered.mjs` on 29 September, which fails the build on
a suite with no step (its list of suites excused by name is empty). The jobs'
`run: node test/e2e/` lines put 233 in `postgres-harnesses` and 6 in
`browser-suites`. This
paragraph said "112 exist, 104 are registered", then "113 suites exist and ALL
113 are registered" while `doc-import` was not. A count typed here goes stale
with the next suite; the checker is where to read it. The rule it states still
holds and is worth keeping: a suite goes into `ci.yml` when it has run green
locally, never when the code is merely written, because registering a red
suite turns the pipeline into something nobody reads.

All 239 declare checks, 3,643 between them (`check-break-coverage.mjs`, 29
September). This said "101 of the 113 carry checks; the rest are fixtures and
helpers"; helpers live in `test/e2e/lib/` and are not counted.

**Break-testing is the incomplete part**, and it is the step that separates a
check from decoration.

**THE HEADLINE NUMBER THAT USED TO BE HERE — `193 / 198 reddened` — WAS NOT
SAFE TO QUOTE, and this is the correction.** Those runs happened before
`wt-break.sh` grew its two guards, so none of them verified that the worktree
was at `HEAD` or that the suite was green **unpatched**. `list-card-cover` is
what exposed the class: four of its checks failed on every patch, including
patches touching nothing near them, because those four were already failing on
a tree two commits stale. Every line in that file looked like a result and
meant nothing.

**Today the checkers count it, from the logs themselves.** On 29 September, at
`d86220d`:

```
check-break-coverage.mjs   239 suites · 3,643 checks · 1,917 patches attributed
                           to a suite (40 name none) · no suite without a patch
check-break-reddened.mjs   62 of 239 suites have a patch measured against this
                           tree that reddens a check it names: 259 patches,
                           with 0 that reddened nothing and 0 unproven; 41 claim
                           a unit test; 1,657 were measured against a tree that
                           has moved since, and are not counted as proof of it
```

The 1,657 are the size of the work owed: `never-run-plan.mjs --drifted` names
them. What follows in this section is the picture on 21 September, kept for the
reasons in it, which still hold.

Counted honestly, by whether the results file opens with a `== BASELINE (no
patch) … 0 failed` line — recounted from the files, not carried forward:

Recounted from the files on 21 September, of the **101 suites that carried
checks then**:

```
 50 have a break run with a VERIFIED GREEN baseline
  1 has a run that REFUSED — the baseline was not green, so nothing was measured
  6 have a run with no readable baseline line (crashed or timed out)
 44 have no break run at all
```

**AND THE NUMBER THAT MATTERS MORE IS THE OTHER ONE.** A run is not coverage: a
suite can have a green baseline and a single patch aimed at one of its forty
checks. `scripts/check-break-coverage.mjs` counts suites that have ever had a
break patch WRITTEN for them, and when it was first run — the first time anyone
had printed the denominator — **47 of 101 suites had none at all**, including
`video-regression` (81 checks), `custom-field-progress` (58) and `task-menu`
(33). It is a ratchet in CI now: the count may fall and may not rise, so a new
suite arrives with a patch or fails the build that brings it. It is 0 of 239
on 29 September.

That last number was the honest size of the remaining work on 21 September.
The 34 below were the ones whose checks were known to fail when the thing they
watch is broken. Everything else was a suite that passes, which is not the
same claim.

Green baselines, complete, on 21 September: `ai-answer-rendering` ·
`attach-on-create` · `calendar-accounts` · `clickapps-plan-gating` · `command-palette` ·
`create-menu-ai` · `custom-field-types` · `focus-pill` · `folder-create` ·
`folder-dialog` · `gantt-controls` · `imports` · `list-card-cover` ·
`list-customize` · `list-empty-states` · `list-view-controls` ·
`paywall-sites` · `planner-appearance-toggles` · `planner-command-bar` ·
`planner-onboarding` · `planner-settings` · `planner-upcoming-meeting` ·
`sidebar-sections` · `space-default-permission` · `space-wizard` ·
`space-wizard-views` · `tab-title-countdown` · `task-cover` · `task-delete` ·
`task-mentions` · `teams-empty-state` · `teams-person-cards` ·
`template-center` · `video1-acceptance`.

Stale results files to re-run before their numbers meant anything, then:
`ai-action-categories`, `ai-activity-filters`, `ai-create-containers`,
`ai-model-picker`, `integration-error-card`, `login-workspace-binding`,
`space-create-menu`, `task-activity-filter`, `task-field-create`,
`task-header-status`, `team-view`.

**`folder-create` IS SETTLED, AND IT WAS THE HARNESS.** This section used to
say five of its twelve patches left the suite green, reason that those checks
were "very likely resting on the API's own 409 — which `assertFolderNameFree`
raises before anything reaches the database — rather than on the constraint
and the guards themselves", and tell the next session to start here because it
was "the clearest live lead in the whole queue".

Re-run against a worktree synced to `HEAD`, with a real baseline:

```
== BASELINE (no patch) 20 passed, 0 failed

folder-create-2-no-index              was green → 19 / 1   reddens
folder-create-3-case-sensitive        was green → 18 / 2   reddens
folder-create-6-rename-door-open      was green → 18 / 2   reddens
folder-create-8-move-door-open        was green → 18 / 2   reddens
folder-create-12-toast-bottom-right   was green → 16 / 4   reddens
```

**Twelve for twelve.** Not five of twelve leaving it green — none.

```
folder-create-1-no-service-check         16 / 4    folder-create-5-scoped-to-workspace  17 / 3
folder-create-2-no-index                 19 / 1    folder-create-6-rename-door-open     18 / 2
folder-create-3-case-sensitive           18 / 2    folder-create-7-selfclash-on-rename  18 / 2
folder-create-4-archived-holds-name      18 / 2    folder-create-8-move-door-open       18 / 2
folder-create-9-silent-again             10 / 6    folder-create-10-sidebar-silent      16 / 4
folder-create-11-dialog-closes-on-error  13 / 7    folder-create-12-toast-bottom-right  16 / 4
```

Dropping the unique index reddens a check. Dropping the `lower(name)` half
reddens two. Removing the rename guard reddens two, the move guard two. The
suite was never weak.

What it was: the old results file restores `wt2`, carries no baseline line,
and shows **two checks failing on every patch** — including patches touching
nothing near them. The tree was stale, those two were failing before anything
was applied, and with two already red nothing below could be attributed. One
of the pair says in its own words *"a schema declared without a migration
behind it is a constraint that exists on one machine"*, and
`0157_folder_name_unique_per_space.sql` does create
`uq_folders_space_name_active` — so the schema was backed all along and the
worktree simply predated the migration.

**The lesson is not about `folder-create`.** Four separate "product problems"
in one day were the verification environment lying: this, `list-card-cover`'s
four always-red checks, `a39-dm-tabs` reporting 18/1 on a three-hour-old
bundle, and the four lanes a full regression was stopped over. In every case
the result looked exactly like a result. Read the `== syncing … to <sha>` and
`== BASELINE (no patch) …` lines before anything below them.

~~**Not yet applied at all — about 66 patches across 8 suites:**~~ **STALE, and
recounted from the files on 21 September.** Five of the eight have since run to
a green baseline: `tab-title-countdown` (10/0, 7 patches), `task-cover` (18/0,
3), `focus-pill` (15/0, 8), `task-field-create` (16/0) and
`integration-error-card` (25/0, 9 — complete, after an earlier run of it had
REFUSED on a baseline that never printed).

Three are genuinely incomplete, and each for a different reason worth keeping:

```
list-card-cover        8 patches exist, the log holds 1
task-header-status     7 patches, the run left NO baseline line — it crashed
                       or timed out before printing one, so nothing below it
                       was attributable
task-activity-filter   8 patches, same
```

**A run with no `== BASELINE (no patch) … 0 failed` line is not a run.** That
is the shape `check-break-freshness.mjs` reports separately from STALE, because
a set whose baseline never printed looks in every other respect like a set that
passed.

`list-empty-states` (7/7) and `sidebar-sections` (15/15) finished after that
list was written — both complete, every patch reddening. They are done, not
outstanding.

`scripts/e2e-lanes/run-plan.sh` walks a queue like that one, handing each set
to a lane only when the lane is free; `never-run-plan.mjs` writes the queue.
(`drain.sh`, which did this from uncommitted `/tmp` copies of `wt-break.sh`
and of the patches, was deleted on 23 September.) The patches live in
`test/e2e/breaks/` and are committed.

Two of those sets exist because an earlier run found the patch at fault rather
than the check: `tab-title-countdown-2-norestore` was inert until a third
title-restore path was removed, and `task-cover-1-nocustom` was inert twice —
first because `hidden` loses to Tailwind's `flex`, then because a later `style`
prop on the same element wins over an earlier one. Both were rewritten and
have run since: `tab-title-countdown-2-norestore` reddens its check (9 passed,
1 failed, against a 10/0 baseline at `dde1c835`) and `task-cover-1-nocustom`
three (39/3 against 42/0 at `f583354b`), both on 24 September.

## 3. Defects still open

Around fifty were found. Most were fixed inside the row that exposed them.
These are the ones still standing:

1. ~~**Container CREATE is completely ungated.**~~ **FIXED 21 September** —
   `space-default-permission.mjs` 18 → **22 checks**. `assertCanCreateInSpace`
   in `common/permissions/container-access.ts`, called from `createList`,
   `createProject` and `FoldersService.create`. It uses **the same resolver**
   the edit and delete paths refuse with, so the two gates cannot drift apart
   and an explicit `space_members` grant raises both at once.

   The suite is the part worth reading. Its old check read *"the member creates
   a list of their own in each space"* — it **passed**, and it was standing in
   front of the hole saying the hole was meant to be there. A member in a "View
   only" space could not rename a list and could not delete one, and could
   freely make a new one, then edit that one too, because the creator
   short-circuit applies to containers that already exist. A door around the
   rule rather than a gap in it. The member's list still has to exist in each
   space for the creator-branch refusals, so the space is now briefly raised to
   `edit`, the list is made, and it is put back — which is also the real
   sequence rather than a contrivance: a space gets downgraded and what is
   already inside it stays.
2. ~~**`gmail` is a federated search source that can never be connected.**~~
   **FIXED 21 September** — `app-catalogue.mjs`, 25 checks. Both `gmail` and
   `sharepoint` are real providers now, each asking its own OAuth scope, with
   real query paths behind them. Two worse things were underneath: `?types=gmail`
   ran an **unfiltered Rundesk search**, so choosing the Gmail tab returned your
   own tasks and documents presented as the contents of a mailbox — a wrong
   answer, not an empty one — and `SOURCE_PROVIDER.sharepoint` was `'onedrive'`,
   so a workspace with OneDrive linked saw SharePoint report itself **connected**
   over a token nothing queried. `listSources` now only calls a source connected
   when the stored grant carries the scope the query needs, which also fixed a
   live confident zero for `google-drive`.
3. ~~**292 inert `.catch(() => {})` across 63 suites.**~~ **Closed, 29 September.** `apiClient` never throws,
   so these catch nothing: cleanup that silently does not clean up, and setup
   that silently does not set up. `docs/e2e-shared-state-audit.md` has the
   count and the shape of the fix. That count (292) was taken when there were
   66 suites, and it counted every `.catch(() => {})`. Measured again on 29
   September with a parser: 1,544 in the 239 suites, 158 of them on an API
   client in 133 suites; the rest are on Playwright calls, which do throw, and
   on SQL and browser teardown. The 158 are now status checks, and
   `check-suite-api-catches.mjs` refuses a new one (`suite-hygiene/inert-catches`,
   `resume-defects/resume-3` in `docs/open-work.md`).
4. ~~**`GET /tasks/workspace/:id/timeline` accepts `projectId` and no client
   sends it.**~~ **CLOSED BY DECISION, 21 September** (`07d9208`): the framing
   was wrong. `/ai/activity`'s `userId` was a parameter the panel needed and
   failed to send; here the timeline query has no window, so the page holds
   every dated task and `projectOptions` derives from exactly those rows —
   the client is right not to send it. What was missing was any exercise of
   the parameter, and `gantt-controls` now has one: *"the timeline endpoint
   really narrows on `projectId`, which no client sends"*, which
   `gantt-29-projectid-ignored` reddens (29/1 against a 30/0 baseline at
   `8ba0bacd`). The residue, `opts.from` and `opts.to` declared on
   `getTimelineForWorkspace` and read by nothing, was removed on 25 September
   in `8ba0bac` (`product-siblings/timeline-projectid-param` in
   `docs/open-work.md`). The ledger item `resume-defects/resume-4` was closed
   as this stale entry on 29 September.
5. **A ledger row marked built is incomplete.** The Gantt today-line/zoom row
   claims the `Today` control, which did not exist until this session. The row
   needs re-reading against what is now there.
6. **Sticky headers inside `overflow-hidden`** — fixed by bounding the panes,
   and observed green: `gantt-controls` 29/29, and its three sticky patches
   (`-15` the pane unbounded, `-16` not sticky, `-17` the panes unsynced)
   redden, 18 of 18 in the set on 24 September at `3a0630f`. `.card-glass`
   carries `@apply overflow-hidden` in `packages/ui`, which is why the obvious
   fix does not work. The same shape on the list's Table view and the Workload
   heat map is fixed the same way (`sticky-headers`).
7. ~~**A clip's "Copy link" yields a link that expires in 24 hours and says
   nothing about it.**~~ **Fixed, 30 September** (`resume-defects/resume-7`): a
   clip has one link, `/clips/<token>`, which re-signs the recording each time it
   is opened. Copy link, New tab and every share hand it out, and the toast and
   the dialog say who can open it and that it does not expire.
8. ~~**`email.service.send()` has no `replyTo`**~~, so an outbound mail cannot
   carry the address that brings a reply back into the task. **Partly fixed,
   24 September:** `send()` takes a Message-ID and a Reply-To and hands both to
   the transport (`email.service.ts:600-617`), and a comment notification's
   Reply-To is the task's address where its list has an alias. Still open, and
   still blocking the composer-as-email row: cc and bcc, a channel column on
   `task_comments` and a reader for it, and minting an alias
   (`resume-defects/resume-8` in `docs/open-work.md`).

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
has the full recipe and the two traps that cost the most time, and
`docs/resume-2026-09-26.md` §5 and §6 have the process and the `/tmp` helpers
as they stand now. In short:

```bash
bash scripts/e2e-lanes/fleet-up.sh "1 2 3 4"   # lanes 1-4 from the pristine dump: a LIST, never a count
bash scripts/e2e-lanes/fleet-sync.sh 4         # push the CURRENT schema to lanes 1-4, restart them (this one still reads a count)
bash scripts/e2e-lanes/verify.sh <suite> 2     # one suite on lane 2
```

This block read `fleet-up.sh 4 # N independent lanes`. `fleet-up.sh` takes a
list now, and it drops and restores every lane it is given, so `4` is lane
four alone (`lane_list` in `lane-env.sh`). A lane gets the model stub only when
`RUNDESK_LANE_MODEL` names it (`all`, or lane numbers); see `lane-env.sh`.

Two things that are not obvious and will waste an hour each:

- **A running API already has the schema your WORKING TREE has.** The build
  emits extensionless imports into `packages/db/src`, so it only runs under
  the tsx loader, which compiles the schema from source at require time. Add a
  column and every running instance starts writing it while the database still
  lacks it.
- **`apps/web/dist` is shared and read-only during a run.** Break tests
  rebuild, so they need their own tree. Git worktrees with `node_modules`
  symlinked in work, and `scripts/e2e-lanes/wt-break.sh` does exactly that —
  it is in the repo now, along with `run-plan.sh`, which walks a queue of
  patch sets across the worktrees. Both carry the reasons for their locking
  and rebuild rules in comments, because all three of this session's
  false-green incidents were in the scripts they replaced.

The frames come from the walkthrough video, which is also not in the repo. The
transcript timecodes in the ledger and in `video2-frame-observations.md` are
enough to re-extract any frame once the video is to hand.

## 6. CI

**CI cannot run until 1 October, and its "failures" are not failures.** Every
push produces two check-run events that report `failure`, and they are noise.
The run itself reports `status: "queued"` while its jobs report `conclusion:
"failure"`; each job has `runner_id: 0`, an empty `runner_name`, a two-second
duration, and returns **HTTP 404** for its logs, because there are no logs —
nothing ever executed. The monthly Actions allowance is exhausted and the same
signature appears on an unrelated branch by a different author.

Do not spend time on these, and do not comment on the PR about them. The
session stays subscribed so that genuine review comments still arrive; the
check failures are filtered out by hand. **The tell is `runner_id: 0` plus a
404 on the logs** — a real failure has a runner and has logs.

The last run that genuinely executed on this branch was
[532](https://github.com/iamreebskhan/rundesk/actions/runs/34601298029) at
`5b30bd1`: green, twenty-nine minutes. It is recorded on PR #1 with the
evidence.

**When the allowance resets**, do not wait for a push to coincide with it.
`ci.yml` carries a `workflow_dispatch` trigger; fire a run at the branch head.
Expect the first one to take over four hours — `postgres-harnesses` runs 233
suites (29 September, counted from its `run: node test/e2e/` lines; the other
six are in `browser-suites`) at roughly 1.1 minutes each, about 256 minutes
plus setup, and its `timeout-minutes` is 300 with that arithmetic written
beside it.
**If you add a suite, redo that arithmetic** in the job's comment, which keeps
the count's history; this file kept a second copy of it, and the copy read 155
and 210 while the job had reached 233 and 300. `check-suites-registered.mjs`
fails any suite without a step, so registration cannot quietly lag the
directory; the running time can, and nothing checks it. **The job should be
split**: the comment above it says why that was not done without a working
pipeline to prove the split on.

## 7. The thing most worth remembering

Three separate times this session, a harness manufactured green:

- `pkill -f` matched a command line while the API was being killed by an
  environment variable, so the old unpatched server kept the port and every
  API-side break patch reported its suite still passing;
- after a web patch the built bundle stayed patched, so the next API-only
  patch measured the previous patch's breakage;
- a queue runner claimed a lane with its own marker rather than the real lock,
  never checked the return code, and reported eight successes having run
  nothing;
- **the break worktrees are detached checkouts made once and never moved**, so
  they drift behind the branch as work lands. `list-card-cover` was tested
  against a tree two commits old: four of its checks failed on *every* patch,
  including patches touching nothing near them, because those four were already
  failing unpatched. Every line in that results file looked like a result and
  meant nothing. `wt-break.sh` now syncs to `HEAD`, runs the suite with **no
  patch at all** first, and writes `== BASELINE (no patch) 26 passed, 0 failed`
  as the file's first line — refusing (exit 4 and 5) rather than produce an
  unreadable run;
- **`apps/web/dist` is shared, and four agents rebuilt it at once.** `vite
  build` empties the directory before writing, so a run that starts mid-build
  dies on `ENOENT …/index.html`. The crash is the harmless half: a run that
  starts just *after* somebody else's build finishes reports an ordinary pass
  or fail about a tree that is not the one it is testing. `verify.sh` now
  prefers `/tmp/claude-0/dist-<lane>` when a lane has built one, and names the
  bundle it measured on the result line.

And a break patch reached a commit — a testid renamed `-DISABLED` with
`hidden`, shipping a control that rendered and did nothing. It was found only
because the agent whose patch it was went back through HEAD looking for its own
signatures. `scripts/check-no-break-patches.mjs` now fails the build on that,
and it runs in `Verify Monorepo`, which is four minutes and always runs.

The lesson is not "be careful". It is that a step which verifies other work
needs verifying too, and the cheapest way to check a harness is to ask whether
its failures and its successes look different from each other.
