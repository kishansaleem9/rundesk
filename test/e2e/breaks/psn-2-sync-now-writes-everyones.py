# SYNC NOW WRITES EVERYBODY'S CALENDARS, not only the presser's.
# (`ledger-rows/row-1904`)
# Reddens: planner-sync-now: "Sync now writes only the presser’s calendars: the colleague’s deleted event stays deleted after the member’s press, and their own press writes it again with the task never pushed, answering how many tasks it went through"
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
print("psn-2-sync-now-writes-everyones: sync now writes everyone's")
