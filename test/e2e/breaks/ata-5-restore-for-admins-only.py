# SETTINGS OFFERS RESTORE TO AN ADMIN ALONE, AS WHEN THE TAB WAS AN ADMIN'S: the member is offered no Restore on the task they may restore.
# Reddens: archived-tasks-access: "Settings offers a plain member its Archived tab, listing the open space’s archived task with Restore and never the private space’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {task.canRestore ? (\n'
b = '              {isAdmin ? (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-5-restore-for-admins-only: Archived offers Restore by isAdmin')
