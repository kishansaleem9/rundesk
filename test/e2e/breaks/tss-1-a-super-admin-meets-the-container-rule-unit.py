# THE TASKS MODULE’S READ GATE ASKS A SUPER_ADMIN MEMBER THE CONTAINER RULE BY THEIR WORKSPACE ROLE, as it did.
# Reddens: unit: tasks-security.test.ts "lets a super_admin who is a plain member read a private space’s task, as the read rule does"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (membership.accountRole === 'super_admin') return { ...ctx, workspaceRole: membership.role as string, superAdmin: true }\n\n    // The shared rule (`containerRefusal`), answered in the words of whichever\n    // container refused; managers pass it. This restated the rule to keep its\n    // messages, and missed a private folder the day the rule learnt one.\n    const withRole = { ...ctx, workspaceRole: membership.role as string, superAdmin: false }\n"
b = "    // The shared rule (`containerRefusal`), answered in the words of whichever\n    // container refused; managers pass it. This restated the rule to keep its\n    // messages, and missed a private folder the day the rule learnt one.\n    const withRole = { ...ctx, workspaceRole: membership.role as string, superAdmin: membership.accountRole === 'super_admin' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tss-1-a-super-admin-meets-the-container-rule-unit: a super_admin member meets the container rule')
