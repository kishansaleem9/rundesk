# A STATUS CHANGE IS TAKEN FOR AN EDIT: a "comment" space's assignee cannot finish their own task.
# Reddens: task-space-levels: "in a “comment” space a member comments and changes the status of a task assigned to them — but not its title (403, unchanged)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const statusOnly = Object.keys(patch).every((k) => k === 'status' || k === 'position')\n"
b = '    const statusOnly = false && Object.keys(patch).length === 0\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsl-3-status-needs-edit: applied")
