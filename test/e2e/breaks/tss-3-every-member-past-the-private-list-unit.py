# EVERY PLAIN MEMBER IS LET PAST THE PRIVATE-LIST RULE, as a super_admin is.
# Reddens: unit: tasks-security.test.ts "while a plain member is still refused that private list"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (access.superAdmin) return access\n'
b = "    if (access.superAdmin || access.workspaceRole === 'member') return access\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tss-3-every-member-past-the-private-list-unit: every member passes the private-list rule')
