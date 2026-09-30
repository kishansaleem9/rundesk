# THE PRIVATE PROJECT AS A DESTINATION. The space is editable, the project inside
# it is private, and a task is moved into a place its mover cannot see.
# RE-ANCHORED (`found-30-sep/private-task-reads-say-403`): the target asks `readableList` as a super admin would —
# nothing of its mover.
# Reddens: task-boundaries: "and so is a list in a private project the caller cannot see, in a space they may otherwise edit: NOT FOUND, in the words a list in another workspace gets"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      ? await readableList(this.db, access.workspaceId, targetListId, { id: actorId, role: account?.role ?? null })\n'
b = "      ? await readableList(this.db, access.workspaceId, targetListId, { id: actorId, role: 'super_admin' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tb-11-move-skips-visibility: applied')
