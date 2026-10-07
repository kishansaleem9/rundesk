# THE GRID DRAWS NO TIMED EVENT of a connected calendar (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "the planner draws a connected calendar’s timed event in its day’s column and its all-day event in the all-day row"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '                    .filter((ev) => !ev.allDay && sameDay(new Date(ev.start), d))\n'
b = '                    .filter((ev) => false && !ev.allDay && sameDay(new Date(ev.start), d))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-10-the-grid-draws-no-timed-event: the grid draws no timed event of a connected calendar (`found-25-sep/connected-calendars-read-by-nothing`)')
