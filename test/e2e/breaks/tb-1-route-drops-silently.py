# THE ROUTE STOPS SAYING NO. The service still keeps only its fields, so nothing
# unwanted is written — and the caller who sent `listId` expecting a move gets a
# 200 and no move, which is the dead control the refusal-by-name exists to prevent.
# Reddens: task-boundaries: "listId is refused — with the move route named — and the task stays in its list"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts"
a = "    const unknown = unknownUpdateFields(body)\n    if (unknown.length > 0) {\n      throw new BadRequestException(\n        `These fields cannot be changed here: ${unknown.join(', ')}.` +\n          (unknown.includes('listId') ? ' To move a task to another list, use POST /tasks/:taskId/move.' : ''),\n      )\n    }"
b = "    // (unknown fields are no longer refused here)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-1-route-drops-silently: applied")
