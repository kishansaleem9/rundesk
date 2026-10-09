# NOTHING COMES OFF A CALENDAR: a task no sync holds any more keeps its event.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "a task in a place no sync holds is not written; moved out of the folder its event comes off, and moved back it is written again"
#   or "a task whose due date is cleared comes off the calendar, and so does an archived one"
#   or "a sync of only the tasks assigned to its owner takes a task once they are assigned it, and gives it up when they are not"
#   or "removing the sync on the page takes its events off the calendar, and a change to a task there afterwards writes nothing"
#   or "once the member has left the workspace their sync writes nothing more — the task it held comes off their calendar when it changes — and their syncs are kept, not deleted"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const leaving = had.filter((e) => !wanted.has(e.accountId) && only(e.accountId))\n',
     "    const leaving = had.filter((e) => !wanted.has(e.accountId) && only(e.accountId) && process.env.CSR_NEVER === 'yes') // BROKEN: nothing comes off\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-8-nothing-comes-off: nothing comes off')
