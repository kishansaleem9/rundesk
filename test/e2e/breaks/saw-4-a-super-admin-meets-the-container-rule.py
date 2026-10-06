# THE TASKS MODULE’S READ GATE ASKS A SUPER_ADMIN MEMBER THE CONTAINER RULE BY THEIR WORKSPACE ROLE, as it did: a
# subtask under a private space’s task, following it, linking it and listing its files are refused (403).
# Reddens: super-admin-task-writes: "and the private space’s task takes the super_admin’s other edits too — a subtask under it, themself as its assignee and follower, another task blocked by it (each made, SQL) — and its files and linked docs are listed to them (200)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (membership.accountRole === 'super_admin') return { ...ctx, workspaceRole: membership.role as string, superAdmin: true }\n\n    // The shared rule (`containerRefusal`), answered in the words of whichever\n    // container refused; managers pass it. This restated the rule to keep its\n    // messages, and missed a private folder the day the rule learnt one.\n    const withRole = { ...ctx, workspaceRole: membership.role as string, superAdmin: false }\n"
b = "    // The shared rule (`containerRefusal`), answered in the words of whichever\n    // container refused; managers pass it. This restated the rule to keep its\n    // messages, and missed a private folder the day the rule learnt one.\n    const withRole = { ...ctx, workspaceRole: membership.role as string, superAdmin: membership.accountRole === 'super_admin' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('saw-4-a-super-admin-meets-the-container-rule: a super_admin member meets the container rule')
