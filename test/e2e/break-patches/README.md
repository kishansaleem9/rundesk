# Break patches

One script per assertion. Each edits the source so that **exactly one check**
in one suite should go red, and prints what it did. Applying it, rebuilding,
and watching that check fail is step 6 of
`docs/video2-reaudit-process.md` — the step that separates a check from
decoration, and the one most easily skipped, because a suite that is already
green gives no reason to doubt it.

They are kept because writing them is most of the work and running them is
cheap. A suite arriving without its patches is a suite nobody has shown can
fail.

## Running them

`scripts/e2e-lanes/wt-break.sh <lane> <suite> <patch> [<patch> …]` applies each
in an isolated git worktree, rebuilds only what the patch touched, runs the
suite, and restores. `scripts/e2e-lanes/drain.sh` walks a queue of sets across
the worktrees. Both files carry their reasoning in comments.

## The rules a patch has to follow

- **Anchor on something that occurs exactly once**, and `sys.exit` if it does
  not. An anchor that matches twice edits the wrong place; one that matches
  zero times silently does nothing and the run reports the suite still passing.
- **Leave a visible marker** — a testid suffixed `-DISABLED`, or a `BROKEN:`
  comment. `scripts/check-no-break-patches.mjs` fails the build on both, which
  is how one of these stops being shipped by accident. One was:
  `43f7b57` carried a hidden Add-fields button for an hour.
- **The output must still compile.** A patch that does not build proves
  nothing about the check it was aimed at, and must be counted as unproven
  rather than folded into a total.
- **Verify by parsing, never by executing.** A harness that stubs `io` in the
  patch's globals does not work: each script does its own `import io`, which
  rebinds the name to the real module and writes to the live tree. Three
  separate people hit exactly this in one day. Parse with `ast`, or copy the
  targets into a scratch directory and rewrite the paths inside the patch.

## Two failure modes that look like a weak check and are not

**The patch is inert.** `hidden` loses to any explicit `display`, so adding it
to an element carrying Tailwind's `flex` changes nothing. A `style` prop added
above an existing one loses too — duplicate JSX props resolve in source order.
Both happened to the same patch, consecutively.

**The code got better.** One patch removed the `isArchived` filter from a list
query and the check still passed, because a later fix had added
`isNull(deletedAt)` *beside* it: two independent conditions hid the row, so
removing one proved nothing. That is good code and a stale patch — rewrite the
patch, do not weaken the check.

## Paths

Each script hardcodes `/home/user/rundesk`. `wt-break.sh` rewrites that to the
worktree before running, so the absolute path is deliberate and should stay.
