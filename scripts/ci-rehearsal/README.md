# CI rehearsal

The repository is private, so every minute CI runs is billed, and a full run
is about two and a half hours: Verify about fifteen minutes, Browser suites
about five, and the Postgres harnesses the rest. This runs the same steps on
this machine first, from what is committed, so a push goes out only once they
all pass here, where a failure costs nothing.

```bash
bash scripts/ci-rehearsal/all.sh            # every job; about six hours here
```

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
- **Speed.** The runner is about 2.4 times faster, so a step that is close to
  its cap there is flagged here, not timed out.

Every step runs here even after a failure, to find them all at once; the
workflow itself stops at its first, to save minutes.

Needs root, the Postgres 16 server binaries, `pip install pyroute2`, and the
`en_US.utf8` locale (`localedef -i en_US -f UTF-8 en_US.UTF-8`); `all.sh` says
which is missing.
