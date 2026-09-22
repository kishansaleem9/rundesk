# The video-2 re-audit: how a row gets closed

The walkthrough is the specification. The line that settles every argument about
scope is at `[21:43]`:

> "jo FEATURES maine enlist kiye hain, un ka matlab yeh hai ke HUMEIN YEH
> CHEEZEIN CHAHIYEIN"

So a frame that shows a control is a requirement that the control exist, behave,
and keep behaving. Not a suggestion, and not satisfied by something that merely
looks the same.

This file is the working process. It exists because the process is the only
thing that reliably catches the failure this audit keeps finding: work that
passes its own test while doing nothing.

---

## The thirteen steps

Every row goes through all thirteen, in order. Skipping one is how a facade gets
shipped.

1. **Verify the frames and the transcript.** Extract the frame at the timecode,
   zoom it if the control is small, and read what is actually drawn — not what
   the row's one-line summary says is drawn. The summary is a memory of the
   frame; the frame is the frame. Where the transcript speaks to the frame,
   quote it, because the words often carry the requirement that the pixels do
   not (a menu item's *effect*, a plan tier, who the feature is for).

2. **Research the reference.** Find out how the referenced product actually
   behaves, not how it looks. A chip that reads "Subtasks" with three options
   under it is three different features depending on what the third option does.

3. **Build it end to end.** Schema, migration, service, controller, client,
   component, strings in every locale. A value that is written but never read is
   not a build; it is the mirror of a facade, and it is worse, because it leaves
   evidence that suggests the feature exists.

4. **Exercise it on localhost.** Real API, real Postgres, real browser. Not a
   unit test with the network stubbed out. The whole class of bug this audit
   exists to catch lives in the gap between the component and the server.

5. **Screenshot it and MEASURE it.** Element positions, order, gaps, counts.
   "It looks right" is not a check. `getBoundingClientRect` is.

6. **Break-test every check.** For each assertion, write a patch that should
   make exactly that assertion fail, apply it, rebuild, and run. If the check
   still passes, the check is decoration and has to be rewritten. This is the
   single highest-yield step in the list.

7. **Register the suite in `ci.yml`.** A suite that only ever runs on a laptop
   protects nothing. Register it only once it is locally green, so the pipeline
   does not go red on someone else's commit.

8. **Preflight and regression.** Typecheck, lint, build, and re-run the
   neighbouring suites. New columns and new query parameters break old readers.

9. **Update the ledger.** The row moves to `| B |` with the evidence — file and
   line, suite name, check count — not with an adjective.

10. **Report the three counts.** buildable-small / buildable-large /
    blocked-or-decided, plus defects-found-while-building as its own number.
    Reporting two counts hides the third, and the third is where the schedule
    actually lives.

11. **Commit.** One row, one commit, message naming what changed and what it
    fixes.

12. **Re-read the list FROM THE FILE.** Not from memory of the list. Memory
    drifts toward the rows that were interesting and away from the rows that
    were tedious, and the tedious ones are half the ledger.

13. **Continue without stopping.** The next row starts at step 1.

---

## The defect classes

Named, because naming them makes them findable. Every one of these was found in
shipped Rundesk code during this audit.

**The facade.** A control that can only ever say one thing. A filter chip that
renders the count it was handed and has no code path that could ever hand it a
different one. It demos perfectly.

**Its mirror.** A stored value that no reader honours. The setting saves, the
toast confirms, the row round-trips through Postgres, and nothing anywhere
reads the column. Worse than the facade because the database is now evidence
for a feature that does not exist.

**The duplicated list.** The same set of options written out in three places,
two of which have drifted. The third picker offers ten of nineteen field types
and nobody noticed, because each picker is individually plausible.

> **AND IT HAPPENS TO CHECKERS, WHERE IT IS WORSE.** `check-break-claims.mjs`
> and `check-break-coverage.mjs` each carried their own copy of the same
> `norm`/`findsClaim` matcher, asking two different questions of it. One copy
> had grown a dash fold and a backtick unescape; the other had not. A product
> defect of this shape shows a wrong list on screen; this shape publishes two
> numbers that disagree about the same claim, each one authoritative-looking on
> its own, with nothing on screen to look at. Pull the shared thing into one
> module and verify by DIFF — byte-identical output before and after — so the
> extraction is separated from the behaviour change it enables.

**The confident zero.** An aggregate that reports 0 because it queried the
wrong key, not because the answer is zero. Indistinguishable from a true zero
in the UI, which is the whole problem.

**The dead control.** A button, a menu item, a labelled switch that is wired to
nothing. Often the remains of a feature that was half-removed.

**The stale reason.** A comment or a doc explaining why something is absent,
where the reason stopped being true some commits ago. It suppresses exactly the
investigation that would find the bug.

---

## Traps

Collected the hard way. Most of them are one sentence because one sentence is
all the warning that is needed once the shape is familiar.

### Checks that cannot fail

- **NAMING ONLY WHAT SHOULD BE THERE, when the claim is that something is
  FILTERED, SCOPED or NARROWED.** Four suites in one session, four mechanisms,
  one sentence — the most productive single shape this audit has found:

  | suite | the check | why it could not fail |
  | --- | --- | --- |
  | `comment-slash-commands` | typing `/quo` shows Quote | `matchBlocks` returns every block for a blank query, so Quote shows in an unfiltered menu too |
  | `assignee-picker` | searching for the twelfth member finds them | that member sorted inside the first eight, so the old cap-at-eight build found them as well |
  | `space-features` | a shut space hides Priority | both fixtures had a COMPLETE or an ABSENT feature map, so `{...ALL, ...stored}` and `stored` gave the same answer |
  | `list-under-space` | the space listing holds the new list | it does, in a listing that returns every list under the space |

  **The absence is the claim.** A filter is only proven by something that does
  not match being gone; a scope by another person's row being missing; a
  narrowing by the item that should have been excluded. Add the negative
  assertion and name the thing it excludes — `comment-slash-table`,
  `restBefore[1]`, a list inside a Project — because a count alone can be right
  for the wrong reason too.

  Three of the four were found by a break patch running GREEN and one by a
  patch reddening fewer checks than predicted. None was visible by reading the
  suite: every one of them looks like a perfectly ordinary assertion.

  **AND AN ABSENCE IS A CLAIM ONLY IF THE FIXTURE CREATES THE THING.** The
  corollary, and the fifth instance, which arrived one commit after the rule
  above was written. `a39-dm-tabs` asserts that a CLOSED task is not under
  "open tasks" and that a meeting only one person attended is not under
  "meetings with them" — two textbook negative assertions — and `ensureShared`
  created neither row. Both were greps for strings no build would ever render,
  true on every build for ever. `a39-3`, which deletes the `statusCategory`
  filter outright, ran green against them.

  So the rule has two halves and the second is the one that bites: **name the
  excluded thing, then check the fixture makes it.** A negative assertion over
  an absent fixture is the strongest-looking check in a suite and the emptiest
  — stronger-looking than the vacuous positives above it, because it reads as
  the careful one.
- **Reading an element outside the thing under test to prove the thing under
  test opened.** A panel's presence proved by an element that renders whether or
  not the panel opened.
- **Comparing two values that are both `undefined`.** `a?.id === b?.id` is
  `true` when neither exists. Assert the value is defined first, separately.
- **Awaiting a call that silently 404s.** Then asserting the absence of what it
  would have created. Passes vacuously, forever.
- **`.catch(() => {})` on `apiClient`.** The fixture's `apiClient` **never
  throws** — it returns `{status, data, error}`. A `.catch` on it is inert, and
  a failed call reads as success. Check `status` explicitly.
- **Asserting a count against a number the fixture also produced.** If the seed
  and the assertion share a source, the check measures nothing.
- **`toBeVisible()` on a container that is always rendered.** Assert on the
  contents, or on a data attribute that only the intended state sets.
- **Asserting text that the i18n fallback also produces.** If a missing key
  falls back to a sibling's string, the assertion passes on the bug. (This is
  exactly the `VIEW_LABEL` "team" defect: the row rendered "List" because the
  key was missing, and any check for "a label is present" would have passed.)
- **A negative assertion over a list that can be empty.**
  `!requests.some(u => /type=/.test(u))` is *true* when nothing was requested.
  The check reads as "no request carried the parameter" and means "there were
  no requests". Assert the collection is non-empty first, in the same check.

### Checks that fail for reasons that are not the code

The mirror of the above, and just as costly: a check that reddens on something
irrelevant trains everyone to ignore it.

- **A check that fails on a calendar.** `activity-rail` asked whether the
  chip's text *contained* today's day-of-month. Today was the 20th, the chip
  read `"Created 8/7/2026"`, and the year carries `"20"` — so it reported the
  chip as wrong while the chip was right, and would do the same on the 2nd,
  6th and 26th of any month in 2026. Parse dates into numbers and compare
  numbers; never substring-match a date.
- **Asserting on rendered text when CSS transforms it.** `innerText` applies
  `text-transform`; `textContent` does not. A menu label styled `uppercase`
  reads "CREATE" through one and "Create" through the other. Decide which you
  mean and say so in the check's message.
- **A request-based check against a warm cache.** `apps/web/src/lib/query.ts`
  sets a 30-second `staleTime`, so returning to a query key fetched seconds
  ago fires *no request at all*. A check asserting "the request carried X"
  then depends on how fast the runner got there — a flake wearing an
  assertion's clothes. Force a cache miss by construction (ask for a key this
  run has never fetched), never by timing.
- **A `waitFor` that waits for the opposite of what the check wants.**
  Playwright's default `state: 'visible'` needs a non-zero box, so waiting on
  a *collapsed* (0px) panel can never resolve. Poll the quantity the check
  itself measures.
- **`page.route` cannot intercept what the SERVICE WORKER serves, and
  `page.on('request')` will happily tell you it can.** `apps/web` is a PWA
  (`vite-plugin-pwa`, `sw.js` in the bundle). `ai-answer-rendering` stubbed
  `GET /ai/status`, the handler never ran, the composer stayed correctly
  disabled, and the run died thirty seconds and one section later inside
  `locator.fill`. The request URL was in the log, matched the glob exactly, and
  was served past the stub. **Workbox handles GET and passes POST through**, so
  the same suite's `/ai/chat` POST stub had worked since the day it was
  written — internally consistent and wrong in one half. Pass
  `serviceWorkers: 'block'` to `browser.newContext()` for anything that stubs a
  GET; seven suites in this directory already do.
- **A precondition you `await` and do not read is a failure that will surface
  somewhere else.** The same block had a bare `await waitUntil(() =>
  box.isEnabled())`, so a composer that never enabled carried on into the next
  line and failed there — a timeout in the middle of the word-bar section,
  pointing at the wrong thing. If a precondition can fail, it is a check. If it
  is not worth a line, it is not worth waiting for.
- **A `boundingBox()` read before a refetch reflows the page is a mouse gesture
  aimed at where the element used to be.** `custom-field-types` drew on a
  signature pad with `page.mouse`, having read its box a few lines earlier —
  and the line between them had emptied the field ABOVE it, so the panel
  refetched, that row collapsed, and the pad moved up by its height. The
  pointerdown landed outside the pad, the stroke was never made, and the check
  reported the feature broken. **It passed on the unpatched tree every time**
  and failed under four break patches — the four that added a field row, which
  pushed the pad further down the panel. A check that only reddens under a
  patch that has nothing to do with it is unattributable, which is the same
  cost as a check that cannot fail. `scrollIntoViewIfNeeded()` immediately
  before the read, and put the mutation that moves things AFTER the gesture
  that measures them.
- **A stub's body is the ENVELOPE, not the handler's `return`.** Every response
  here goes through a response interceptor: `status()` returns
  `{available: true}` and the wire carries
  `{"data":{"available":true},"error":null}`. A stub fulfilling the inner shape
  unwraps to `undefined` in the client and the page behaves as though the call
  failed. Copy the shape from the live route — `curl` it — never from the
  controller.
- **`@Post` answers 201, and a check written from an assumption about REST
  answers to nobody.** Nest returns **201** for a `@Post` with no `@HttpCode`.
  **Four** checks were written against 200 in one day, by three different
  authors, in three suites — two in `app-catalogue`, one in `ai-assign`, one in
  `calendar-accounts` — and every one printed the right payload in its own
  failure line while reporting the route broken. The `calendar-accounts` one
  was the worst of the four: its other branch expected a 400 the server does
  not produce either, so **both branches were unreachable and the check could
  only ever fail**. By then `app-catalogue` already carried a comment recording
  the identical mistake against the same route, which is the argument for this
  list existing at all. `ai-assign` is the
  instructive one: its six neighbouring assertions correctly use `=== 200`
  because they are GETs, so the file is consistent with itself and wrong in one
  place, which review will not catch. Read the route. Pin the number exactly
  rather than loosening to `< 300`: "any success will do" is how a route that
  starts answering 204 with no body keeps a green check.

### Selectors

- **A testid prefix is a namespace.** `[data-testid^="space-wizard-feature-"]`
  counted 18 where 6 was meant, because two more testids — `-row-${key}` and
  `-label-${key}` — were later added under the same prefix. Six features times
  three element kinds. Adding a variant under an existing prefix silently
  changes what every prefix query in the repo counts.
- **`.locator('x')` is a descendant search.** `getByTestId('list-customize')
  .locator('summary')` matched two elements once a nested `<details>` appeared
  inside the panel. Use `'> summary'` when you mean the element's own child;
  `.first()` keeps passing if the two ever swap order.

### Suite construction

- **`EXPECTED_CHECKS` must be exact (`!==`, never `<`).** With `<`, a branch
  that silently skipped turns into a shorter run that still passes. Exact makes
  a skipped branch a failure.
- **Narrow to your own fixtures.** The e2e database is shared. A suite that
  asserts "the list has 3 rows" is asserting on everyone else's data too. Tag
  your rows and filter to the tag.
- **One runner per LANE, not one runner overall.** This used to read "one
  runner at a time", and it described an environment that no longer exists:
  `scripts/e2e-lanes/` gives each lane its own Postgres (`rundesk_v<k>`) and
  its own API (`302k`), so N suites run at once without interleaving.
  **The web bundle is the part that is still shared**, and it is the one that
  bites: `vite build` empties the output directory before writing, so a run
  that starts mid-build dies on `ENOENT …/index.html` — and a run that starts
  just *after* somebody else's build finishes reports an ordinary pass or fail
  about a tree that is not the one it is testing. With four agents working at
  once this happened within the hour. Build your lane its own bundle
  (`--outDir /tmp/claude-0/dist-<lane> --emptyOutDir`); `verify.sh` picks it up
  automatically and names the bundle it measured on the result line.
- **A SHARED THING MADE PRIVATE IS STILL STALE — IT IS JUST STALE PRIVATELY.**
  The per-lane bundles above fixed the collision and nothing aged them out. A
  full regression ran against four bundles built three hours and six source
  files earlier, and every result from those lanes was about code that no
  longer existed; the first failure it produced was unattributable and the
  sweep had to be thrown away. This is the *same* defect as the unsynced break
  worktree, in the fix written that morning to avoid it — and it was harder to
  see, because a private staleness is one nothing else trips over.
  `verify.sh` refuses (exit 6) on a bundle older than its source now, and
  `refresh-dists.sh` clears it. **When you isolate a shared resource, ask what
  used to keep it current and whether anything still does.**
- **Prove the request, not just the render.** For anything that changes what the
  server is asked for, capture the request (`page.on('request', …)`) and assert
  the parameter went out. Rendering the right thing for the wrong reason is the
  commonest way a fix is fake.
- **Bump a stamp, don't key on the value.** A "collapse all" that keys its effect
  on the mode is dead on the second press, because the mode did not change. Key
  on a counter that increments per choice.

### Break-testing itself

Step 6 has its own failure modes, and all four of these produced a page of
green "confirmations" that meant nothing until they were found.

- **Kill the server by PORT, not by environment variable.** `pkill -f` matches
  a *command line*; `PORTMARK=2` is an environment variable and appears in no
  command line, so it matched nothing. The old, unpatched API kept the port,
  the new one failed to bind, and every API-side patch reported its suite
  still passing while web-side patches reddened normally. The pattern in the
  results — one class passing, the other failing — is what gives it away.
  `lsof -t -i ":$PORT" -sTCP:LISTEN` is the honest question.
- **Rebuild the bundle between patches, not only when this patch touches it.**
  After a web patch, the built bundle stays patched. An API-only patch that
  follows runs against it, so its checks measure the *previous* patch's
  breakage.
- **AND THE SAME THING IN THE OTHER DIRECTION — FIXED, and left written out
  because the symptom is worth recognising.** The rule above was written for
  the bundle and implemented only for the bundle: `WEB_DIRTY` carried a web
  patch's breakage forward one step and forced a rebuild, and there was no
  `API_DIRTY`. `git checkout -- .` reverts the SOURCE
  before the next patch, but `apps/api/dist` is only rebuilt when the new patch
  itself touches the API — and the server is only restarted then too. So a web
  patch that follows an API patch runs against the API patch's compiled
  binary, still serving. In `custom-field-types` this was visible because the
  patches sorted into eighteen API ones and then fourteen web ones: patch 18
  prepended a space to every stored signature, and **patches 19 through 32
  each reported that same defect**, two extra red checks on every run, because
  nothing ever put the server back. The patch list is what gives it away —
  every run after a boundary carrying the same two failures that have nothing
  to do with it. `wt-break.sh` carries an `API_DIRTY` now, exactly mirroring
  `WEB_DIRTY`, so mixed sets can be run in one invocation. If you are reading
  a results file produced before that, or by anything else, split the API
  patches from the web ones and run them as two invocations — the restore block
  at the end of a run rebuilds both sides and restarts, so the second batch
  starts clean.
- **One runner per worktree, enforced.** Two break runs sharing a checkout
  check out, patch and build over each other, and every result afterwards is
  about whichever wrote last. Take a lock.
- **ONE BREAK SET AT A TIME ON A FOUR-CORE BOX, however many worktrees exist.**
  The worktrees make three runs *safe*; they do not make three runs *fast*.
  Every patch is a full `vite build`, so three concurrent sets put the load
  average at 6–9 on four cores and each set slowed to roughly one patch per
  several minutes — slower in wall-clock, for all three, than running them in
  turn, and with nothing usable finished for the whole of it. Stopping two took
  the load from 6.5 to 3.4 immediately. "One runner per worktree" is about
  correctness; this is about arithmetic, and the two are different rules.
- **AND NOTHING OUTSIDE THE RUN MAY TOUCH ITS LANE'S SERVER.** The lock stops
  two break runs colliding; it does not stop YOU. `fleet-restart.sh "9"`,
  typed meaning *lane nine*, restarted lanes ONE THROUGH NINE — because the
  argument was parsed as a count, exactly as `fleet-up.sh` does and warns
  about in its own header — and replaced the worktree APIs three break sets
  were driving on ports 3022–3024 with main-tree ones. Every patch applied
  after that measured UNPATCHED code. Twenty-nine results were discarded: not
  because they were wrong, but because they could no longer be attributed,
  which is precisely why `list-card-cover`'s first run was worthless. A script
  that restarts servers takes a LIST, validates every element, and prints
  which lanes it is about to touch.
- **A DATABASE THAT EXISTS IS NOT A DATABASE THAT IS CURRENT.** A container
  restart rolled Postgres back behind that day's migration. All ten lane
  databases were still there, an existence check passed every one, and the
  first list create in each answered `column folders.status_scope does not
  exist` as a 500 — which the suite reported as *"could not make this suite's
  own list"*, blaming its own fixture for the environment's fault. The lanes
  are built by restoring a DUMP, so `drizzle.__drizzle_migrations` is empty
  and `drizzle-kit migrate` cannot answer either: it would try to apply all
  160 migrations against a populated schema. The SCHEMA is the only honest
  witness — look for the newest migration's column and refuse the lane when it
  is missing.
- **A break patch goes stale when the code gets more robust.** One patch
  removed the `isArchived` filter from a list query and the check still
  passed — because a later fix had added `isNull(deletedAt)` *beside* it. Two
  independent conditions hid the row, so removing one proved nothing. That is
  good code and a bad patch: rewrite the patch to remove both, rather than
  concluding the check is weak.
- **A COUNT CHECKED AGAINST ONE PROVES NOTHING: `1` IS THE NUMBER A HARDCODED
  NUMBER IS.** `sidebar-dms-7-count-is-a-constant` replaces a section's
  `data-count` with the literal `1` and came back **14 passed, 0 failed**,
  because that run had exactly one direct message. The suite already refused a
  workspace with NO DMs — "every check below would pass vacuously" — and one is
  the same problem a step along. Seed **two** of anything a count is asserted
  over, and make the fixture create the second rather than hope for it: this
  one needed a third workspace member, and the seed ships two users, so the
  fixture registers a peer and adds them.
- **A CHECK THAT READS A STALE `useMemo` IS READING A CACHED CORRECT ANSWER.**
  The claim was "a subtask still names its parent when the parent has been
  filtered off the screen". The check hid the parent and looked — and passed
  against the deliberately broken build too, because the annotation map is a
  `useMemo` keyed on `[tasks, …the switches…]`, and hiding a row changes
  `visibleTasks`, which is not one of those keys. The memo did not re-run, the
  broken build kept serving the map it had built while the parent was still
  visible, and the patch came back green on every check. **Break-testing is
  what found it; nothing else could have.** When a claim is about state the
  component derives, make the check move something the derivation actually
  watches — here, cycling the switch off and on — or it is asserting that a
  cache has not been invalidated yet.
- **A FAILURE MESSAGE THAT CALLS A LOCATOR TURNS A CLEAN FAIL INTO AN ABORT.**
  `chk(cond, good, \`… ${await thing.getAttribute('x')} …\`)` builds that third
  string as an ARGUMENT — before `chk` runs, and whether the check passes or
  fails. So a message that describes a locator queries it on every single run,
  and on the run where that locator matches nothing it throws a thirty-second
  timeout from inside a check that was about to report exactly what was wrong.
  The suite then says `threw: locator.getAttribute: Timeout` and stops, which
  names the tool instead of the product. Read the value into a variable, assert
  the variable, describe the variable. `.count()` is the only locator call that
  answers 0 instead of waiting, so it is the only one safe to put in a message. Two
  `sidebar-sections` patches reported `PATCH FAILED` for a whole round.
  `-12` anchored on `return target.kind === 'project'` as the last line of
  `canDropOn`, and a `folder` branch was later added below it so the function
  ends `return false` — anchor gone. `-15` anchored on the tree-invalidation
  loop, which a second drop path duplicated, so it matched **twice** and the
  `count == 1` assertion refused. Both were still perfectly able to break the
  code they were aimed at. `PATCH FAILED` in a long results file reads like
  housekeeping; it is a check whose proof has silently lapsed, so re-anchor it
  the same day and say in the patch why the anchor moved.
- **`const x: Union = 'literal'` does not compile, and the error is nowhere
  near the patch.** TypeScript narrows a `const` initialised with a literal to
  that literal *even when the annotation is the union*, so every `=== 'other'`
  comparison downstream becomes TS2367 "no overlap" and the run reports
  `BUILD FAILED` having reached no check at all. This is the `{false && …}`
  narrowing trap in another costume and it has now eaten three patches. Write
  `(['literal'] as Union[])[0]` — same value, same break, union preserved.
- **A worktree is pinned at the commit you created it from, AND THIS IS NOW
  ENFORCED because advice was not enough.** `list-card-cover` was break-tested
  in a worktree two commits stale: four of its checks failed on *every* patch,
  including patches touching nothing near them, because those four were already
  failing unpatched. At HEAD the suite was 26/26. Every line in that results
  file looked like a result and meant nothing — with four checks already red,
  no patch can be attributed. `wt-break.sh` now syncs the worktree to `HEAD`,
  then runs the suite with **no patch at all** and writes
  `== BASELINE (no patch) 26 passed, 0 failed` as the file's first line,
  refusing outright (exit 4 and 5) rather than emit an unreadable run. **Read
  that first line before reading anything below it.**
- **A patch that does not compile proves nothing**, and the harness must say
  so out loud rather than counting it among the confirmed.
- **THE WORKTREE SYNCS TO `HEAD` WHEN THE RUN TAKES THE LOCK, NOT WHEN YOU
  QUEUE IT.** Queue a patch, commit the fix it is meant to break, and the run
  may still start against the tree *without* that fix — because it waited
  behind another agent for twenty minutes first. This happened three times in
  one afternoon and each time it looked like something else:

  | what it printed | what it meant |
  |---|---|
  | `sdp-19-create-ungated PATCH FAILED` | the anchor was added by a commit the run predates |
  | `BASELINE (no patch) 21 passed, 1 failed` then `REFUSING TO BREAK-TEST` | the baseline fix landed after the run started |
  | four checks red on every patch | the worktree had never been synced at all |

  The `== syncing /tmp/claude-0/wtN to <sha>` line at the top of the results
  file is the record of which tree the numbers are about. **Read it, and check
  it against the commit you meant to test**, before reading anything below it.
  A `PATCH FAILED` from a run that predates the patch's own commit is not a bad
  patch, and a refusal on a red baseline is not a broken suite.
- **You cannot sandbox a patch script by stubbing `io` in its globals.** Each
  patch does its own `import io`, which rebinds the name to the real module —
  so a "dry run" verifier written this way silently applies every patch to the
  live tree. Three separate people hit this in one day, one of them writing
  into a file they did not own. Verify by parsing the script with `ast`, or by
  copying the target files into a scratch directory and rewriting the paths
  inside the patch. Never by executing it and hoping.
- **`pkill -f <pattern>` matches your own shell.** The command line that runs
  the `pkill` contains the pattern, so it kills the process doing the killing
  and the surrounding script dies mid-way. Kill by port
  (`lsof -t -i ":$PORT" -sTCP:LISTEN`) or by a PID you recorded.
- **A WATCHER IS FOR WATCHING. DO NOT PUT WORK IN ONE.** Two watchers were set
  on the same condition and both fired the same script, so a bundle rebuild and
  a suite run raced each other and the run reported on a directory the rebuild
  was in the middle of emptying. The guards catch a *stale* bundle; nothing
  catches two writers to the same one. Side effects belong in a single
  background job, chained with `&&`, with the watcher only reading the result.
- **One rebuild per output directory at a time**, for the same reason. This is
  the shared-`dist` collision again, at a smaller scale and entirely
  self-inflicted: per-lane bundles stop *other agents* colliding with you and
  do nothing about you colliding with yourself.
- **A WATCHER POLLING A LOG THE JOB HAS NOT REACHED YET READS THE LAST RUN.**
  `until grep -q "passed" run.log; do sleep 5; done` returned instantly and
  handed back a REFUSING message from twenty minutes earlier, because the job
  it was watching was still in its `vite build` step and had not yet truncated
  the file. The watcher was correct, the file was stale, and the two are
  indistinguishable from the outside — this is the confident zero with a
  timestamp on it. Truncate the log yourself before launching (`: > run.log`),
  or poll on something the new run creates rather than something the old run
  left behind.
- **`VAR=x yes | cmd` sets `VAR` for `yes`, not for `cmd`.** The variable
  attaches to the first command in the pipeline. `export` it instead. This
  costs a confusing round trip every time, because the failure is `cmd`
  complaining that a perfectly-set variable is missing.
- **"STILL GREEN: 0" CANNOT SEE A PATCH THAT NEVER RAN.** This was the summary
  line for every break set in this audit: count the runs that came back all
  green. A patch that `BUILD FAILED` prints no `N passed, M failed` line at all,
  so it is not counted as still green — which is precisely what a patch that
  reddened looks like. `app-catalogue` was reported as *"20 patches, 0 still
  green"* and was 19 of 20. Five patches across five sets were in that state.
  Count the patches that DEMONSTRABLY REDDENED, and report unbuilt separately;
  `0 failed is not it ran` applies to the reporting as much as to the suite.
- **A PATCH MUST MAKE THE CODE TAKE THE WRONG BRANCH, NOT REMOVE A BRANCH.**
  `sidebar-reorder-6` describes a folder *falling through into* the list rule
  and implemented *deleting* the list rule. With that line gone there is nothing
  to fall through into, folders still reach the explicit `return false`, the
  behaviour it claimed to break was unchanged, and the suite stayed green —
  honestly. Removing a branch changes which defects are reachable, which is a
  different edit with different consequences.
- **A REFUSAL ASSERTED WITHOUT ITS PERMISSION IS HALF A RULE.** That same wrong
  patch proved something better than itself: with the list rule deleted, all 21
  checks passed. The suite asserted that a folder dropped on a project row sends
  nothing, and never that a list dropped on one sends something. **The half with
  no check is the half that can be deleted.** Whenever a check asserts that
  something is refused, look for the check asserting the matching thing is
  allowed — and if the patch that reddens one is the same edit as the patch that
  reddens the other, only one of them is real.
- **FIXING A FIXTURE INVALIDATES EVERY RESULT PREVIOUSLY MEASURED THROUGH IT.**
  Nine of `sidebar-dms`'s ten patches ran before the fixture fix that gave the
  run a second direct message; their logs say *"the server now reports 1 direct
  message(s)"* and the suite went from 13 checks to 14 in that commit. They were
  honest work against a suite that no longer exists. `check-break-freshness.mjs`
  asks this mechanically: does the run postdate the suite's last change?
- **A LOG TRUNCATED PER RUN DESTROYS THE EVIDENCE FOR THE LEDGER'S NUMBERS.**
  `wt-break.sh` truncates `break-<suite>.txt` each time, so a later single-patch
  re-run erases the full set's record. Six suites show one patch on disk for runs
  that did happen, and six ledger rows had to be withdrawn because nothing could
  support them any more. Per-run files, or an appended run header, cost nothing.
- **`git checkout -- .` REVERTS THE SOURCE. IT DOES NOT REVERT THE DATABASE.**
  A patch whose damage lands in the lane's Postgres outlives the patch, and the
  next baseline on that lane is measured against it. Caught before it was
  written, not after: a fourth `task-provenance` patch was going to clear the
  `origin` marker when a type is renamed — the suite renames the seeded type,
  so the column would have come back `null` for good and every later run of
  that suite on that lane would have failed its baseline for a reason nothing
  in the tree could explain.

  The test to apply before writing a patch: **does it write something the suite
  did not create?** Rows the suite makes itself are fine — it cleans them up,
  and a stray untyped task harms nobody. Seeded data, workspace settings and
  anything the baseline reads are not. The schema push covers `packages/db`,
  which is why a schema patch is safe; nothing covers a row a patch quietly
  edited on its way past.

  **"IT CLEANS THEM UP" IS A CLAIM TO CHECK, NOT AN ASSUMPTION.**
  `request-access` signs up a new person and adds them to the workspace, and
  its removal sat at the end of the `try`, after eight checks. Every run that
  threw earlier left another "Asking Member &lt;stamp&gt;" in the roster for
  good — and this document already records what an accumulating roster cost:
  `ui-sweep`'s reports-to picker failed on ten identically-named people.
  Break-testing is what makes this bite, because a patch's whole job is to make
  a run fail, and a suite that tidies up only on the happy path turns every red
  patch into a fixture leak. **Cleanup belongs in `finally`.** The assertion
  that the cleanup worked can stay in the `try`; they are different things and
  only one of them is a test.

### When a patch runs GREEN, read the code before you blame the check

**SEVEN** still-green patches this session and not one of them was a worthless
check. The rule that came out of it: **a green patch is a question, not a
verdict**, and the answer is one of four things.

| patch | answer |
| --- | --- |
| `sidebar-reorder-6` | the patch modelled the wrong thing — and exposed a rule with NO check |
| `mp-7-flat-bars` | the patch aimed at a comparison the suite does not make |
| `task-merge-2`, `-3` | the check could not see which of two guards refused |
| `list-name-taken-1` | same, with a unique index behind the service |
| `tfc-7-no-type-validation` | same, with an enum column behind it — and the check's own words said *"not a cast error"* |
| `tfc-6-menu-switches-tab-only` | **a product bug the check was accidentally measuring** |

Two of seven were the patch's fault, four were checks too weak to tell two
mechanisms apart, and one was a defect in the product that had been satisfying
the assertion all along. **None was a check not worth having.** A green patch
has never once, in this audit, meant "delete the check".

1. **The patch does not model its own defect.** `sidebar-reorder-6` described a
   folder falling THROUGH a rule and implemented DELETING that rule, so nothing
   was left to fall through into. Fix the patch.
2. **Another guard covers the same input.** Both `task-merge` greens were this:
   merging into your own subtask is caught by `would-nest-twice` as well as by
   the descendant rule, and an already-binned source is caught by
   `assertTaskWriteAccess` as well as by `already-binned`. Defence in depth is
   worth keeping; **a check that cannot see which guard fired is not**. Assert
   the message.
3. **There is no check for what the patch breaks.** `checklists-3` inserted
   every item at position 0 and nothing compared `position: max + 1` against
   `orderBy: asc(position)`. Write the check.
4. **The code is not what everybody thinks it is** — below.

### The guard that disagreed with its own name, comment, message and test

`mergeRefusal` had a rule keyed `target-is-descendant`, commented *"merging
into your own subtask: the survivor would be a child of the task being
binned"*, messaged *"A task cannot be merged into its own subtask"*, and
asserted by a unit test titled the same way. Its condition is
`targetChildIds.has(source.id)` — the TARGET's children containing the SOURCE,
which is a subtask merged into its PARENT. The opposite relationship.

Probed against a live API rather than reasoned about:

```
subtask → parent   400  "A task cannot be merged into its own subtask"
parent  → subtask  400  "…Subtasks only nest one level deep."
```

Five things agreed with each other and none of them agreed with the code. **The
unit test is the part worth sitting with**: it passed, it was specific, it named
the right behaviour, and it encoded the wrong relationship — a test can agree
with a bug in exactly the words that describe the fix.

Two general rules:

- **Probe, do not reason, about which branch fires.** Two minutes against a
  running API settled what half an hour of reading the condition had not.
- **ANY status-only assertion on a REFUSAL is the shape to look for**, and the
  first version of this note said `status >= 400 && status < 500` and was too
  narrow by one day. `list-name-taken` asserts `status === 409` and has the
  identical problem: the 409 comes either from `assertListNameFree`, carrying
  frame `08:50`'s sentence, or from the partial unique index on `lower(name)`
  raising a 23505 that `AllExceptionsFilter` maps to 409 with the generic
  *"That resource already exists"*. A patch making the service check
  case-sensitive changes only WHICH sentence the person reads, and the check
  saw 409 either way.

  **`AllExceptionsFilter` is why this keeps happening.** It maps 23502, 23503,
  23505, 23514, 22P02, 22001, 22003 and 23P01 to 4xx across every endpoint —
  a good safety net, and it means the database is a silent second guard behind
  every service-level validation in the product. Wherever a service check
  exists to give a constraint a human sentence, the status is the constraint's
  and only the sentence is the service's.

  **AND NOT EVERY STATUS-ONLY ASSERTION IS VULNERABLE**, which is worth saying
  as plainly as the rest: the hole needs a SECOND guard to hide behind. Every
  candidate from the `>= 400 && < 500` sweep, checked:

  | suite | second guard | verdict |
  | --- | --- | --- |
  | `task-merge` | `would-nest-twice`, `assertTaskWriteAccess` | vulnerable — fixed |
  | `ai-value` | CHECK on both benchmark columns → 23514 | vulnerable — fixed |
  | `comment-recording` | none; no constraint on comments | **safe as written** |
  | `ai-model-picker` | none; no constraint on the preference column | **safe as written** |

  Plus `list-name-taken` (`=== 409`, vulnerable, fixed) and `view-visibility`
  (`CHECK (visibility IN …)`, untested at all, now covered), which the `>= 400`
  grep never saw. The form is the thing to grep for; the second guard is what
  decides, and it is answered by reading the migrations, not the suite.
- **A refusal's message is part of its contract.** The behaviour here was never
  unsafe; a person merging a subtask into its parent was simply told about a
  merge they had not attempted, for as long as the rule has existed.

### Two more ways a number lies

- **A new check must not move the ground under an old one — and "old one"
  means EVERY later reader of the fixture, not the one you happened to think
  of.** The item-order check for `checklists` adds a third item. It was placed
  after *"two unticked items across two lists read as 2 open"*, which was the
  reader that came to mind, and before *"ticking one drops the count to 1"*,
  which then saw 2. The suite's baseline refused and the whole set was
  cancelled.

  This paragraph existed, in these words, one hour before it happened. Writing
  the rule down is not the same as applying it, and the reason is that the rule
  as first written pointed at a check rather than at a property: the property
  is *how many items the fixture has*, and every later assertion that reads it
  is in scope. Append where the fixture is spent, and grep for the thing you
  are about to change — here, `countText`.
- **TWO WRITERS, ONE FILENAME.** `break-queue.sh` logged to
  `break-queue-$LANE.log` and truncated it on startup, so arming a second queue
  on the same lane erased the first one's log while it was still writing — the
  same defect as `wt-break.sh` truncating per run, introduced in the script
  written to work around that one. Nothing was lost, because the per-run
  archives added that morning already held the results.
- **TWO WRITERS, ONE WORKING TREE — AND THE SECOND ONE WAS MINE.** Measuring
  whether three `time-estimate` patches also redden `estimate.test.ts` meant a
  loop that applies a patch, runs the test, reverts. A background typecheck job
  was doing the same three things to the same files at the same time, so the
  loop's numbers described neither state: it reported patch 5 passing the unit
  test 15/0, and patch 1 at 11/4. Run again with nothing else touching the
  tree: 14/1 and 10/5.

  I nearly wrote "this defect is caught only by the browser suite" into a patch
  header as a finding. `wt-break.sh` takes a lock for exactly this reason and
  its comment says why — "two runs sharing one worktree check out, patch and
  build over each other and every result is then about whichever run wrote
  last". **The rule applies to the hand-run loop as much as to the harness:**
  before measuring anything against the working tree, check that no background
  job is patching it, and prefer `run_in_background: false` for the measuring
  loop itself.

  The tell was there to be read: the two runs disagreed. **Two measurements of
  one thing that differ is not a reason to pick the more interesting one.**

  **AND IT HAPPENED AGAIN INSIDE THE HOUR, WITH THE RULE ALREADY WRITTEN.**
  `check-break-patches.py`, run while a background typecheck loop was applying
  and reverting patches to `task-detail-sheet.tsx`, reported four patches whose
  anchor was gone and one whose FILE was gone. The file exists. The loop had it
  checked out at that instant.

  Writing the rule down is not applying it — the same sentence this document
  already carries about the `checklists` fixture, now about itself. So the rule
  gains a mechanism instead of a reminder: **a verification command runs with
  `run_in_background: false`, or after an explicit wait on every job that
  touches the tree.** "I will remember to check" has now failed twice.
- **THE RUNNER READ FROM SOMEWHERE ELSE THAN YOU WROTE TO.** Break patches
  lived in `/tmp/claude-0/breaks` before they were committed.
  `check-break-patches.py` moved to the tracked copy and wrote down why — "the
  repository is what CI has and what survives the container" — and
  `wt-break.sh` was never brought along. Twelve patches written straight into
  `test/e2e/breaks` came back `== <name> MISSING`, and two sets of four
  reported

      patches 4 · STILL-GREEN 0 · UNBUILT 0

  which is byte-identical to four patches that all reddened. `MISSING` starts
  with `== `, is not a control line, is followed by no result line, and says
  neither BUILD nor PATCH FAILED — so it fell through every category the
  summary had. **A summary that cannot say "nothing ran" will say "nothing
  went wrong" instead.** Each outcome gets a column of its own the first time
  it is noticed, not the second: `PATCH CHANGED NOTHING` was added in the same
  edit, before it had cost anything, because it was sitting in exactly the same
  gap.

  The check for this belongs in preflight, not in a habit. Two directories
  holding the same 614 files agreed byte for byte, which is the only reason
  nothing already recorded describes the wrong patch — and that is luck, not
  a property: it held only because no patch had yet been edited in place.

### Checking the checkers

The two scripts that check the break patches were each wrong in a way the
patches themselves have taught this audit to recognise, so they are written down
as the same defects one level up.

- **A "DRY RUN" THAT EXECUTES.** `check-break-patches.py` runs each patch with
  writes redirected to a sink, because the patch's own `assert` is the test.
  Its first version seeded a fake `io` into the patch's globals — and every
  patch begins `import io`, which rebinds that name to the real module on its
  first line. It edited 62 source files while printing anchor statistics, and
  those statistics (57 failures where the truth was 6) were mostly an artefact
  of the damage it was doing to the tree it was measuring.
- **A GUARD THAT REPORTS ON THE WRONG TREE.** The fix was to compare
  `git status` before and after. The second version compared it in the directory
  the SCRIPT lives in, and the patches hardcode `/home/user/rundesk`. Running
  the checker from a clone, in order to prove the guard worked, rewrote 61 files
  in the original repo while printing *"working tree unchanged — verified
  against git status"* over the top. **Watch every tree the thing you are
  running could write to, not the one you launched it from.**
- **A GUARD THAT PASSES WHERE IT CANNOT RUN.** The same comparison returned
  `git status`'s stdout and ignored its exit code, so in any directory without a
  `.git` — an export, a tarball — the command failed, both readings were empty,
  and "nothing changed" was reported by a check with no way to tell. A guard
  must refuse where it cannot measure.
- **A BLANKET `catch {}` AROUND AN ASSERTION MAKES IT UNCONDITIONAL.** The
  eighth assertion in `check-video2-counts.mjs` compares the handoff document's
  headline against §4. Its first version referenced a binding that is
  block-scoped to the §2 parser, which throws a `ReferenceError` from outside
  that block — and the whole assertion sat in `try { … } catch { }`. So it threw
  on every run, reported nothing, and **setting the headline to 999 did not
  fail the build**. The catch now tolerates `ENOENT` and re-throws everything
  else. The general rule: a `catch` around a check must name the one condition
  it forgives, because every other condition it swallows is the check not
  running.
- **BREAK-TEST THE ASSERTION, NOT JUST THE CODE.** That bug was invisible to
  reading and took ten seconds to find by setting the number wrong and watching
  the exit code. Every assertion added to these scripts gets the same treatment:
  break it, see it fail, restore it, see it pass. Twice today that found an
  assertion that had never once run.
- **A PATCH THAT BREAKS THE GATE HAS NO CHECK SENTENCE TO NAME, AND QUOTING THE
  THROWN LINE IS NOT ONE.** `aoc-4-attach-input-unnamed` removes the testid the
  suite's opening `waitForSelector` waits for, so the run throws before its
  first `chk()` and the `EXPECTED_CHECKS` guard fails it on 0 of 13. Its header
  quoted the two lines the run prints — `"threw: page.waitForSelector"` and
  `"ran 0 checks, expected 13"` — which are runtime output, not checks, and a
  claim checker can only read them as checks the suite does not have. Say in
  prose that there is nothing to quote. **Keep the `<suite>:` prefix while doing
  it**: `check-break-coverage.mjs` reads the same line to attribute the patch,
  and rewording the header so the suite was followed by a comma instead of a
  colon cost the patch its attribution (743 → 742) with every check still
  green — one line of prose, two checkers, and only one of them noticed.
- **AN ANCHOR BEGINNING WITH SPACES CANNOT PIN INDENTATION.** A more-deeply
  indented copy of the same line contains it, so `s.count(a)` sees two and the
  patch refuses. Both cases found were correct code — a loading skeleton
  repeating its card's header, and two renderings of one list. Anchor from the
  preceding newline. And when a file really does render the same thing twice,
  the patch has to break BOTH: patching one leaves the check free to exercise
  the other and go green against a defect in the same file.

### Environment

- The API build emits extensionless imports into `packages/db/src`, so plain
  `node dist/apps/api/src/main.js` cannot resolve them. Run it through the tsx
  loader (`--require tsx/dist/preflight.cjs --import tsx/dist/loader.mjs`).
- **Lane k's port is `3020 + k`, and the shorthand `302k` stops being true at
  ten.** `PORT=302$K` with `K=10` starts an API on **30210** against the right
  database, so the lane looks alive from the process list and nothing answers
  on 3030 — and the health poll that would have caught it was written against
  the same wrong number. `fleet-up.sh` gets this right (`PORT=$((3020 + k))`);
  a runbook typed by hand does not. Arithmetic, not string concatenation.
- **Ten lanes is more Postgres than there is.** Each API holds a pool of ten
  and `max_connections` is 100, so a full fleet plus one `psql` is over the
  line. The failure arrives as `FATAL: sorry, too many clients already` inside
  a suite, which reads exactly like a product bug and is not one — two
  neighbouring suites "failed" this way and both were green on a retry. Check
  `select count(*) from pg_stat_activity` before believing a suite that dies
  in its fixture, and stop a lane you are not using.
- **A running API already has the schema the WORKING TREE has.** Because of the
  loader above, `packages/db/src/schema/*.ts` is compiled from source at require
  time — so the moment anyone adds a column, every running API instance starts
  writing it, while the database still lacks it. The symptom is
  `PostgresError: column "x" of relation "y" does not exist` from an API you
  never rebuilt, against a database you never touched. Push the schema before
  concluding anything is broken. This is also why `dist` being stale is not a
  safe assumption in either direction: the web bundle is frozen, the server
  schema is live.
- `drizzle-kit push` without `--force` waits on an interactive prompt, exits 0,
  and applies nothing. Pipe `yes` into it and pass `--force`.
- `ALLOW_SCHEMA_RESET` stays unset on anything that is not a local throwaway
  database.
- Suites need `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; the browser is
  preinstalled and must not be re-downloaded.
- Some suites stage state directly in Postgres — a column with no endpoint
  that writes it — and need `DATABASE_URL`. Without it they refuse to run,
  correctly, and every break patch then "fails" for the same irrelevant
  reason.
- **Do not build the web bundle from a tree other people are editing.** A
  bundle built during someone else's half-finished edit fails at runtime with
  no build error, and everything measured against it is noise. Build from a
  checkout nobody else is touching, or wait for a quiet tree.

### Scope

- **A partial is not a small build.** "The `/` half works" means the other half
  is a whole feature. Un-bundle partials into their real rows before estimating.
- **Record decisions as decisions.** An absence with a reason ("needs a meeting
  bot; build-vs-buy sits with the client") is a different row from an absence
  without one, and it must not quietly become "built".
- **Re-check a recorded reason before trusting it.** See *the stale reason*
  above. Two rows in this audit were closable the whole time.
- **THE SUITE USUALLY NAMES THE DEFECT IT FEARS. START THERE.** Writing a
  patch for an uncovered suite is not a blank page: read its failure messages
  and the comments beside the code it exercises, because the author has
  generally written down the exact thing that must not happen — and the guard
  against it is the thing nobody has proven. Every suite closed this way said
  it out loud first:

  | suite | where the defect was already written down |
  | --- | --- |
  | `doc-task-links` | the method's comment: *"a doc that lists it would be a way to read titles somebody is not allowed to see"* |
  | `planner-blocks` | beside the check: *"told what they did or told that a database was unhappy"* |
  | `save-comment` | the failure text: *"saved comments render in the Inbox tab too, so the Later check proves nothing"* |
  | `space-presets` | above the check: *"everything above could pass on a build that stores the answer and does nothing with it"* |
  | `list-name-taken` | the service comment explaining why its 409 exists at all |

  **The knowledge was written down every time and never turned into evidence.**
  That is the stale-reason class one level up: a sentence that describes a risk,
  accurate when written, with nothing anywhere that would notice if the risk
  arrived.
- **READ THE LINE THE CHECK DEPENDS ON, NOT THE LINE THE PATCH TOUCHES.** A
  claim verifying tells you the sentence exists in the suite. It tells you
  nothing about whether your edit reaches it. Three patches this session
  verified their claim and could not have reddened it:

  | patch | why the edit never reached the check |
  | --- | --- |
  | `custom-field-progress-4` (clamp) | no fixture makes a source report more done than it holds |
  | `mp-7-flat-bars` | the check compares Fast to MAX; the patch moved Fast past DEEP |
  | `space-presets-3` (plan filter) | the features map is built over ALL keys, so `wipLimits` is false either way |

  Each was found by opening the check and following what it actually reads —
  the fixture, the comparison, the line that builds the value. That is a
  different reading from the one that writes the patch, and it is the one that
  is skipped.

  **AND THE WORST CASE IS PATCHING THE WRONG SUBSYSTEM ALTOGETHER.**
  `save-comment`'s checks say "Inbox › Later", so I patched
  `notifications.snoozedUntil` — the snooze that puts a NOTIFICATION in the
  Later tab. The suite never touches it. It reads `task_comment_saves`, its own
  table with its own endpoint, on line 149 of the file: `select count(*) from
  task_comment_saves`. Both patches ran green because they had nothing to do
  with the feature, and every word in their headers was true about a subsystem
  nobody was testing.

  **A shared word in a UI label is not a shared implementation.** The check
  names a TABLE or an ENDPOINT somewhere; find that line before writing
  anything. It took four instances of this rule to learn that the reading has
  to start at the assertion and walk outwards, not start at the feature and
  hope to meet it.

  **AND THE FIXTURE CAN BE A COMPONENT'S LIFECYCLE.** The sixth instance cost
  two attempts at one property. `planner-priorities` claims the Planner rail
  and the person panel share one React Query key. The first check called the
  endpoint directly — nowhere near a cache. The second really did open the
  panel through the app after writing in the rail, and the patch that gives
  the panel its own key **still ran green**: the panel MOUNTS when it opens,
  which is after the write, and a `useQuery` whose key holds no data fetches on
  mount. With React Query's default `staleTime: 0`, even a populated key
  refetches on remount.

  So there was no moment at which that screen could show a stale panel. **A
  cache-staleness check needs the reader to be mounted BEFORE the write and
  still mounted after it** — and a modal that opens over the writer can never
  be. The property was not observable from a browser at all; it went to a unit
  test, and the patch was re-aimed there and verified by running it.

  The rule: before writing a check about stale state, name the moment the
  reader holds the stale value. If that moment does not exist, the check is a
  sentence about a mechanism rather than a test of one — and it will be green
  for as long as nobody asks.

  **AND WALKING OUTWARDS MEANS THE FIXTURE TOO, NOT ONLY THE SELECTOR.** The
  fifth instance was `no-dead-ends-1`, where I did read the assertion —
  `escape.locator('a[href="/app"]').count() > 0` — and then made the link
  conditional on `backTo`, reasoning that a session with no last-visited
  workspace would lose its escape. The assertion runs in the FIRST of the
  suite's two contexts, where `backTo` is set. A patch that depends on WHICH
  SESSION is in play has to be checked against the session the assertion
  actually uses; an unconditional edit does not, which is why it is the safer
  shape when either would model the defect.
- **A CLAIM CHOSEN BECAUSE IT VERIFIES IS WORSE THAN ONE THAT HAS ROTTED.**
  `check-break-claims.mjs` rejects a patch whose `# Reddens:` sentence is not in
  its suite, and the obvious way to satisfy it is to go and find a sentence that
  is. That happened twice in one session: once for a patch removing a clamp no
  fixture exercises, once for a patch about item ORDER given a sentence about
  which checklist an item lands in. Both verified. Neither was true. The right
  answers were to delete the first patch and to write the missing check for the
  second — the checker cannot tell the difference, and it is the one place where
  passing it is trivially easy and completely hollow.
- **A row's GLOSS must quote a frame or admit it cannot.** The parenthetical
  that says what a row *means* is where knowledge from outside the reference
  gets in, because it reads as description and is never re-derived. `"Add to ›"`
  carried *"(a task in more than one list)"* — ClickUp's real product, which I
  know independently, and a phrase that appears nowhere in the observations file
  or the transcript. That gloss, not the row, is what kept it classed buildable
  through fifteen passes of checking: every pass asked "does Rundesk have this?"
  and got an honest no, and none asked "does the video say this?" A closed
  submenu specifies nothing. Build only what an existing column already affords
  — the test that licensed `Convert to ›` (`parentTaskId` was already there) and
  refuses `Add to ›` (`tasks.list_id` is a single `notNull` FK with no join
  table anywhere).
- **"Blocked on the reference" is a different row from "not built yet",** and
  only the second belongs in a backlog. Four rows here are the first kind.

---

## Reporting

Three counts, every time, plus defects:

```
buildable-small:        n
buildable-large:        n
blocked-or-decided:     n
defects found while building: n
```

The fourth number is separate on purpose. It is the one that grows while the
first three shrink, and it is the reason the estimate moves.
