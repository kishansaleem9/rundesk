# Where this stands, and how to pick it up

Written at the end of a session that was itself a recovery: a container was
reclaimed with about eighty-six unpushed commits on it, and a week of work went
with them. Everything below is pushed. Nothing here depends on a machine that
still exists.

Read this with `docs/video2-reaudit-process.md` (the thirteen steps, the six
defect classes, and the trap list) and `docs/video2-reaudit.md` (the ledger).

---

## 1. The count

**173 rows — 148 built · 11 partial · 14 missing.** `docs/video2-reaudit.md`
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

**113 suites exist and ALL 113 are registered in `ci.yml`.** This paragraph
said "112 exist, 104 are registered, and the eight unregistered ones are
unregistered on purpose" — true when it was written and not since. The rule it
states still holds and is worth keeping: a suite goes into `ci.yml` when it has
run green locally, never when the code is merely written, because registering a
red suite turns the pipeline into something nobody reads. There is simply
nothing waiting on it at the moment.

101 of the 113 carry checks; the rest are fixtures and helpers.

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

Counted honestly, by whether the results file opens with a `== BASELINE (no
patch) … 0 failed` line — recounted from the files, not carried forward:

Recounted from the files on 21 September, of the **101 suites that carry
checks**:

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
suite arrives with a patch or fails the build that brings it.

That last number is the honest size of the remaining work, and it has not been
stated plainly before. The 34 are the ones whose checks are known to fail when
the thing they watch is broken. Everything else is a suite that passes, which
is not the same claim.

Green baselines, complete: `ai-answer-rendering` · `attach-on-create` ·
`calendar-accounts` · `clickapps-plan-gating` · `command-palette` ·
`create-menu-ai` · `custom-field-types` · `focus-pill` · `folder-create` ·
`folder-dialog` · `gantt-controls` · `imports` · `list-card-cover` ·
`list-customize` · `list-empty-states` · `list-view-controls` ·
`paywall-sites` · `planner-appearance-toggles` · `planner-command-bar` ·
`planner-onboarding` · `planner-settings` · `planner-upcoming-meeting` ·
`sidebar-sections` · `space-default-permission` · `space-wizard` ·
`space-wizard-views` · `tab-title-countdown` · `task-cover` · `task-delete` ·
`task-mentions` · `teams-empty-state` · `teams-person-cards` ·
`template-center` · `video1-acceptance`.

Stale results files to re-run before their numbers mean anything:
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
prop on the same element wins over an earlier one. Both are rewritten and
awaiting a run.

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
Expect the first one to take a little over two hours — `postgres-harnesses`
runs 131 suites (24 September; the other six are in `browser-suites`) at
roughly 1.1 minutes each, about 144 minutes, and its `timeout-minutes` is 180
with that arithmetic written beside it. **If you add a suite, redo that
arithmetic** in the job's comment; the count has gone 50 → 85 → … → 116 → 117
→ 119 → 120 → 121 → 122 → 123 → 124 → 126 → 127 → 128 → 129 → 130 → 131, and `check-suites-registered.mjs` now fails any suite without a step,
so the count cannot quietly lag the directory. **The job should be split**:
the comment above it says why that was not done without a working pipeline to
prove the split on.

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
