# A CHANGE TO A TASK WRITES A SECOND EVENT, leaving the first.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "renaming a task and moving its due time changes its event — the same event, not a second — and a change the event does not show writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        eventId = await this.accounts.writeBlockEvent(w.account, w.event, row?.externalEventId ?? null)\n',
     '        eventId = await this.accounts.writeBlockEvent(w.account, w.event, null) // BROKEN: a second event\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-6-a-change-writes-a-second-event: a change writes a second event')
