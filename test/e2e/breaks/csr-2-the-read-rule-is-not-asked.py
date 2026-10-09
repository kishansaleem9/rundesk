# A SYNC TAKES WHAT ITS OWNER MAY NOT OPEN, AND GOES ON TAKING ONCE THEY HAVE LEFT.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "a sync takes only what its owner may open: the admin’s private list in the synced folder is not written to the member’s calendar — the member is refused it — while the admin’s own sync of the folder writes it to theirs"
#   or "once the member has left the workspace their sync writes nothing more — the task it held comes off their calendar when it changes — and their syncs are kept, not deleted"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return calendarOwnerMayRead(this.db, userId, task)\n',
     '    void task\n    return Promise.resolve(userId.length > 0) // BROKEN: the read rule is not asked\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-2-the-read-rule-is-not-asked: the read rule is not asked')
