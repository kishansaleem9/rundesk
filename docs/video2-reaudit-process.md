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
- **A break patch goes stale when the code gets more robust.** One patch
  removed the `isArchived` filter from a list query and the check still
  passed — because a later fix had added `isNull(deletedAt)` *beside* it. Two
  independent conditions hid the row, so removing one proved nothing. That is
  good code and a bad patch: rewrite the patch to remove both, rather than
  concluding the check is weak.
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
