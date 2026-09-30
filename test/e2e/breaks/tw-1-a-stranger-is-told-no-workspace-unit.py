# `ram-14`'s edit, claimed by the unit test beside the write rule.
# Reddens: unit: task-write.test.ts "tells a user of another organisation the task is not there, in the words of an id naming nothing"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = "  if (!membership) throw notThere()\n"
b = "  if (!membership) throw new NotFoundException('Workspace not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tw-1-a-stranger-is-told-no-workspace-unit: the write rule tells a stranger "Workspace not found"')
