# A ROW'S DONE CIRCLE IS OFFERED TO EVERYBODY.
# RE-AIMED 6 October: a row reads its own task’s answer now (`mayEditTask`, `found-6-oct/list-page-offers-task-edits-by-list-level`).
# Reddens: list-page-levels: "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
#   or "in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '  const caps = useListCaps()\n  const mayEdit = !!onPatchTask && caps.mayEditTask(task)\n'
b = '  const caps = { ...useListCaps(), mayProgress: (_task: unknown) => true }\n  const mayEdit = !!onPatchTask && caps.mayEditTask(task)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lpl-9-row-done-for-all: a row's done circle is offered to everybody")
