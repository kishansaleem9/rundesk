# Break patches

573 one-line defects, each aimed at exactly one check in `test/e2e/`.

A green suite is not evidence. **A check is only worth its line in the log once
something has watched it go red**, and these are the somethings: each file edits
one anchor in one source file, the suite is rebuilt and re-run, and the check it
names must fail. `scripts/e2e-lanes/wt-break.sh` drives that loop against an
isolated worktree and its own database lane, so a patch can never reach the tree
you are working in.

## Why they are in git

They were not, until 21 September. They lived in `/tmp/claude-0/breaks` on a
container that had already been reclaimed once, taking about eighty commits with
it. 479 KB of the most expensive artefact in this audit — every one hand-written
against a specific check, most of them rewritten at least once — sat in the one
directory guaranteed not to survive the machine.

## The shape of a patch

```python
# What the defect IS, in the product's terms.
# Reddens: <suite>: "<the check's exact sentence>"
import io
p = '/home/user/rundesk/<file>'
a = '<the anchor, exactly as it appears>'
b = '<what it becomes>'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('<file>: <what a reader should now expect to be broken>.')
```

`wt-break.sh` rewrites the hardcoded `/home/user/rundesk` into the worktree it is
running against, so the path above is right as written.

The `== 1` assertion is the whole safety property and is never relaxed to `>= 1`.
Zero means the code moved and the patch is aimed at nothing; two means the code
it names is duplicated, which is either a defect in the product or a second
rendering the patch must decide about deliberately.

## Checking them without running them

```
python3 scripts/check-break-patches.py     # dry-apply all 573, report the misses
node scripts/check-break-freshness.mjs     # was each run made against today's suite?
```

The first answers "would this patch still find its line", in about a second,
against the working tree. The only other way to learn it is to run a set — eight
minutes — and read one `PATCH FAILED` line out of a long log.

Both scripts exist because of specific failures, written in their headers.
`check-break-patches.py` in particular edited 62 source files on its first run
while claiming to be a dry run, and now verifies `git status` before and after
and aborts if a byte changed.

## Two hazards worth knowing before you write one

**An anchor that begins with spaces cannot pin indentation.** A more-deeply
indented copy of the same line contains it, so `s.count(a)` sees two. Files with
a loading skeleton, a mobile variant, or any second rendering of the same markup
will do this — and those are the files most worth breaking. Anchor from the
preceding `\n` and the indentation becomes exact.

**A patch that does not compile proves nothing, and does not look like nothing.**
`app-catalogue-20` deleted a member from an `as const` tuple that generates a
union; four unrelated call sites stopped type-checking and the patch never
reached a check. In a summary counting how many patches were *still green*, a
patch that never ran is indistinguishable from one that ran and reddened —
`0 still green` was reported for a set that had proved 19 of 20. Break what the
code DOES, not what it is allowed to say.
