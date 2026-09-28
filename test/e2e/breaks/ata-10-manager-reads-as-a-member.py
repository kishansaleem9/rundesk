# THE ARCHIVED LIST READS A MANAGER AS A MEMBER: the private space's archived task is hidden from the manager the read rule lets read it.
# Reddens: archived-tasks-access: "the admin and the manager each read all three archived tasks, the private space’s included, as the task read rule lets them"
#   or "Settings offers the manager its Archived tab too, listing all three archived tasks and offering Restore on none of them, since the manager restores only in spaces they belong to"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a1 = "import { taskReadFilterFor } from '../../common/permissions/viewer-scope'\n"
b1 = "import { taskReadFilterFor } from '../../common/permissions/viewer-scope'\nimport { taskInReachFilter } from '../../common/permissions/container-access.guard-helper'\n"
assert s.count(a1) == 1, f'anchor appears {s.count(a1)} times in {p}, expected exactly 1'
s = s.replace(a1, b1)
a2 = '    const readable = await taskReadFilterFor(this.db, workspaceId, actor)\n'
b2 = '    const readable = actor ? taskInReachFilter(this.db, workspaceId, actor.id, false) : undefined\n'
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
s = s.replace(a2, b2)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-10-manager-reads-as-a-member: listArchivedTasks reads everyone as a member')
