# The opposite drift: every field created from a task is pinned to that task's
# list, so asking for one across the project silently gets a narrower field
# than the person chose.
# Reddens: task-field-create — "`scope: project` leaves the definition unscoped to any one list",
#          "the new field appears on the task that made it AND on a task in the sibling list"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "      listId: scope === 'list' ? task.listId : undefined,"
b = "      listId: task.listId,"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("custom-fields.service.ts: every field created from a task is now pinned to that task's list.")
