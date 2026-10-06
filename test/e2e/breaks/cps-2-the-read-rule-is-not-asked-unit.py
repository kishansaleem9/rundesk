# A MEMBER'S CONNECTION TAKES EVERY TASK: the read rule is not asked.
# Reddens: unit: calendar-sync.service.test.ts "is no for a member refused the task’s private space"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    return (await readableTask(this.db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null\n'
b = '    void account\n    return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cps-2-the-read-rule-is-not-asked-unit: the read rule is not asked')
