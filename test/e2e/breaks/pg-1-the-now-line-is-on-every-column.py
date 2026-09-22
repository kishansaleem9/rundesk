# The red now-line is drawn in every column instead of today's.
#
# `col === nowColumn` goes. The suite's failure message is the whole argument:
# "one per column would make every day look like now." A calendar's now-line is
# the only mark on it that is a claim about the present moment, and seven of
# them say nothing — worse, they say the same thing about Monday and about
# Friday, so the one glance the line exists for stops working.
#
# It is a two-clause guard where the first clause is about whether to draw at
# all and the second about where, so dropping the second reads as removing a
# condition that repeats the loop variable.
#
# ONE CHECK. "Exactly one day is marked as today" passes — `data-today` comes
# from `isToday` and is untouched — and the hour-count check passes too. Only
# the line count fails, which is why the suite counts the lines rather than
# asking whether one is present.
#
# Reddens: planner-grid: "and the red now-line is drawn once"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "                  {nowOffset !== null && col === nowColumn && ("
b = "                  {nowOffset !== null && ("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the now-line is drawn in every column.')
