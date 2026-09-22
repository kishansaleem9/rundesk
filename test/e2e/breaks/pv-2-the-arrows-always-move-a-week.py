# The arrows move seven days in every view, including Month.
#
# `plannerStep`'s comment is the specification: "One span per press, which is
# the only stepping that does not skip or repeat days: a Month view stepping
# seven days would show the same fortnight twice." That is exactly what this
# patch does — press next in Month and the anchor moves a week, which lands
# inside the same calendar month three times out of four.
#
# So the grid redraws the SAME month, the header shows the same name, and the
# arrow appears not to work. The fourth press crosses into the next month and
# it appears to work again, intermittently, which is how an arrow gets reported
# as flaky rather than as wrong.
#
# The month branch exists only for this and carries a second comment about
# landing on the 1st so a 31-day month cannot skip a 30-day one. Deleting the
# branch takes both decisions with it — and `addDays(anchor, 7)` is what the
# Planner did before the span selector existed, so this is the arithmetic
# reverting rather than being invented.
#
# ONE CHECK. The selector, the grid, the fetch and the shortcuts are all
# untouched, so the failure names the arrows — which is why the suite reads the
# header's month LABEL rather than the grid: the grid looks the same either
# way, and that is the point.
#
# ALSO CAUGHT BY `planner-view.test.ts`, 7 pass / 3 fail — `plannerStep` is
# date arithmetic and the module exists partly so it can be tested without a
# browser. Measured in the foreground.
#
# Reddens: planner-views: "next in Month view moves to a different month"
import io
p = '/home/user/rundesk/apps/web/src/lib/planner-view.ts'
a = """  if (view === 'month') {
    // The 1st, so stepping out of a 31-day month into a 30-day one cannot
    // land on a date that does not exist and silently skip a month.
    return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)
  }
  const span = view === 'day' ? 1 : view === 'four' ? 4 : 7
"""
b = """  const span = view === 'day' ? 1 : view === 'four' ? 4 : 7
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-view.ts: every arrow press now moves seven days.')
