# A TASK DUE AT A TIME IS THE HOUR AFTER IT, not the hour before.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "the tasks already in the folder are written to that calendar once the sync is made: a task due at a time is the hour before it, under its name — and an undated one is not"
#   or "renaming a task and moving its due time changes its event — the same event, not a second — and a change the event does not show writes nothing"
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
print('csr-4-a-due-time-is-the-hour-after: a due time is the hour after')
