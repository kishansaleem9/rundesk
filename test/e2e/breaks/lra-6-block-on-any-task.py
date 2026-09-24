# A BLOCK ON ANY TASK ID, as it was: the comment said this workspace, the query asked only that it exist.
# Reddens: lookup-read-access: "a planner block cannot point at a task of another workspace, nor of a space the member is refused (404 each, no block) — while it points at an open task"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = "      if (!readable.has(body.taskId)) throw new NotFoundException('Task not found')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-6-block-on-any-task: applied")
