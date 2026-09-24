# A SPRINT TAKES ANY TASK ID, as it did.
# Reddens: lookup-read-access: "a sprint cannot take a task of another workspace, nor of a space the member is refused (404 each, not added) — while it takes an open task"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "    if (!task) throw new NotFoundException('Task not found')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-8-sprint-takes-any-task: applied")
