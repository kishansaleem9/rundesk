# THE LIST ANSWERS "EDIT" TO EVERYBODY WHO CAN OPEN IT.
# Reddens: list-page-levels: "the API says what the list’s routes would: nothing in the view-only space, comments in the comment-only one, changes, statuses and fields where the default is Edit, and adding too where it is Full edit"
#   or "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
#   or "the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return { add, edit: spaceLevelReaches(level, 'edit'), comment: spaceLevelReaches(level, 'comment'), statuses, fields }\n"
b = "    return { add, edit: true, comment: spaceLevelReaches(level, 'comment'), statuses, fields }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-2-editing-said-to-all: the list answers "edit" to everybody who can open it')
