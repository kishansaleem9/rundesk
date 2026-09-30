# THE AI READS NO TASK FOR ANYBODY: a refusal test passes it, so the test also asks that the task's maker is
# answered.
# Reddens: unit: task-readable.test.ts "and its maker, who may open it, is answered with its workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (!(await readableTask(this.db, workspaceId, taskId, reader))) {\n      throw new NotFoundException('Task not found')\n    }\n"
b = "    if (true) {\n      throw new NotFoundException('Task not found')\n    }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ait-2-the-ai-reads-no-task-unit: the AI reads no task')
