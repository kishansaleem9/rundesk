# THE WORKSPACE'S CALENDARS ARE READ, NOT THE CALLER'S: a colleague reads somebody's appointments (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "a colleague in the same workspace reads none of them: the route answers the caller’s own calendars alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-accounts.service.ts'
a = '        and(\n          eq(userCalendarAccounts.userId, userId),\n          eq(userCalendarAccounts.workspaceId, workspaceId),\n          eq(userCalendarAccounts.countsAsBusy, true),\n'
b = '        and(\n          eq(userCalendarAccounts.workspaceId, workspaceId),\n          eq(userCalendarAccounts.countsAsBusy, true),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ccl-4-a-colleague-reads-them: the workspace's calendars are read, not the caller's: a colleague reads somebody's appointments (`found-25-sep/connected-calendars-read-by-nothing`)")
