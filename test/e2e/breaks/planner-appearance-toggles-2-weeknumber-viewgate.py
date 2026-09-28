# The helper text says the week number is 'Only visible for the week view'. This drops
# the view from the condition, so it is drawn over a single Day column and over a Month
# grid that spans five different weeks.
#
# Reddens: planner-appearance-toggles: "and Day view draws none of it, as the frame’s own helper text requires"
#   and "nor does Month, which spans five of them" — the second was named only by a
#   legacy uppercase REDDENS line that no checker ever read.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "          {showWeekNumbers && view === 'week' && ("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '          {showWeekNumbers && ('
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dropped the week-view gate from the week number')
