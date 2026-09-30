# THE VALUE ROUTE ASKS ONLY THAT THE FIELD IS OF THE TASK'S PROJECT (`found-30-sep/field-route-takes-another-projects-field`): a field scoped to
# another list of that project takes a value onto the task (200), which no reader of the task shows.
# Reddens: custom-field-access: "and a value for a field scoped to another list of the task’s project is refused (404, nothing written) — while a field scoped to the task’s own list is set, and the task’s fields read it back"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (!fieldIsOnTask(def, task)) throw new NotFoundException('Custom field not found on this task')\n"
b = "    if (def.projectId !== task.projectId) throw new NotFoundException('Custom field not found on this task') // BROKEN: the project alone\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-1-the-route-asks-the-project-alone: the value route takes a field scoped to another list of the task’s project")
