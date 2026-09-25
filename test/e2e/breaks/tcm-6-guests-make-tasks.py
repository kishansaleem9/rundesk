# A GUEST MAY MAKE A TASK.
# Re-aimed 25 September: the create gate is stated in common/permissions/task-create.ts now, so a module TasksService depends on can ask it (`list-address-read-by-those-who-may-not-add`).
# Re-aimed 25 September: guests are no longer refused tasks outright; one adds a task where what is shared with them is Full edit (`guests-with-full-edit-make-no-tasks`). The guest here holds Edit, and the patch counts any share of a guest's as Full edit.
# Reddens: task-creation-access: "a guest makes no task from a message (403, none made) — the member, into the same list, does"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "      if (hit) return { level: hit.level as SpaceDefaultPermission, source: 'item-share' }\n"
b = "      if (hit) return { level: 'admin' as SpaceDefaultPermission, source: 'item-share' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tcm-6-guests-make-tasks: applied")
