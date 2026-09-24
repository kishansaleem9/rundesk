# A MEETING LINKS TO ANY TASK OF THE WORKSPACE, as it did: the private one its maker is refused included.
# Reddens: meeting-access: "a meeting can be linked only to a task its maker may open: the private task is not found and no meeting is made — the open task links (201)"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '    if (!(await readableTask(this.db, workspaceId, taskId, { id: userId }))) {\n'
b = "    if (!(await readableTask(this.db, workspaceId, taskId, { id: userId, role: 'super_admin' }))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mtg-4-link-any-task: applied")
