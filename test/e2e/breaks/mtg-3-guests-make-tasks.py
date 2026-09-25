# A GUEST IS LET THROUGH TO THE MODEL, and refused only by createTask after it has answered.
# Re-aimed 25 September: the create gate is stated in common/permissions/task-create.ts now, so a module TasksService depends on can ask it (`list-address-read-by-those-who-may-not-add`).
# Reddens: meeting-access: "a guest, who may not make tasks, is refused (403) before any model is asked — the member, into the same list, is let through"
import io
# Re-anchored when the meeting's destination check became the one rule for
# making a task (`TasksService.assertCanCreateTaskIn`, found-24-sep/task-makers-skip-the-list-rule):
# the guest line is there now, and removing it lets the guest through to the model.
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = "  if (list.role === 'guest') throw new ForbiddenException('Guests cannot create tasks')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mtg-3-guests-make-tasks: applied")
