# A CALENDAR'S FAILURE FAILS THE BLOCK: the request answers 500 for a block it saved (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "a block its calendar does not take is saved here all the same, and the answer says it was not written"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = "      return { calendar: { ...said, written: false, reason: err instanceof CalendarRefused ? 'refused' : 'failed' } }\n"
b = '      throw err\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ccl-8-a-calendar-failure-fails-the-block: a calendar's failure fails the block: the request answers 500 for a block it saved (`found-25-sep/connected-calendars-read-by-nothing`)")
