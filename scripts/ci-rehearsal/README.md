# CI rehearsal

The repository is private, so every minute CI runs is billed, and a full run
is long: the one that passed on 1 October took 141 minutes, one job after
another (Verify 25.5, Browser suites 7, the Postgres harnesses 108). Runners
differ: on 1 October one was 2.4 times faster than this machine and the next
only 1.38. This runs the same steps on this machine first, from what is
committed, so a push goes out only once they all pass here, where a failure
costs nothing.

```bash
bash scripts/ci-rehearsal/all.sh            # every job; about two hours here
```

## What a push runs, and the record CI trusts (2 November)

CI runs what a push can affect, and trusts a passing local rehearsal of the
same code (the owner: "test only what changed", and "rehearse everything
locally and only push the code, so CI is green without rehearsing it all
again"). `scripts/ci-affected.mjs` decides both, for CI's `changes` job and
for the rehearsal alike:

- the suites a push can affect are read from the code: the API routes, pages
  and element ids its changed files reach through every importer. The schema,
  CI itself, the test helpers, the app's shell, the API's shared code and any
  path no rule knows run everything; prose runs nothing heavy;
- the made-sweep's 75-minute mutation run only when its own code changes
  (its cases run once every time);
- `docs/rehearsals/latest.json`, written by a rehearsal whose every step
  passed, is trusted when it names a commit in the push's history, nothing
  but prose changed after it, and it ran at least what the push needs. CI
  then runs lint, types and the unit tests itself, and nothing heavy.

```bash
bash scripts/ci-rehearsal/affected.sh          # what the push can affect; minutes for a small change
git add docs/rehearsals/latest.json && git commit -m "Rehearsed <what>"   # then push
bash scripts/ci-rehearsal/all.sh               # everything; records a full pass too
```

`affected.sh` takes the push's base from the branch's upstream (or its first
argument) and refuses an uncommitted tree: a record names a commit.

One job, or some of its steps:

```bash
bash scripts/ci-rehearsal/checkout.sh /home/runner/work-x
bash scripts/ci-rehearsal/launch.sh postgres-harnesses 0,1 private-pg /home/runner/work-x \
  /home/runner/ci-rh/x --steps 5-6,8,11-15,60    # setup, then one suite
```

## What it copies from the runner

- **The checkout.** Shallow, of the commit, at `/home/runner/work/rundesk/rundesk`,
  with this checkout and `/tmp` hidden. The first failure it found was a
  self-check naming `/home/user/rundesk`, which the runner does not have.
- **The steps.** Read from `ci.yml` itself: each `run:` with its job's and its
  own `env`, its `working-directory`, `bash -e`, as the runner runs them.
- **Node.** The job's own `node-version`, from `/opt/node<version>`, first on
  `PATH`. `/usr/local/bin` holds a Node 20, whose ICU prints local midnight
  as "24:00", and a rehearsal that found it first failed a unit test the
  runner's 22 passes.
- **The database.** A Postgres 16 of the job's own, with `rundesk_calls` empty
  and the `en_US.utf8` collation of the service image: it sorts `a, A, b, B`
  where the lanes' `C.UTF-8` sorts `A, B, a, b`.
- **Two CPUs** per job, and no network beyond this machine, while a browser
  still reports itself online (`netns-up.py`).

## What it cannot copy

- **The browser.** The runner installs the Chromium of the pinned Playwright;
  the suites here use `/opt/pw-browsers`.
- **The internet.** The runner can reach Google Fonts and the OAuth providers;
  nothing here can.
- **Speed.** Every limit is checked against the slow runner (1.3 times this
  machine): a step within a fifth of its cap, or a job within a fifth of its
  `timeout-minutes`, fails the rehearsal. Verify's 25 minutes cut off the first
  full run at step 72 of 76 with every step green; this check would have
  caught it.

Every step runs here even after a failure, to find them all at once; the
workflow itself stops at its first, to save minutes.

Needs root, the Postgres 16 server binaries, `pip install pyroute2`, and the
`en_US.utf8` locale (`localedef -i en_US -f UTF-8 en_US.UTF-8`); `all.sh` says
which is missing.
