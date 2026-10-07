# THE PLANNER NAMES NO CALENDAR IT COULD NOT READ (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "and says, by its address, which calendar it could not read"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '          {accountCalendarOn && calendarEvents && (calendarEvents.unread.length > 0 || calendarEvents.truncated.length > 0) && (\n'
b = '          {false && accountCalendarOn && calendarEvents && (calendarEvents.unread.length > 0 || calendarEvents.truncated.length > 0) && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-11-the-planner-names-no-unread-calendar: the planner names no calendar it could not read (`found-25-sep/connected-calendars-read-by-nothing`)')
