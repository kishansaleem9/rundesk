# THE STREAMED SUMMARY ASKS NOTHING OF THE TASK: it is built for whoever names it.
# Reddens: ai-task-reads: "a streamed summary is refused as the summary is — to the guest and to the member refused the private list (404 each, nothing sent) — and streamed for the member who reads the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = "    // Before the model's availability, as the summary asks it: a task named by\n    // id is summarised only for someone who may open it.\n    if (body.taskId) await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atr-3-stream-asks-nothing: the stream asks nothing of the task')
