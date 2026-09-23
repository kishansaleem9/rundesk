# THE HOLE AS IT WAS: the route stops refusing and the service stops filtering, so
# the JSON body is spread into the row again and every column is writable by any
# assignee — here, the assignee makes themselves the task's creator.
# Reddens: task-boundaries: "an assignee cannot make themselves the creator — which is itself a grant of write access"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts"
a = "    const unknown = unknownUpdateFields(body)\n    if (unknown.length > 0) {\n      throw new BadRequestException(\n        `These fields cannot be changed here: ${unknown.join(', ')}.` +\n          (unknown.includes('listId') ? ' To move a task to another list, use POST /tasks/:taskId/move.' : ''),\n      )\n    }"
b = "    // (unknown fields are no longer refused here)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    patch = pickUpdatable(patch)\n"
b = "    // patch is no longer filtered\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-2-both-layers-spread: applied")
