# A TASK BY ID ASKS ONLY THE WORKSPACE AGAIN: whoever belongs to it has any task summarised, streamed or weighed for a deadline.
# Reddens: ai-task-reads: "a task is summarised for nobody who may not open it — a guest it is not shared with, a member refused its private list (403 each, nothing of it sent to a model) — and for a member who reads it, it is"
#   or "a streamed summary is refused as the summary is — to the guest and to the member refused the private list (403 each, nothing sent) — and streamed for the member who reads the task"
#   or "a deadline is suggested for no task its asker may not open (403 each) — and the workload it weighs counts, for a member, only the tasks they may open: one of the busy member’s three, where the admin’s counts all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (!(await readableTask(this.db, workspaceId, taskId, reader))) {\n"
b = "    if (!(await this.memberRole(workspaceId, reader.id))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atr-1-task-asks-the-workspace: a task by id asks the workspace alone')
