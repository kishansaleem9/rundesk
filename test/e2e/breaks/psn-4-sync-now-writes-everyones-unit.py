# `psn-2`'s edit, claimed by the unit test: Sync now writes everybody's calendars.
# (`ledger-rows/row-1904`)
# Reddens: unit: calendar-sync-rules.service.test.ts "Sync now writes only the calendars it is given, each event whether or not it looks changed"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const only = (accountId: string) => !opts.accounts || opts.accounts.has(accountId)\n',
     "    const only = (accountId: string) => accountId.length > 0 // BROKEN: everybody's calendars\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("psn-4-sync-now-writes-everyones-unit: `psn-2`'s edit, claimed by the unit test: Sync now writes everybody's calendars.")
