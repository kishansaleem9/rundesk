# THE TASKS MODULE’S READ GATE ASKS A SUPER_ADMIN MEMBER THE PRIVATE-LIST RULE, as it did.
# Reddens: unit: tasks-security.test.ts "and a task in another member’s private list"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    // A super_admin opens every private list and task, as the read rule lets them (below).\n    if (access.superAdmin) return access\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tss-2-a-super-admin-meets-the-private-list-rule-unit: a super_admin member meets the private-list rule')
