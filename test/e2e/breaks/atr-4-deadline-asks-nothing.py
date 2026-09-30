# A DEADLINE FOR A TASK BY ID ASKS NOTHING OF THE TASK: its assignees and their load are read for whoever names it.
# Reddens: ai-task-reads: "a deadline is suggested for no task its asker may not open (404 each, as for a task that is not there) — and the workload it weighs counts, for a member, only the tasks they may open: one of the busy member’s three, where the admin’s counts all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = "    // the same with a model or without (`ai-task-paths-skip-the-read-rule`).\n    if (body.taskId) await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })\n    await this.ai.assertAvailable('task.deadline', { userId: user.id, workspaceId: body.workspaceId })\n"
b = "    // the same with a model or without (`ai-task-paths-skip-the-read-rule`).\n    await this.ai.assertAvailable('task.deadline', { userId: user.id, workspaceId: body.workspaceId })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atr-4-deadline-asks-nothing: the deadline asks nothing of the task')
