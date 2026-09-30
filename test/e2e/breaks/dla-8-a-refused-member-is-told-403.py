# A MEMBER REFUSED THE TASK IS TOLD 403 (`found-30-sep/attachments-have-no-download-all`): Download all refuses a
# task its reader may not open with "This task is private", which says the task is there.
#
# RE-AIMED (`found-30-sep/private-task-reads-say-403`): this put the route behind `ResourceMemberGuard`, which
# answered 403 then; the guard answers 404 now, so that edit reddened nothing. The service's own refusal is the
# edit.
# Reddens: task-attachments: "a member refused the task gets 404 from Download all — the same member had its zip while the task was open to them, and the admin still has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const task = await this.taskOpenTo(taskId, reader)\n    if (!task) throw new NotFoundException('Task not found')\n"
b = "    const task = await this.taskOpenTo(taskId, reader)\n    if (!task) throw new ForbiddenException('This task is private')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-8-a-refused-member-is-told-403: Download all refuses with 403')
