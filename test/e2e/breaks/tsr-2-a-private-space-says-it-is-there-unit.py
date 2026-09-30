# THE TASK READ RULE SAYS 403 "This space is private" AGAIN.
# Reddens: unit: tasks-security.test.ts "refuses a workspace member who is not a member of the task's private space as the task that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (refusal) return null\n'
b = "    if (refusal) throw new ForbiddenException('This space is private')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsr-2-a-private-space-says-it-is-there-unit: the task read rule refuses a private space with 403')
