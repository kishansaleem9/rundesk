# A ROW'S SELECTION BOX IS OFFERED TO EVERYBODY.
# Reddens: list-page-levels: "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {caps.edit ? (\n        <input\n          type="checkbox"\n          checked={selected}\n'
b = '      {true ? (\n        <input\n          type="checkbox"\n          checked={selected}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("lpl-11-row-selects-for-all: a row's selection box is offered to everybody")
