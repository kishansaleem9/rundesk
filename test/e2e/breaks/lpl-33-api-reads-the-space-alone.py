# THE LIST'S ANSWER FOR EDIT AND COMMENT IS THE SPACE'S DEFAULT, NOT THE READER'S LEVEL.
# Reddens: list-page-levels: "the API says what the list’s routes would: nothing in the view-only space, comments in the comment-only one, changes, statuses and fields where the default is Edit, and adding too where it is Full edit"
#   or "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
#   or "in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task"
#   or "the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const level = resolved?.level ?? 'admin'\n    return { add,"
b = "    const level = resolved ? 'admin' : 'admin'\n    return { add,"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("lpl-33-api-reads-the-space-alone: the list's answer for edit and comment is the space's default, not the reader's level")
