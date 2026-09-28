# THE ARCHIVED LIST ASKS THE PRIVATE-TASK RULE ALONE, AS IT DID: a member reads the archived task of a private space they are not in.
# Reddens: archived-tasks-access: "a plain member reads the workspace’s archived tasks (200): those of the open and view-only spaces, and not the one in a private space they are not in"
#   or "Settings offers a plain member its Archived tab, listing the open space’s archived task with Restore and never the private space’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a1 = "import { resolveIsManager } from '../../common/permissions/item-visibility'\n"
b1 = "import { resolveIsManager, taskVisibilityFilter } from '../../common/permissions/item-visibility'\n"
assert s.count(a1) == 1, f'anchor appears {s.count(a1)} times in {p}, expected exactly 1'
s = s.replace(a1, b1)
a2 = '    const readable = await taskReadFilterFor(this.db, workspaceId, actor)\n'
b2 = '    const readable = actor ? taskVisibilityFilter(this.db, actor.id, await resolveIsManager(this.db, workspaceId, actor.id, actor.role)) : undefined\n'
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
s = s.replace(a2, b2)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-2-listing-skips-the-container-rule: listArchivedTasks drops the container rule')
