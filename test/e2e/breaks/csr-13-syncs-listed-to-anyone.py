# EVERYBODY'S SYNCS ARE LISTED TO EACH MEMBER.
# (`ledger-rows/row-1962`)
# Re-aimed 8 October: Sync now reads the person's syncs in the same words (`ledger-rows/row-1904`); the listing's own order names this one.
# Reddens: calendar-sync-rules: "a place the member may not open is refused, saying so — a private space they are not in, 403 — one that is not there is 404, a colleague’s calendar is not found, the same place twice to one calendar is refused; and the member is shown their own syncs alone"
#   or "removing the sync on the page takes its events off the calendar, and a change to a task there afterwards writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      .where(and(eq(calendarSyncRules.workspaceId, workspaceId), eq(calendarSyncRules.userId, actorId)))\n      .orderBy(asc(calendarSyncRules.createdAt), asc(calendarSyncRules.id))\n',
     "      .where(eq(calendarSyncRules.workspaceId, workspaceId)) // BROKEN: everybody's syncs\n      .orderBy(asc(calendarSyncRules.createdAt), asc(calendarSyncRules.id))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-13-syncs-listed-to-anyone: syncs listed to anyone')
