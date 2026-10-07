# A CALENDAR THAT REFUSES IS LEFT OUT IN SILENCE, its week drawn as a free one (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "and a calendar whose grant is gone is named as refused, rather than read as an empty one"
#   "and says, by its address, which calendar it could not read"
#   "Meetings’ “Upcoming” lists the next meeting in a connected calendar, with whose calendar it is, and names the one it could not read"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-accounts.service.ts'
a = '        unread.push({\n'
b = '        void ({\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-3-a-refused-calendar-is-unsaid: a calendar that refuses is left out in silence, its week drawn as a free one (`found-25-sep/connected-calendars-read-by-nothing`)')
