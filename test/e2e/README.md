# Live end-to-end sweeps

Two suites that drive a **running** stack rather than mocks. They exist because
several defects in this project were invisible to unit tests and to typecheck —
a search filter that only misbehaved with Meilisearch up, a settings route whose
allowlist silently dropped a deep link, an i18n placeholder that rendered
literally. All three were found by driving the real thing.

```
# API sweep — every path taken from the running route table
python3 test/e2e/api-sweep.py

# Browser sweep — Chromium against the dev server
node test/e2e/ui-sweep.mjs
```

Both expect the local stack: Postgres on 55432 (`e2e_live`), the API on 3001,
and Vite on 5173. Both sign in as a seeded account; adjust the constants at the
top if your fixtures differ.

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
