# ONE PATH OF TWO. Update checks where the parent lives and create does not, so
# the foreign subtask comes in through POST /tasks instead.
# Reddens: task-boundaries: "and creating a subtask under one is refused the same way, with nothing written"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "      // …and it has to live where the new task will. See assertParentInWorkspace.\n      const home = await this.resolveWorkspaceForList(data.listId)\n      if (!home) throw new NotFoundException('List not found')\n      await this.assertParentInWorkspace(data.parentTaskId, home.workspaceId, data.createdById)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-8-create-skips-parent-rule: applied")
