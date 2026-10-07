# A CANCELLED GOOGLE EVENT IS READ as one that happens (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: unit: calendar-events.test.ts "a Google event is read as an instant in UTC, an all-day one as its days, and a cancelled one not at all"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-events.ts'
a = "  if (!item || item.status === 'cancelled') return null\n"
b = '  if (!item) return null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-13-a-cancelled-event-is-read-unit: a cancelled google event is read as one that happens (`found-25-sep/connected-calendars-read-by-nothing`)')
