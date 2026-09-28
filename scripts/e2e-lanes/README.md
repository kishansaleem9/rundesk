# Verification lanes

The e2e suites were one-at-a-time because the environment was one-at-a-time:
one Postgres, one API on `:3011`, one `apps/web/dist`. These three scripts
turn that into N independent lanes, so N suites run at once.

Lane *k* is database `rundesk_v<k>` on port `302k`. The databases are restored
from a dump of `rundesk_pristine`, so every lane starts from the same seed and
no lane can see another's rows.

```bash
bash scripts/e2e-lanes/fleet-up.sh "1 2 3 4"   # create lanes 1-4 from the pristine dump (a list, never a count)
bash scripts/e2e-lanes/fleet-sync.sh 4      # push the CURRENT schema, restart lanes
bash scripts/e2e-lanes/verify.sh <suite> 2  # run one suite in lane 2
```

Four at once:

```bash
( verify.sh list-view-controls 1 & verify.sh checklists 2 &
  verify.sh list-filters 3 & verify.sh bookmarks 4 & wait )
```

## Three things that will bite you

**`apps/web/dist` is shared, and that is fine — until you rebuild it.** A suite
only ever reads the bundle, so lanes can share one. `vite build` empties the
directory before writing, though, so a run that starts mid-build dies on
`ENOENT …/index.html` — and a run that starts just *after* somebody else's
build finishes reports an ordinary pass or fail about a tree that is not the
one it is testing. With four agents working at once this happened within the
hour.

So `verify.sh` prefers `/tmp/claude-0/dist-<lane>` when that lane has built
one:

```bash
bash scripts/e2e-lanes/refresh-dists.sh "1 2 3 4"
```

**And a private bundle is still stale, it is just stale privately.** Nothing
ages those out. A full regression was run here against four bundles built
three hours and six source files earlier, and every result from those lanes
was about code that no longer existed. `verify.sh` now **refuses** (exit 6)
when any source file under `apps/web/src`, `packages/ui/src` or
`packages/feature-flags/src` is newer than the bundle it is about to measure,
names three of the offenders, and prints the rebuild command. It refuses
rather than rebuilding for the same reason `wt-break.sh` refuses: seven lanes
each firing their own `vite build` on four cores turns one forgotten rebuild
into a thundering herd.

`verify.sh` exits with the suite's own code, or refuses before running it:

| exit | refused because |
|------|-----------------|
| 6 | the lane's bundle is older than a web source file — anything under `apps/web/src`, `packages/ui/src`, `packages/feature-flags/src`, or `apps/web/index.html`, the Vite/Tailwind/PostCSS configs and `public/` |
| 7 | the API build is older than `apps/api/src`, `packages/db/src` or `packages/feature-flags/src` — or the lane's API process started BEFORE the last build, so it still serves the previous one (`build-api.sh` with no lanes named builds and restarts nothing) |
| 8 | the process on the lane's port is not serving this tree at all — a break worktree's API left running by `wt-break.sh` |
| 9 | the lane's database does not have the schema the source says — an index, a constraint, a column or a default differs from `rundesk_schema_ref` (the pristine dump with the current schema source pushed onto it; `lane_schema_drift` in `lane-env.sh`) |

The scans use `find -newer`, so a file with `$` in its name (TanStack routes:
77 of them) is seen like any other; an earlier `xargs sh -c` expanded the `$`
away and never saw them.

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
| 4 | the worktree cannot be moved to `HEAD`, **or its API or web build failed**, so there would be nothing trustworthy to measure |
| 5 | the **unpatched** suite is not green, so no patch below could be told apart from what is already broken |

Exit 4 covers the builds because they used to run unchecked. One was killed
part-way by a stray `pkill vite`, the worktree was left with no `dist` at all,
and the next run died inside the suite on
`ENOENT …/wtN/apps/web/dist/index.html` — which reads as a broken suite rather
than as a build that never finished. A worktree with no bundle is also built
once before the baseline, since the sync block only runs when the revision
differs and a never-built worktree would otherwise slip past it.

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
