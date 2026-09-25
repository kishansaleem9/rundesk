# THE SUMMARY ASKS THE MODEL FIRST: where none is configured, a refused reader is told "not configured" rather than refused.
# Reddens: ai-task-reads: "a task is summarised for nobody who may not open it — a guest it is not shared with, a member refused its private list (403 each, nothing of it sent to a model) — and for a member who reads it, it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = "    if (body.taskId) await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })\n    await this.ai.assertAvailable('summarize', { userId: user.id, workspaceId: body.workspaceId })\n"
b = "    await this.ai.assertAvailable('summarize', { userId: user.id, workspaceId: body.workspaceId })\n    if (body.taskId) await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atr-2-summary-asks-after-the-model: the summary asks the model first')
