# EVERY PUSH WRITES THE EVENT AGAIN, whatever changed.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "renaming a task and moving its due time changes its event — the same event, not a second — and a change the event does not show writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (row && row.fingerprint === w.fingerprint && !force) {\n',
     "    if (row && row.fingerprint === w.fingerprint && !force && process.env.CSR_NEVER === 'yes') { // BROKEN: written again\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-7-an-unchanged-task-writes-again: an unchanged task writes again')
