# The fetch range goes back to the week while the grid draws whatever the span
# asked for.
#
# The bug the suite says nearly shipped, and the comment on the lines that
# change says it in full: "This read `weekStart` to `weekStart + 7` while the
# grid drew whatever the view asked for — so Month would have drawn thirty days
# and fetched seven of them, and the other twenty-three would have looked
# genuinely empty."
#
# That is the worst available failure for a calendar. Nothing errors, nothing
# is missing from the page, and twenty-three days report — confidently, in
# their own empty cells — that there is no work in them. A person trusts an
# empty calendar in a way they never trust an error.
#
# `weekStart` is still in scope as the fallback on both lines, which is what
# makes the edit a two-token one: the `??` already names it, and using it
# directly reads like a simplification of a needlessly clever expression.
#
# ONE CHECK, AND IT IS THE ONE WRITTEN FOR IT. The month grid still draws
# thirty-one cells, the selector still works, the arrows still move a month,
# the shortcuts still fire — every check except the block staged late in the
# month, which is fetched by nobody.
#
# NOT CAUGHT BY THE UNIT TEST — 10 pass / 0 fail — and that is the division of
# labour working. `plannerRange` is untouched and still correct; the defect is
# in the PAGE, which decides what to ask the server for. No module test can
# see a component that ignores the module.
#
# Reddens: planner-views: "a block late in the month is actually fetched and drawn"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = """  const rangeFrom = days[0] ?? weekStart
  const rangeTo = addDays(days[days.length - 1] ?? weekStart, 1)
"""
b = """  const rangeFrom = weekStart
  const rangeTo = addDays(weekStart, 7)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the fetch asks for a week whatever the grid draws.')
