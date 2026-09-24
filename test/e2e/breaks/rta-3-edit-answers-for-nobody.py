# AN EDIT ANSWERS WITH THE TASK AS NOBODY READS IT: every related task, whoever made the edit.
#
# RE-AIMED. As first written it changed the last line of `updateTask`, the
# `return this.getTask(...)` reached only when the list has no workspace, which
# no edit reaches: 3 passed, 0 failed (lane 2, 7f37f7b). The edit's answer is
# the `hydrated` read inside the workspace branch, so that is what it changes now.
# Reddens: related-task-access: "the answer to the member’s own edit names no related task they may not open either — the open one is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      const hydrated = await this.getTask(taskId, { id: actorId })\n      if (!hydrated) throw new NotFoundException('Task not found')\n      if (patch.status && patch.status !== before.status) {\n"
b = "      const hydrated = await this.getTask(taskId)\n      if (!hydrated) throw new NotFoundException('Task not found')\n      if (patch.status && patch.status !== before.status) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rta-3-edit-answers-for-nobody: applied")
