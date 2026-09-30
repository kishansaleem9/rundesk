# A READER REFUSED THE TASK IS TOLD 403 (`found-30-sep/attachments-have-no-download-all`): Download all
# refuses a task its reader may not open with "This task is private", which says the task is there, where
# every service read of such a task answers as for a task that is not.
# Reddens: unit: tasks-attachments-zip.test.ts "answers a reader who may not open the task with 404, as a task that is not there, and reads nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const task = await this.taskOpenTo(taskId, reader)\n    if (!task) throw new NotFoundException('Task not found')\n"
b = "    const task = await this.taskOpenTo(taskId, reader)\n    if (!task) throw new ForbiddenException('This task is private')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-17-a-refused-reader-is-told-403-unit: attachmentsZip refuses with 403')
