# A TASK MADE IN ANOTHER MEMBER’S PRIVATE LIST MAY NOT BE BORN ASSIGNED TO A SUPER_ADMIN MEMBER, as it could not:
# "That person can’t see this task".
# Reddens: super-admin-task-writes: "and so does a task in another member’s private list, and a task made there assigned to themself (SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '            { userId, isManager: access.superAdmin || isManagerRole(access.workspaceRole) },\n'
b = '            { userId, isManager: isManagerRole(access.workspaceRole) },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('saw-6-a-super-admin-is-not-born-assigned: a super_admin member is not born assigned in a private list')
