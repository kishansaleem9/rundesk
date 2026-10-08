# THE PLATFORM'S ADMIN MAKES A TASK IN A WORKSPACE IT IS NO MEMBER OF AGAIN
# (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`): the create
# gate lets it through on the read rule, where the write rule refuses it.
# Reddens: refused-as-forbidden: "the platform’s admin, no member of a workspace, makes no task there, imports nothing and changes none, each refused 403 “You are not a member of this workspace” with nothing written (SQL) — as before, it may read there"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = "  if (list.role === 'super_admin' && !(await isWorkspaceMember(db, home.workspaceId, actorId))) {\n"
b = "  if (list.role === 'super_admin' && actorId === '' && !(await isWorkspaceMember(db, home.workspaceId, actorId))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-16-a-platform-admin-makes-a-task-where-it-is-no-member: the create gate asks no membership of the platform admin')
