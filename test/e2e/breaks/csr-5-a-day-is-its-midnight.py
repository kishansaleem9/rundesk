# A TASK DUE ON A DAY WITH NO TIME IS AN HOUR AT ITS MIDNIGHT, not the day.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "a task made there afterwards with a due day and no time is that day’s event"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      : { start: dayStart(due), end: new Date(dayStart(due).getTime() + DAY_MS), allDay: true }\n',
     '      : { start: dayStart(due), end: new Date(dayStart(due).getTime() + HOUR_MS), allDay: false } // BROKEN: a day is its midnight\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-5-a-day-is-its-midnight: a day is its midnight')
