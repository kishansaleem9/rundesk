# Live end-to-end sweeps

Suites that drive a **running** stack rather than mocks. They exist because
several defects in this project were invisible to unit tests and to typecheck —
a search filter that only misbehaved with Meilisearch up, a settings route whose
allowlist silently dropped a deep link, an i18n placeholder that rendered
literally, a work day the API accepted and then discarded. All were found by
driving the real thing.

```
# Depth: the things built most recently, exercised hard
python3 test/e2e/api-sweep.py
node   test/e2e/ui-sweep.mjs

# Breadth: one honest check per entry in the ClickUp overview audit
python3 test/e2e/video-regression.py
node   test/e2e/video-regression.mjs

# Single features, kept as their own files so a failure names itself
python3 test/e2e/a39-dm-shared.py       # what two people share
node   test/e2e/a39-dm-tabs.mjs         # the DM Chat/Calendar/Tasks strip
python3 test/e2e/a61-meeting-loop.py    # meeting notes → tasks that name the meeting
node   test/e2e/a61-meeting-record.mjs  # a meeting that survives a reload
```

All expect the local stack: Postgres on 55432 (`e2e_live`), the API on 3001,
and Vite on 5173. All sign in as a seeded account; adjust the constants at the
top (or the `E2E_EMAIL` / `E2E_PASSWORD` / `BASE` / `API` / `WS` env vars) if
your fixtures differ.

The `video-regression.*` pair is organised by the refs in
`docs/clickup-overview-coverage-audit.md`, so a failure points at a line in the
audit rather than at a route. The split between them is not arbitrary: the
Python half covers what an endpoint can answer for, the browser half covers the
things she pointed at on screen — a tab strip, a padlock, a filter builder —
where "the endpoint answers" proves nothing about whether anyone can reach it.

## The rules these suites hold themselves to

**Assert on responses, never on source.** A test that reads the code it is
testing proves the code matches itself.

**Assert the negative too.** A feature that cannot say "no" has not been built.
Every section checks the refusals — a reporting cycle, a duplicate holiday, a
foreign workspace id, a request with no token — as loudly as the happy path.

**Prove isolation with a real outsider.** The obvious second account here is a
`workspace_admin` of the same workspace, so asserting against it "finds" a leak
that is correct behaviour. `api-sweep.py` uses an account that is genuinely not
a member, in both directions.

**Seed what you search for.** A type filter that returns nothing looks the same
whether the filter works or the database is empty. The search section seeds one
row of every entity type under a token nothing else matches, so an empty result
is a real gap.

**Clean up at both ends.** `purge_fixtures()` runs before *and* after. A crashed
run leaves rows behind, and a leftover row is exactly how a later run passes for
the wrong reason — that happened once here, with a holiday date.

**Verify the teardown.** The last checks assert the workspace is back to its
starting state, rather than assuming the deletes landed.

**Drive the control that exists.** Several controls here are `<select>`s and
clickable `<div>`s rather than buttons. A `.click().catch(() => {})` on a
selector that matches nothing passes silently and proves nothing; every
interaction in `ui-sweep.mjs` targets what the discovery pass actually found.

**Say what you did not test.** The deliberate skips (in-app calling, Super
Agents, cross-app search, auto-transcription) are printed as SKIP with the
reason. A sweep that quietly omits what it does not cover reads as coverage it
does not have.

**Suspect the harness first.** Most red in these files has been the test
guessing a route or a field name. Before recording a defect, check the shape
against the running route table — `/api/docs-json` — and against the DTO. Real
bugs found this way still outnumber nothing, but they were a minority of the
first run's failures every single time.

**Assert on what the user sees, not on what the DOM holds.** The DM panel hides
the composer instead of unmounting it, precisely so a draft survives. Counting
`textarea` nodes there passes when the feature is broken and fails when it
works; `textarea:visible` is the assertion that means something.
