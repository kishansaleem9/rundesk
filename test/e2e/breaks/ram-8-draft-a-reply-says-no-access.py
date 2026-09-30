# DRAFT A REPLY SAYS 403 "You do not have access to this task" AGAIN, where an id naming nothing is 404.
# Reddens: refused-as-missing: "Draft a reply refuses a task the member may not open as a task that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (!(await readableTask(this.db, workspaceId, taskId, reader))) {\n      throw new NotFoundException('Task not found')\n    }\n"
b = "    if (!(await readableTask(this.db, workspaceId, taskId, reader))) {\n      throw new ForbiddenException('You do not have access to this task')\n    }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-8-draft-a-reply-says-no-access: the AI read refuses with 403')
