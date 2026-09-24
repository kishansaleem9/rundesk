# AN EDIT ANSWERS WITH THE TASK AS NOBODY READS IT: every related task, whoever made the edit.
# Reddens: related-task-access: "the answer to the member’s own edit names no related task they may not open either — the open one is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      return hydrated\n    }\n\n    return this.getTask(taskId, { id: actorId })\n  }\n'
b = '      return hydrated\n    }\n\n    return this.getTask(taskId)\n  }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rta-3-edit-answers-for-nobody: applied")
