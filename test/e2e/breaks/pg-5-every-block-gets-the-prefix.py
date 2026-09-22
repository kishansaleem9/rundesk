# Every block is titled "Work on <label>", including the ones nobody typed a
# task for.
#
# `b.taskId && b.label ? … : …` loses its `taskId` test, so a block somebody
# typed by hand comes back prefixed: "An all-day thing" becomes "Work on An
# all-day thing". The prefix is a claim about where a block came from — frame
# `14:45` shows it on a block made by dragging task `dbgdh` — and putting it on
# everything makes it say nothing.
#
# The condition is a two-part guard in a ternary whose interesting half looks
# like the `b.label` null check, so dropping the other reads as simplifying a
# double-guard on the same object.
#
# ONE CHECK, AND IT IS THE PAIR'S SECOND HALF. "A task-backed block reads 'Work
# on <task>'" passes — that block is prefixed either way — and "while a block
# that is not about a task keeps its own words" fails. The suite asserts both
# because a prefix applied to everything satisfies the first on its own, which
# is the same shape as every other filtered-claim check in this audit: the one
# that must NOT have it is the claim.
#
# Reddens: planner-grid: "while a block that is not about a task keeps its own words"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "  const blockLabel = (b: Block) => (b.taskId && b.label ? `${prefix} ${b.label}` : b.label ?? '')"
b = "  const blockLabel = (b: Block) => (b.label ? `${prefix} ${b.label}` : b.label ?? '')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: every block is prefixed, not only the task-backed ones.')
