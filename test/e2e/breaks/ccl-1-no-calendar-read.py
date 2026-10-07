# NO CONNECTED CALENDAR IS READ: its events are dropped as they arrive (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "the events of a connected calendar are read: a timed one at its instants, an all-day one by its days, each with its account"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-accounts.service.ts'
a = '        events.push(...r.got.events)\n'
b = '        void r.got.events\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-1-no-calendar-read: no connected calendar is read: its events are dropped as they arrive (`found-25-sep/connected-calendars-read-by-nothing`)')
