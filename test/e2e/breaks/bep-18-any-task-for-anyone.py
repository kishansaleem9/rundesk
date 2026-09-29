# ANY TASK, FOR ANYONE, FROM ANY WORKSPACE: the chat route asks nothing of the task it is given before it answers.
# Reddens: brain-entry-points: "a turn about a task is refused before anything is streamed when the task is not there (404) or is not in the workspace the turn names (400), with or without a model"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = '    if (body.taskId) {\n      const taskWorkspace = await this.ai.assertTaskReadable('
b = '    if (body.taskId && Boolean(0)) {\n      const taskWorkspace = await this.ai.assertTaskReadable('
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bep-18-any-task-for-anyone: the task rule is skipped')
