# A TASK'S OLD DESCRIPTIONS HAVE NO GUARD AGAIN.
# Reddens: task-rows-by-id: "a task’s old descriptions are read as the task is: not by somebody from another organisation, nor by a member refused its private space — while a member reads an open task’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Get(':taskId/description-history')\n  @UseGuards(ResourceMemberGuard)\n"
b = "  @Get(':taskId/description-history')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("trb-7-history-unguarded: a task's old descriptions have no guard again")
