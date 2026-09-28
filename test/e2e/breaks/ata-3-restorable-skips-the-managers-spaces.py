# THE ARCHIVED LIST'S canRestore FORGETS A MANAGER'S OWN-SPACES SCOPE: every row says a manager may restore it, where the route refuses them.
# Reddens: archived-tasks-access: "each archived row says whether its reader may restore it: the member the open space’s and not the view-only one’s, the admin all three, the manager none (they belong to none of these spaces)"
#   or "Settings offers the manager its Archived tab too, listing all three archived tasks and offering Restore on none of them, since the manager restores only in spaces they belong to"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-restore.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await assertManagerTaskScope(db, taskId, actorId)\n    return true\n'
b = '    return true\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-3-restorable-skips-the-managers-spaces: taskRestorable skips the manager scope')
