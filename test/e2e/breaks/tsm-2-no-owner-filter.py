# MINE WITHOUT AN OWNER: the week is asked for without userId and kept without
# checking whose it is.
# Reddens: timesheet-mine: "the week’s log lists the admin’s entry and nobody else’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = '`/workspaces/${workspaceId}/time-entries?userId=${currentUserId}&since='
b = '`/workspaces/${workspaceId}/time-entries?since='
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
a = '        (e) => e.userId === currentUserId && weekDayKeys.has('
b = '        (e) => weekDayKeys.has('
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsm-2-no-owner-filter: applied")
