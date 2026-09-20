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
- **One runner at a time.** There is a single Postgres, a single API on `:3011`,
  and a single `apps/web/dist`. Two suites in parallel will interleave and the
  failures will look like flakes.
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
- **One runner per worktree, enforced.** Two break runs sharing a checkout
  check out, patch and build over each other, and every result afterwards is
  about whichever wrote last. Take a lock.
- **A break patch goes stale when the code gets more robust.** One patch
  removed the `isArchived` filter from a list query and the check still
  passed — because a later fix had added `isNull(deletedAt)` *beside* it. Two
  independent conditions hid the row, so removing one proved nothing. That is
  good code and a bad patch: rewrite the patch to remove both, rather than
  concluding the check is weak.
- **A worktree is pinned at the commit you created it from.** Results are
  about that commit, not about HEAD. Update it, or say which commit the
  numbers describe.
- **A patch that does not compile proves nothing**, and the harness must say
  so out loud rather than counting it among the confirmed.

### Environment

- The API build emits extensionless imports into `packages/db/src`, so plain
  `node dist/apps/api/src/main.js` cannot resolve them. Run it through the tsx
  loader (`--require tsx/dist/preflight.cjs --import tsx/dist/loader.mjs`).
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
