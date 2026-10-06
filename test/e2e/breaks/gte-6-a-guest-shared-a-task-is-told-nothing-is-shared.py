# A GUEST REFUSED A LIST IS TOLD NOTHING HERE IS SHARED again, though a task in it is.
# Reddens: guest-task-edits: "a guest refused a list where only tasks are shared with them is told only a task here is shared with them — and a list where nothing is shared is refused without saying a task is; neither list is renamed"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "  const below = resolved.source === 'guest-default' ? await sharedBelow(db, params) : null\n"
b = "  const below: 'project' | 'list' | 'task' | null = null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gte-6-a-guest-shared-a-task-is-told-nothing-is-shared: space-default-permission.ts: a guest is told nothing is shared, whatever is shared below.')
