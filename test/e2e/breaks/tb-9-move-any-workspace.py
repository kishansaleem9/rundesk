# THE MOVE WITHOUT ITS BOUNDARY. A member of two workspaces moves a task from one
# into the other — every other check passes, because they belong to both.
# RE-ANCHORED (`found-30-sep/private-task-reads-say-403`): the target is read by `readableList` in the task's
# workspace; this reads it in the target's own.
# Reddens: task-boundaries: "a list in another workspace is NOT FOUND — even for a caller who belongs to both"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      ? await readableList(this.db, access.workspaceId, targetListId, { id: actorId, role: account?.role ?? null })\n'
b = '      ? await readableList(this.db, (await this.workspaceIdForList(targetListId)) ?? access.workspaceId, targetListId, { id: actorId, role: account?.role ?? null })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tb-9-move-any-workspace: applied')
