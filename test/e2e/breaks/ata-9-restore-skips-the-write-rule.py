# RESTORING AN ARCHIVED TASK ASKS NO WRITE RULE: a member restores the view-only space's task, and the private space's they cannot open.
# Reddens: archived-tasks-access: "a member restores the archived task of a space they may edit (2xx, back in its list), and is refused the view-only space’s (403) and the private space’s (404), which stay archived"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    // allowArchived: this is the one operation that exists for binned tasks.\n    await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true })\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-9-restore-skips-the-write-rule: restoreTask skips the write rule')
