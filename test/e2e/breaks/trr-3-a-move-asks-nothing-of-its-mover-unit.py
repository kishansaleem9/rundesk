# A MOVE'S TARGET ASKS NOTHING OF ITS MOVER (`readableList` as a super admin), so a member moves their task into
# another's private list — the 201 measured before the fix.
# Reddens: unit: tasks-refused-reads.test.ts "refuses another’s private list in an open space as a list that is not there, and moves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      ? await readableList(this.db, access.workspaceId, targetListId, { id: actorId, role: account?.role ?? null })\n'
b = "      ? await readableList(this.db, access.workspaceId, targetListId, { id: actorId, role: 'super_admin' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-3-a-move-asks-nothing-of-its-mover-unit: a move asks nothing of its mover')
