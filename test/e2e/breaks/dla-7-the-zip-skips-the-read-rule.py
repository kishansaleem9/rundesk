# DOWNLOAD ALL SKIPS THE READ RULE (`found-30-sep/attachments-have-no-download-all`): the route has no guard
# of its own and the service no longer asks `readableTask`, so any account that knows a task's id is handed its
# files, a private task's to a member it is private from.
# Reddens: task-attachments: "a member refused the task gets 404 from Download all — the same member had its zip while the task was open to them, and the admin still has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    return (await readableTask(this.db, row.workspaceId, taskId, { id: reader.id, role: reader.role ?? null }))\n"
b = "    return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: Download all hands any task\'s files to whoever asks.')
