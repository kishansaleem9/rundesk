# THE TASKS MODULE’S READ GATE ASKS A SUPER_ADMIN MEMBER THE PRIVATE-LIST RULE, as it did: a task in another
# member’s private list takes none of their other edits.
# Reddens: super-admin-task-writes: "and so does a task in another member’s private list, and a task made there assigned to themself (SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    // A super_admin opens every private list and task, as the read rule lets them (below).\n    if (access.superAdmin) return access\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('saw-5-a-super-admin-meets-the-private-list-rule: a super_admin member meets the private-list rule')
