# A SYNC NAMES A COLLEAGUE'S CALENDAR.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "a place the member may not open is refused, saying so — a private space they are not in, 403 — one that is not there is 404, a colleague’s calendar is not found, the same place twice to one calendar is refused; and the member is shown their own syncs alone"
#   or "once the member has left the workspace their sync writes nothing more — the task it held comes off their calendar when it changes — and their syncs are kept, not deleted"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        eq(userCalendarAccounts.userId, actorId),\n',
     "        // BROKEN: anybody's calendar\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("csr-12-a-colleagues-calendar-is-taken: a colleague's calendar is taken")
