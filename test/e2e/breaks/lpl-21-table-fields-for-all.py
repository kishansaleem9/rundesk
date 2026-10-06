# THE TABLE'S FIELD CELLS OPEN FOR EVERYBODY.
# RE-AIMED 6 October: a row reads its own task’s answer now (`mayEditTask`, `found-6-oct/list-page-offers-task-edits-by-list-level`).
# Reddens: list-page-levels: "the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '                    const editable = INLINE_EDITABLE_TYPES.has(field.type) && caps.mayEditTask(task)\n'
b = '                    const editable = INLINE_EDITABLE_TYPES.has(field.type)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lpl-21-table-fields-for-all: the table's field cells open for everybody")
