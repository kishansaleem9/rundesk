# THE READ RULE IS ASKED WITHOUT THE ACCOUNT'S ROLE: a platform admin's connection is refused what they may open.
# Reddens: unit: calendar-sync.service.test.ts "is yes for a member who may open it — here a platform admin, by their account’s role"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    return (await readableTask(this.db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null\n'
b = '    return (await readableTask(this.db, task.workspaceId, task.id, { id: ownerId, role: account ? null : null })) !== null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cps-4-the-read-rule-without-the-account-role-unit: the read rule is asked with no role')
