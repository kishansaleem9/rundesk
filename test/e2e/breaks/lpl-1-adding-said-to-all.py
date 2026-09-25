# THE LIST ANSWERS "ADD" TO EVERYBODY WHO CAN OPEN IT.
# Reddens: list-page-levels: "the API says what the list’s routes would: nothing in the view-only space, comments in the comment-only one, changes, statuses and fields where the default is Edit, and adding too where it is Full edit"
#   or "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
#   or "where the default is Edit the rows are theirs to change — a new priority saves — with Statuses and Create field, and there is no Add task or add row, since adding takes Full edit"
#   or "in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      this.canCreateTaskIn(listId, actor.id),\n'
b = '      Promise.resolve(true),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-1-adding-said-to-all: the list answers "add" to everybody who can open it')
