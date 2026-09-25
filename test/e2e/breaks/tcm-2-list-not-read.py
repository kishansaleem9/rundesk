# THE LIST IS NOT READ: a member may make a task in any list of a workspace they belong to.
# Re-aimed 25 September: the create gate is stated in common/permissions/task-create.ts now, so a module TasksService depends on can ask it (`list-address-read-by-those-who-may-not-add`).
# Reddens: task-creation-access: "an AI plan’s create_task into a list the member may not open is not carried out and makes nothing — into the open list it is"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  const list = await readableList(db, home.workspaceId, listId, { id: actorId, role: account?.role })\n'
b = "  const list = { role: 'member' as string }\n  void readableList\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tcm-2-list-not-read: applied")
