# A MEMBER REFUSED THE TASK IS TOLD 403 (`found-30-sep/attachments-have-no-download-all`): the route is put
# behind `ResourceMemberGuard`, which refuses a private task with "This task is private" — so the refusal says
# the task is there, where a service read of a task its reader may not open answers 404.
# Reddens: task-attachments: "a member refused the task gets 404 from Download all — the same member had its zip while the task was open to them, and the admin still has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
a = "  @Get(':taskId/attachments/zip')\n  @Header('Cache-Control', 'private, no-store')\n"
b = "  @Get(':taskId/attachments/zip')\n  @UseGuards(ResourceMemberGuard)\n  @Header('Cache-Control', 'private, no-store')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.controller.ts: Download all refuses a private task with the guard\'s 403.')
