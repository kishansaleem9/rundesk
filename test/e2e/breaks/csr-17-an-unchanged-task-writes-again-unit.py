# `csr-7`'s edit, claimed by the unit test: every push writes the event again.
# (`ledger-rows/row-1962`)
# Reddens: unit: calendar-sync-rules.service.test.ts "changes the event it wrote rather than writing a second, and writes nothing when what the event shows has not changed"
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
print("csr-17-an-unchanged-task-writes-again-unit: `csr-7`'s edit, claimed by the unit test: every push writes the event again.")
