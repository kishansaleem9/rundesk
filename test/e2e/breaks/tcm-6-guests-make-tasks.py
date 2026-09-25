# A GUEST MAY MAKE A TASK.
# Re-aimed 25 September: the create gate is stated in common/permissions/task-create.ts now, so a module TasksService depends on can ask it (`list-address-read-by-those-who-may-not-add`).
# Reddens: task-creation-access: "a guest makes no task from a message (403, none made) — the member, into the same list, does"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = "  if (list.role === 'guest') throw new ForbiddenException('Guests cannot create tasks')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tcm-6-guests-make-tasks: applied")
