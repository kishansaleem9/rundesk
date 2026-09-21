# Verification lanes

The e2e suites were one-at-a-time because the environment was one-at-a-time:
one Postgres, one API on `:3011`, one `apps/web/dist`. These three scripts
turn that into N independent lanes, so N suites run at once.

Lane *k* is database `rundesk_v<k>` on port `302k`. The databases are restored
from a dump of `rundesk_pristine`, so every lane starts from the same seed and
no lane can see another's rows.

```bash
bash scripts/e2e-lanes/fleet-up.sh 4        # create 4 lanes from the pristine dump
bash scripts/e2e-lanes/fleet-sync.sh 4      # push the CURRENT schema, restart lanes
bash scripts/e2e-lanes/verify.sh <suite> 2  # run one suite in lane 2
```

Four at once:

```bash
( verify.sh list-view-controls 1 & verify.sh checklists 2 &
  verify.sh list-filters 3 & verify.sh bookmarks 4 & wait )
```

## Two things that will bite you

**`apps/web/dist` is shared, and that is fine — until you rebuild it.** A suite
only ever reads the bundle, so lanes can share one. Break tests rebuild, so a
break test cannot share a dist with anything; give each one its own `--outDir`
or run them one at a time.

**A running API already has the schema your WORKING TREE has.** The API build
emits extensionless imports into `packages/db/src`, so it can only run under
the tsx loader — which compiles the schema from *source* at require time. The
moment anyone adds a column, every running API starts writing it while the
database still lacks it, and you get

```
PostgresError: column "deleted_at" of relation "tasks" does not exist
```

from an API you never rebuilt, against a database you never touched. That is
what `fleet-sync.sh` is for. Run it after any schema change, before concluding
anything is broken.

## Break tests: `wt-break.sh`

```bash
bash scripts/e2e-lanes/wt-break.sh 3 focus-pill fp-1-... fp-2-...   # worktree 3, lane 3
```

Lane *k* here also means the git worktree `/tmp/claude-0/wt<k>` — a detached
checkout with `node_modules` symlinked in, so three break runs go at once
without patching over each other. Patch scripts hardcode `/home/user/rundesk`,
so each is rewritten into the worktree path before it runs; the tree the agents
work in is never touched.

**The script refuses to run rather than produce an unreadable result**, which
is the only useful behaviour once you have been burned by one:

| exit | meaning |
|---|---|
| 3 | that worktree is already break-testing — retry, do not switch lanes |
| 4 | the worktree cannot be moved to `HEAD`, so results would be about the wrong tree |
| 5 | the **unpatched** suite is not green, so no patch below could be told apart from what is already broken |

Exits 4 and 5 exist because of one concrete failure. The worktrees are detached
checkouts made once and never moved, so they drift behind the branch as work
lands. `list-card-cover` was break-tested against a tree two commits old: four
of its checks failed on **every** patch, including patches touching nothing near
them, because those four were already failing unpatched. Every result in that
file looked like a result and meant nothing. The script now syncs the worktree
to `HEAD` first, then runs the suite with **no patch at all** and writes

```
== BASELINE (no patch) 26 passed, 0 failed
```

as the first line of `/tmp/claude-0/break-<suite>.txt`. A patch that reddens a
check which was already red is not evidence, and the baseline is what lets you
see that at a glance instead of inferring it from a pattern across runs.

## Why the dump rather than `CREATE DATABASE ... TEMPLATE`

`TEMPLATE` refuses while anything is connected to the source, and the API holds
connections to `rundesk_pristine`. The dump is under a megabyte and takes about
150ms, so there is nothing to gain by being clever.
