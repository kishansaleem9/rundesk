# THE ACCOUNT'S ROLE IS TAKEN FOR THE WORKSPACE'S: anyone at all passes the list rule, a stranger included.
# Re-aimed 25 September: the create gate is stated in common/permissions/task-create.ts now, so a module TasksService depends on can ask it (`list-address-read-by-those-who-may-not-add`).
# Reddens: task-creation-access: "a user of another organisation makes no task in this workspace’s list from a message of their own (not found, none made) — in their own list, they do"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  const list = await readableList(db, home.workspaceId, listId, { id: actorId, role: account?.role })\n'
b = "  const list = await readableList(db, home.workspaceId, listId, { id: actorId, role: 'super_admin' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tcm-3-account-role-for-workspace-role: applied")
