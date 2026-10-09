# A REMOVED SYNC LEAVES ITS EVENTS ON THE CALENDAR.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "removing the sync on the page takes its events off the calendar, and a change to a task there afterwards writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    void this.refreshAccount(rule.accountId).catch(() => undefined)\n',
     '    void this.refreshAccount.name // BROKEN: its events are left\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-9-a-removed-sync-leaves-its-events: a removed sync leaves its events')
