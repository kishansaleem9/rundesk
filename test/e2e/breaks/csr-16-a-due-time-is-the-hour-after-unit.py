# `csr-4`'s edit, claimed by the unit test: a task due at a time is the hour after it.
# (`ledger-rows/row-1962`)
# Reddens: unit: calendar-sync-rules.service.test.ts "a due date with a time is the hour before it"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      ? { start: new Date(due.getTime() - HOUR_MS), end: due, allDay: false }\n',
     '      ? { start: due, end: new Date(due.getTime() + HOUR_MS), allDay: false } // BROKEN: the hour after\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("csr-16-a-due-time-is-the-hour-after-unit: `csr-4`'s edit, claimed by the unit test: a task due at a time is the hour after it.")
