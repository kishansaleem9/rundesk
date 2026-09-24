# THE BULK EDITOR ANSWERS WITH EACH TASK AS NOBODY READS IT: every related task, whoever made the edit.
# Reddens: related-task-access: "the bulk editor’s answer names no related task the member may not open — the open one is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "          next = await this.getTask(taskId, { id: actorId })\n        }\n        updated.push(next)\n"
b = "          next = await this.getTask(taskId)\n        }\n        updated.push(next)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rta-4-bulk-answers-for-nobody: applied")
