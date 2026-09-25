# A SUBTASK'S DONE CIRCLE IS OFFERED TO EVERYBODY.
# Reddens: list-page-levels: "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const caps = useListCaps()\n  const done = subtask.statusCategory === 'closed' || subtask.status === 'done'\n"
b = "  const caps = { ...useListCaps(), edit: true }\n  const done = subtask.statusCategory === 'closed' || subtask.status === 'done'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("lpl-14-subtask-done-for-all: a subtask's done circle is offered to everybody")
