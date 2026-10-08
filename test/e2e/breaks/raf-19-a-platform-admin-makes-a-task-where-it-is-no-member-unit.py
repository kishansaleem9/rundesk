# THE CREATE GATE ASKS A PLATFORM ADMIN NO MEMBERSHIP AGAIN, as `raf-16`, for the gate's unit test
# (`found-6-oct/super-admin-outside-makes-what-it-cannot-change`).
# Reddens: unit: task-create.test.ts "refuses a platform super_admin who is no member of the list’s workspace, 403 “You are not a member of this workspace”"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = "  if (list.role === 'super_admin' && !(await isWorkspaceMember(db, home.workspaceId, actorId))) {\n"
b = "  if (list.role === 'super_admin' && actorId === '' && !(await isWorkspaceMember(db, home.workspaceId, actorId))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-19: the create gate asks no membership (unit)')
